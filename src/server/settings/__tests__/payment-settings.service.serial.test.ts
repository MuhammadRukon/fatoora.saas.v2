/**
 * Live-DB tests (same tradeoff as payments.service.test.ts: no Prisma
 * mocking convention in this repo). The PaymentSettings singleton is
 * snapshotted before each test and restored afterwards. Cloudinary is
 * never hit: `mediaService.deleteImage` is spied on.
 */
import { CodFeeType, PaymentMethod, type PaymentSettings } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import type { PaymentSettingsInput } from '@/contracts/payment-settings';
import { prisma } from '@/lib/prisma';
import { clearGatewayEnv } from '@/server/checkout/__tests__/fixtures';
import { BadRequestError } from '@/server/common/errors';
import { CLOUDINARY_FOLDER } from '@/server/media/cloudinary';
import { mediaService } from '@/server/media/media.service';

import {
  DEFAULT_PAYMENT_SETTINGS,
  effectiveMethods,
  paymentSettingsService,
} from '../payment-settings.service';

const SINGLETON = 'singleton';

const BKASH_ENV_KEYS = [
  'BKASH_BASE_URL',
  'BKASH_APP_KEY',
  'BKASH_APP_SECRET',
  'BKASH_USERNAME',
  'BKASH_PASSWORD',
];

function setBkashEnv() {
  for (const key of BKASH_ENV_KEYS) vi.stubEnv(key, 'test-value');
}

function input(overrides: Partial<PaymentSettingsInput> = {}): PaymentSettingsInput {
  return {
    enabledMethods: [PaymentMethod.COD],
    codFeeEnabled: false,
    codFeeType: CodFeeType.FLAT,
    codFeeValue: 10_000,
    qrImageUrl: null,
    qrImagePublicId: null,
    contactNumber: null,
    paymentNote: null,
    ...overrides,
  };
}

const CLOUD = 'test-cloud';

/** A QR as the uploader produces it: `<CLOUDINARY_FOLDER>/settings/<id>` on our cloud. */
function qr(id: string, cloud = CLOUD) {
  const publicId = `${CLOUDINARY_FOLDER}/settings/${id}`;
  return {
    qrImageUrl: `https://res.cloudinary.com/${cloud}/image/upload/v1/${publicId}.png`,
    qrImagePublicId: publicId,
  };
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

let original: PaymentSettings | null = null;
let deleteImage: MockInstance<typeof mediaService.deleteImage>;

beforeEach(async () => {
  original = await prisma.paymentSettings.findUnique({ where: { id: SINGLETON } });
  deleteImage = vi.spyOn(mediaService, 'deleteImage').mockResolvedValue(undefined);
  clearGatewayEnv();
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', CLOUD);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (original) {
    const { id, updatedAt, ...data } = original;
    void updatedAt;
    await prisma.paymentSettings.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  } else {
    await prisma.paymentSettings.deleteMany({ where: { id: SINGLETON } });
  }
});

describe('paymentSettingsService.get', () => {
  it('returns defaults without creating a row when the singleton is missing', async () => {
    await prisma.paymentSettings.deleteMany({ where: { id: SINGLETON } });

    const settings = await paymentSettingsService.get();

    expect(settings.enabledMethods).toEqual([PaymentMethod.COD]);
    expect(settings.enabledMethods).toEqual(DEFAULT_PAYMENT_SETTINGS.enabledMethods);
    expect(settings.codFeeEnabled).toBe(false);
    expect(await prisma.paymentSettings.count({ where: { id: SINGLETON } })).toBe(0);
  });

  it('accepts a transaction client', async () => {
    await prisma.paymentSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, enabledMethods: [PaymentMethod.BANK_TRANSFER] },
      update: { enabledMethods: [PaymentMethod.BANK_TRANSFER] },
    });
    const settings = await prisma.$transaction((tx) => paymentSettingsService.get(tx));
    expect(settings.enabledMethods).toEqual([PaymentMethod.BANK_TRANSFER]);
  });
});

describe('paymentSettingsService.update', () => {
  it('throws BadRequestError when every method is disabled', async () => {
    await expect(
      paymentSettingsService.update('admin-1', input({ enabledMethods: [] })),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when the only enabled method has no credentials', async () => {
    // Flag is on but the gateway is not configured, so nothing is effective.
    await expect(
      paymentSettingsService.update('admin-1', input({ enabledMethods: [PaymentMethod.BKASH] })),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError mentioning credentials when enabling BKASH without them', async () => {
    const err = await paymentSettingsService
      .update('admin-1', input({ enabledMethods: [PaymentMethod.COD, PaymentMethod.BKASH] }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestError);
    expect((err as BadRequestError).message).toContain('credentials');
  });

  it('stores duplicate and out-of-order entries once, in enum order', async () => {
    const saved = await paymentSettingsService.update(
      'admin-1',
      input({
        enabledMethods: [
          PaymentMethod.BANK_TRANSFER,
          PaymentMethod.COD,
          PaymentMethod.BANK_TRANSFER,
          PaymentMethod.COD,
        ],
      }),
    );
    expect(saved.enabledMethods).toEqual([PaymentMethod.COD, PaymentMethod.BANK_TRANSFER]);
  });

  it('does not treat a gateway already in the stored array as newly enabled', async () => {
    // BKASH was enabled while credentials existed; they were removed later.
    await prisma.paymentSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, enabledMethods: [PaymentMethod.COD, PaymentMethod.BKASH] },
      update: { enabledMethods: [PaymentMethod.COD, PaymentMethod.BKASH] },
    });

    // Reordered and duplicated, with another field changed: still not "new".
    const saved = await paymentSettingsService.update(
      'admin-1',
      input({
        enabledMethods: [PaymentMethod.BKASH, PaymentMethod.COD, PaymentMethod.BKASH],
        paymentNote: 'changed',
      }),
    );
    expect(saved.enabledMethods).toEqual([PaymentMethod.COD, PaymentMethod.BKASH]);
    expect(saved.paymentNote).toBe('changed');
  });

  it('rejects a gateway that is new relative to the stored array even if others stay', async () => {
    await prisma.paymentSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, enabledMethods: [PaymentMethod.COD] },
      update: { enabledMethods: [PaymentMethod.COD] },
    });

    const err = await paymentSettingsService
      .update('admin-1', input({ enabledMethods: [PaymentMethod.COD, PaymentMethod.SSLCOMMERZ] }))
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BadRequestError);
    expect((err as BadRequestError).message).toContain('SSLCOMMERZ');
    expect((err as BadRequestError).message).toContain('credentials');
  });

  it('allows switching a credential-less gateway off while keeping another method', async () => {
    await prisma.paymentSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, enabledMethods: [PaymentMethod.COD, PaymentMethod.BKASH] },
      update: { enabledMethods: [PaymentMethod.COD, PaymentMethod.BKASH] },
    });

    const saved = await paymentSettingsService.update(
      'admin-1',
      input({ enabledMethods: [PaymentMethod.COD] }),
    );
    expect(saved.enabledMethods).toEqual([PaymentMethod.COD]);
  });

  it('does not persist anything when validation fails', async () => {
    await prisma.paymentSettings.deleteMany({ where: { id: SINGLETON } });
    await paymentSettingsService
      .update('admin-1', input({ enabledMethods: [PaymentMethod.COD, PaymentMethod.BKASH] }))
      .catch(() => null);
    expect(await prisma.paymentSettings.count({ where: { id: SINGLETON } })).toBe(0);
  });

  it('allows enabling BKASH when credentials are present', async () => {
    setBkashEnv();
    const saved = await paymentSettingsService.update(
      'admin-1',
      input({ enabledMethods: [PaymentMethod.COD, PaymentMethod.BKASH] }),
    );
    expect(saved.enabledMethods).toEqual([PaymentMethod.COD, PaymentMethod.BKASH]);
  });

  it('persists updatedById and the submitted fields', async () => {
    const adminId = randomId('admin');
    const saved = await paymentSettingsService.update(
      adminId,
      input({
        enabledMethods: [PaymentMethod.COD, PaymentMethod.BANK_TRANSFER],
        codFeeEnabled: true,
        codFeeType: CodFeeType.PERCENT,
        codFeeValue: 25,
        contactNumber: '01800000000',
        paymentNote: 'note',
      }),
    );
    expect(saved.updatedById).toBe(adminId);

    const row = await prisma.paymentSettings.findUniqueOrThrow({ where: { id: SINGLETON } });
    expect(row.updatedById).toBe(adminId);
    expect(row.enabledMethods).toEqual([PaymentMethod.COD, PaymentMethod.BANK_TRANSFER]);
    expect(row.codFeeEnabled).toBe(true);
    expect(row.codFeeType).toBe(CodFeeType.PERCENT);
    expect(row.codFeeValue).toBe(25);
    expect(row.contactNumber).toBe('01800000000');
    expect(row.paymentNote).toBe('note');
  });

  it('deletes the old QR exactly once when qrImagePublicId changes from A to B', async () => {
    const a = qr(randomId('qr-a'));
    const b = qr(randomId('qr-b'));

    await paymentSettingsService.update('admin-1', input(a));
    expect(deleteImage).not.toHaveBeenCalled();

    await paymentSettingsService.update('admin-1', input(b));
    expect(deleteImage).toHaveBeenCalledTimes(1);
    expect(deleteImage).toHaveBeenCalledWith(a.qrImagePublicId);
  });

  it('accepts a QR on our cloud under <folder>/settings/', async () => {
    const a = qr(randomId('qr-ok'));
    const saved = await paymentSettingsService.update('admin-1', input(a));
    expect(saved.qrImageUrl).toBe(a.qrImageUrl);
    expect(saved.qrImagePublicId).toBe(a.qrImagePublicId);
  });

  it('rejects a QR hosted on another Cloudinary cloud and saves nothing', async () => {
    const before = await paymentSettingsService.get();

    await expect(
      paymentSettingsService.update('admin-1', input(qr(randomId('qr-x'), 'attacker-cloud'))),
    ).rejects.toBeInstanceOf(BadRequestError);

    const after = await paymentSettingsService.get();
    expect(after.qrImageUrl).toBe(before.qrImageUrl);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('rejects a QR whose public id is outside <folder>/settings/ (it would be deleted later)', async () => {
    const publicId = `${CLOUDINARY_FOLDER}/catalog/${randomId('product')}`;
    const qrImageUrl = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${publicId}.png`;

    await expect(
      paymentSettingsService.update('admin-1', input({ qrImageUrl, qrImagePublicId: publicId })),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects a public id that does not match the URL, and fetch-type URLs (service level)', async () => {
    const a = qr(randomId('qr-a'));
    const b = qr(randomId('qr-b'));
    await expect(
      paymentSettingsService.update(
        'admin-1',
        input({ qrImageUrl: a.qrImageUrl, qrImagePublicId: b.qrImagePublicId }),
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      paymentSettingsService.update(
        'admin-1',
        input({
          qrImageUrl: `https://res.cloudinary.com/${CLOUD}/image/fetch/https://evil.com/x.png`,
          qrImagePublicId: a.qrImagePublicId,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('fails closed when the server has no CLOUDINARY_CLOUD_NAME', async () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', '');
    await expect(
      paymentSettingsService.update('admin-1', input(qr(randomId('qr-a')))),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('does not delete the QR when the publicId is unchanged', async () => {
    const a = qr(randomId('qr-a'));

    await paymentSettingsService.update('admin-1', input(a));
    await paymentSettingsService.update('admin-1', input({ ...a, paymentNote: 'changed' }));
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('deletes the old QR exactly once when the QR is cleared', async () => {
    const a = qr(randomId('qr-a'));
    await paymentSettingsService.update('admin-1', input(a));

    const saved = await paymentSettingsService.update(
      'admin-1',
      input({ qrImageUrl: null, qrImagePublicId: null }),
    );
    expect(saved.qrImagePublicId).toBeNull();
    expect(deleteImage).toHaveBeenCalledTimes(1);
    expect(deleteImage).toHaveBeenCalledWith(a.qrImagePublicId);
  });

  it('still saves when deleting the old QR fails', async () => {
    const a = qr(randomId('qr-a'));
    await paymentSettingsService.update('admin-1', input(a));
    deleteImage.mockRejectedValueOnce(new Error('cloudinary down'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const saved = await paymentSettingsService.update(
      'admin-1',
      input({ qrImageUrl: null, qrImagePublicId: null }),
    );
    expect(saved.qrImagePublicId).toBeNull();
  });
});

describe('effectiveMethods (via paymentSettingsService.get)', () => {
  const effective = async () => effectiveMethods(await paymentSettingsService.get());
  const { COD, BKASH, SSLCOMMERZ, BANK_TRANSFER } = PaymentMethod;
  const store = (enabledMethods: PaymentMethod[]) =>
    prisma.paymentSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, enabledMethods },
      update: { enabledMethods },
    });

  it('excludes a gateway that is enabled but whose credentials are missing', async () => {
    await prisma.paymentSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, enabledMethods: [COD, BKASH, BANK_TRANSFER] },
      update: { enabledMethods: [COD, BKASH, BANK_TRANSFER] },
    });

    const methods = await effective();

    expect(methods).toContain(PaymentMethod.COD);
    expect(methods).toContain(PaymentMethod.BANK_TRANSFER);
    expect(methods).not.toContain(PaymentMethod.BKASH);
  });

  it('includes the gateway once credentials are present', async () => {
    await prisma.paymentSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, enabledMethods: [PaymentMethod.BKASH] },
      update: { enabledMethods: [PaymentMethod.BKASH] },
    });
    setBkashEnv();

    expect(await effective()).toContain(PaymentMethod.BKASH);
  });

  it('falls back to COD only when the singleton row is missing', async () => {
    await prisma.paymentSettings.deleteMany({ where: { id: SINGLETON } });
    expect(await effective()).toEqual([PaymentMethod.COD]);
  });

  it('returns enum order whatever order the stored array has', async () => {
    await store([BANK_TRANSFER, COD]);
    expect(await effective()).toEqual([COD, BANK_TRANSFER]);

    setBkashEnv();
    await store([BANK_TRANSFER, BKASH, COD]);
    expect(await effective()).toEqual([COD, BKASH, BANK_TRANSFER]);
  });

  it('lists a method once even if the stored array repeats it', async () => {
    await store([COD, BANK_TRANSFER, COD, BANK_TRANSFER]);
    expect(await effective()).toEqual([COD, BANK_TRANSFER]);
  });

  it('is empty for an empty stored array', async () => {
    await store([]);
    expect(await effective()).toEqual([]);
  });

  it('keeps the canonical order COD, SSLCOMMERZ, BKASH, BANK_TRANSFER with all credentials present', async () => {
    setBkashEnv();
    for (const key of ['SSLCOMMERZ_STORE_ID', 'SSLCOMMERZ_STORE_PASSWORD']) {
      vi.stubEnv(key, 'test-value');
    }
    await store([BANK_TRANSFER, BKASH, SSLCOMMERZ, COD]);

    expect(await effective()).toEqual([COD, SSLCOMMERZ, BKASH, BANK_TRANSFER]);
  });

  it('is a pure function of the loaded row (no query)', () => {
    expect(effectiveMethods({ enabledMethods: [BANK_TRANSFER, COD] })).toEqual([
      COD,
      BANK_TRANSFER,
    ]);
  });

  it('the DB default for a freshly created row is COD only (no enabledMethods given)', async () => {
    await prisma.paymentSettings.deleteMany({ where: { id: SINGLETON } });
    const row = await prisma.paymentSettings.create({ data: { id: SINGLETON } });

    expect(row.enabledMethods).toEqual([COD]);
    expect(row.enabledMethods).toEqual(DEFAULT_PAYMENT_SETTINGS.enabledMethods);
    expect(await effective()).toEqual([COD]);
  });

  it('accepts a transaction client', async () => {
    const methods = await prisma.$transaction(async (tx) =>
      effectiveMethods(await paymentSettingsService.get(tx)),
    );
    expect(Array.isArray(methods)).toBe(true);
  });
});
