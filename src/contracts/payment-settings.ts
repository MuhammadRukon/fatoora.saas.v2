import { CodFeeType, PaymentMethod } from '@prisma/client';
import { z } from 'zod';

/**
 * Admin-configured payment methods + COD confirmation fee.
 *
 * `codFeeValue` units depend on `codFeeType`:
 *  - FLAT    -> integer cents (BDT paisa), a multiple of 100, at least 100
 *  - PERCENT -> integer 1..100 (percent of the order grand total)
 */

const BD_MOBILE = /^(\+?88)?01[3-9]\d{8}$/;
const CLOUDINARY_HOST = 'res.cloudinary.com';
/** Characters our uploader produces in a public id (path segments joined by '/'). */
const PUBLIC_ID = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

/**
 * Structural parse of a Cloudinary plain-upload delivery URL:
 * `https://res.cloudinary.com/<cloud>/image/upload/[v123/]<publicId>[.ext]`.
 * Rejects other schemes, hosts (incl. userinfo/port tricks), resource types
 * and delivery types (notably `fetch`, which proxies arbitrary remote URLs).
 * Cloud-name pinning needs server env, so it lives in the settings service.
 */
export function parseCloudinaryUploadUrl(
  value: string,
): { cloudName: string; publicId: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== CLOUDINARY_HOST) return null;
  if (url.port || url.username || url.password || url.search || url.hash) return null;

  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const m = path.match(/^\/([^/]+)\/image\/upload\/(?:v\d+\/)?(.+)$/);
  if (!m) return null;
  // Drop the file extension from the last segment to get the public id.
  return { cloudName: m[1], publicId: m[2].replace(/\.[A-Za-z0-9]+$/, '') };
}

/**
 * De-duplicates `methods` and puts them in `PaymentMethod` enum order (the
 * order customers see), whatever order the input arrived in.
 */
export function canonicalMethods(methods: readonly PaymentMethod[]): PaymentMethod[] {
  const wanted = new Set(methods);
  return Object.values(PaymentMethod).filter((method) => wanted.has(method));
}

export const PAYMENT_NOTE_MAX = 500;

/** PERCENT fee bounds (whole percent of the order grand total). */
export const COD_PERCENT_MIN = 1;
export const COD_PERCENT_MAX = 100;
/** FLAT fee is a whole BDT amount: a multiple of this many cents, at least one step. */
export const COD_FLAT_STEP_CENTS = 100;

/** Whether `value` is an acceptable COD fee for `type` (units per the header comment). */
export function isValidCodFeeValue(type: CodFeeType, value: number): boolean {
  if (!Number.isInteger(value)) return false;
  return type === CodFeeType.PERCENT
    ? value >= COD_PERCENT_MIN && value <= COD_PERCENT_MAX
    : value >= COD_FLAT_STEP_CENTS && value % COD_FLAT_STEP_CENTS === 0;
}

export const codFeeRuleSchema = z.object({
  type: z.enum(CodFeeType),
  value: z.number().int(),
});
export type CodFeeRule = z.infer<typeof codFeeRuleSchema>;

export const paymentSettingsInputSchema = z
  .object({
    // No default on purpose: an omitted list must be a validation error, never
    // a silent "nothing enabled". An empty list parses; the service rejects it
    // (400) so the "at least one method" message stays in one place.
    enabledMethods: z.array(z.enum(PaymentMethod)).transform(canonicalMethods),
    codFeeEnabled: z.boolean(),
    codFeeType: z.enum(CodFeeType),
    codFeeValue: z.number().int(),
    qrImageUrl: z
      .string()
      .max(2048)
      .refine((v) => parseCloudinaryUploadUrl(v) !== null, {
        message: 'QR image must be an uploaded Cloudinary image',
      })
      .nullable()
      .optional(),
    qrImagePublicId: z.string().max(512).regex(PUBLIC_ID, 'Invalid image id').nullable().optional(),
    contactNumber: z
      .string()
      .trim()
      .regex(BD_MOBILE, 'Enter a valid Bangladeshi mobile number')
      .nullable()
      .optional(),
    paymentNote: z.string().max(PAYMENT_NOTE_MAX).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    // The QR url and its Cloudinary public id are set together and must agree
    // (the public id is what gets deleted when the QR is replaced).
    if (v.qrImageUrl && !v.qrImagePublicId) {
      ctx.addIssue({
        code: 'custom',
        path: ['qrImagePublicId'],
        message: 'Image id is required with the QR image',
      });
    } else if (!v.qrImageUrl && v.qrImagePublicId) {
      ctx.addIssue({
        code: 'custom',
        path: ['qrImageUrl'],
        message: 'QR image is required with the image id',
      });
    } else if (v.qrImageUrl && v.qrImagePublicId) {
      const parsed = parseCloudinaryUploadUrl(v.qrImageUrl);
      if (parsed && parsed.publicId !== v.qrImagePublicId) {
        ctx.addIssue({
          code: 'custom',
          path: ['qrImagePublicId'],
          message: 'Image id does not match the QR image URL',
        });
      }
    }

    if (!isValidCodFeeValue(v.codFeeType, v.codFeeValue)) {
      ctx.addIssue({
        code: 'custom',
        path: ['codFeeValue'],
        message:
          v.codFeeType === CodFeeType.PERCENT
            ? 'Percentage must be a whole number from 1 to 100'
            : 'Flat fee must be a whole BDT amount of at least 1 BDT',
      });
    }

    if (v.codFeeEnabled && !v.enabledMethods.includes(PaymentMethod.COD)) {
      ctx.addIssue({
        code: 'custom',
        path: ['codFeeEnabled'],
        message: 'The confirmation fee requires Cash on Delivery to be enabled',
      });
    }

    if (v.codFeeEnabled && !v.contactNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['contactNumber'],
        message: 'Contact number is required when the confirmation fee is on',
      });
    }
  });
export type PaymentSettingsInput = z.infer<typeof paymentSettingsInputSchema>;

/** Shape returned to the checkout/order UI (never includes secrets). */
export interface PublicPaymentConfig {
  methods: PaymentMethod[];
  cod: {
    feeEnabled: boolean;
    type: CodFeeType;
    value: number;
  };
  qrImageUrl: string | null;
  contactNumber: string | null;
  paymentNote: string | null;
}
