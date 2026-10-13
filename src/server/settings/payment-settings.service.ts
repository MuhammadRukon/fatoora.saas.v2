import { CodFeeType, PaymentMethod, type Prisma, type PaymentSettings } from '@prisma/client';

import {
  canonicalMethods,
  parseCloudinaryUploadUrl,
  type PaymentSettingsInput,
  type PublicPaymentConfig,
} from '@/contracts/payment-settings';
import { prisma } from '@/lib/prisma';
import type { PaymentMethodUnavailableMeta } from '@/contracts/checkout';
import { BadRequestError } from '@/server/common/errors';
import { log } from '@/server/common/logger';
import { CLOUDINARY_FOLDER } from '@/server/media/cloudinary';
import { mediaService } from '@/server/media/media.service';
import { gatewayConfigured } from '@/server/payments/gateway-creds';

/** Either the global client or an in-flight `prisma.$transaction` callback client. */
type Db = typeof prisma | Prisma.TransactionClient;

const PAYMENT_SETTINGS_ID = 'singleton';

/** Folder segment (under CLOUDINARY_FOLDER) the admin uploader uses for the QR. */
const QR_FOLDER = 'settings';

/**
 * Server-side half of the QR validation (the contract only checks shape):
 * the image must live on OUR Cloudinary cloud and its public id must sit in
 * the folder the uploader writes to. The public id is later passed to
 * `mediaService.deleteImage`, so an arbitrary value would let an admin
 * session delete unrelated assets.
 */
function assertTrustedQrImage(input: Pick<PaymentSettingsInput, 'qrImageUrl' | 'qrImagePublicId'>) {
  const { qrImageUrl, qrImagePublicId } = input;
  if (!qrImageUrl && !qrImagePublicId) return;
  if (!qrImageUrl || !qrImagePublicId) {
    throw new BadRequestError('QR image URL and image id must be set together');
  }

  const parsed = parseCloudinaryUploadUrl(qrImageUrl);
  if (!parsed) throw new BadRequestError('QR image must be an uploaded Cloudinary image');
  if (parsed.publicId !== qrImagePublicId) {
    throw new BadRequestError('QR image id does not match the image URL');
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName || parsed.cloudName !== cloudName) {
    throw new BadRequestError('QR image must be hosted on the configured Cloudinary account');
  }
  if (!qrImagePublicId.startsWith(`${CLOUDINARY_FOLDER}/${QR_FOLDER}/`)) {
    throw new BadRequestError('QR image must be uploaded through the settings page');
  }
}

/** Matches the migration's seeded row; returned (never written) when the row is missing. */
export const DEFAULT_PAYMENT_SETTINGS: Omit<PaymentSettings, 'id' | 'updatedAt'> = {
  enabledMethods: [PaymentMethod.COD],
  codFeeEnabled: false,
  codFeeType: CodFeeType.FLAT,
  codFeeValue: 0,
  qrImageUrl: null,
  qrImagePublicId: null,
  contactNumber: null,
  paymentNote: null,
  updatedById: null,
};

function defaultSettings(): PaymentSettings {
  return { id: PAYMENT_SETTINGS_ID, ...DEFAULT_PAYMENT_SETTINGS, updatedAt: new Date(0) };
}

/**
 * Methods a customer may actually use, derived from an already-loaded
 * settings row: enabled by the admin AND, for gateways, configured with
 * credentials. Always in `PaymentMethod` enum order, whatever order the
 * stored array has. Pure, so callers holding settings (e.g. `placeOrder`)
 * don't need a second query.
 */
export function effectiveMethods(
  settings: Pick<PaymentSettings, 'enabledMethods'>,
): PaymentMethod[] {
  return canonicalMethods(settings.enabledMethods).filter(gatewayConfigured);
}

/** 400 for a method the admin has not enabled (or whose gateway has no credentials). */
export function assertMethodAvailable(
  settings: Pick<PaymentSettings, 'enabledMethods'>,
  method: PaymentMethod,
): void {
  if (effectiveMethods(settings).includes(method)) return;
  const meta: PaymentMethodUnavailableMeta = { reason: 'payment_method_unavailable', method };
  throw new BadRequestError('That payment method is no longer available', meta);
}

export const paymentSettingsService = {
  /** The settings singleton, or in-memory defaults (COD on, fee off) if the row is missing. */
  async get(client: Db = prisma): Promise<PaymentSettings> {
    const row = await client.paymentSettings.findUnique({ where: { id: PAYMENT_SETTINGS_ID } });
    return row ?? defaultSettings();
  },

  /**
   * What the checkout/order UI may see. Contact, QR and note are always
   * present (nullable) regardless of the fee flag, so orders placed while the
   * fee was on can still show them after the admin turns it off.
   */
  async getPublicConfig(client: Db = prisma): Promise<PublicPaymentConfig> {
    const s = await paymentSettingsService.get(client);
    return {
      methods: effectiveMethods(s),
      cod: { feeEnabled: s.codFeeEnabled, type: s.codFeeType, value: s.codFeeValue },
      qrImageUrl: s.qrImageUrl,
      contactNumber: s.contactNumber,
      paymentNote: s.paymentNote,
    };
  },

  /**
   * Full replacement of the singleton (PUT semantics): omitted optional
   * fields are stored as null. Deletes the previous QR from Cloudinary when
   * `qrImagePublicId` changes or is cleared; a failed delete is logged and
   * does not fail the save.
   */
  async update(adminId: string, input: PaymentSettingsInput): Promise<PaymentSettings> {
    assertTrustedQrImage(input);

    const data = {
      enabledMethods: canonicalMethods(input.enabledMethods),
      codFeeEnabled: input.codFeeEnabled,
      codFeeType: input.codFeeType,
      codFeeValue: input.codFeeValue,
      qrImageUrl: input.qrImageUrl ?? null,
      qrImagePublicId: input.qrImagePublicId ?? null,
      contactNumber: input.contactNumber ?? null,
      paymentNote: input.paymentNote ?? null,
      updatedById: adminId,
    };

    const { saved, previousPublicId } = await prisma.$transaction(async (tx) => {
      const current = await paymentSettingsService.get(tx);

      // Only newly-enabled gateways are rejected, so a gateway whose
      // credentials were removed later can still be switched off or left
      // alone while other settings change (effectiveMethods already hides it).
      const newlyEnabledWithoutCreds = data.enabledMethods.filter(
        (m) => !current.enabledMethods.includes(m) && !gatewayConfigured(m),
      );
      if (newlyEnabledWithoutCreds.length > 0) {
        throw new BadRequestError(
          `Cannot enable ${newlyEnabledWithoutCreds.join(', ')}: gateway credentials are not configured`,
        );
      }

      if (data.enabledMethods.filter(gatewayConfigured).length === 0) {
        throw new BadRequestError('At least one payment method must remain enabled');
      }

      const row = await tx.paymentSettings.upsert({
        where: { id: PAYMENT_SETTINGS_ID },
        create: { id: PAYMENT_SETTINGS_ID, ...data },
        update: data,
      });
      return { saved: row, previousPublicId: current.qrImagePublicId };
    });

    if (previousPublicId && previousPublicId !== saved.qrImagePublicId) {
      try {
        await mediaService.deleteImage(previousPublicId);
      } catch (err) {
        log.warn('settings.qr_delete_failed', {
          publicId: previousPublicId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return saved;
  },
};
