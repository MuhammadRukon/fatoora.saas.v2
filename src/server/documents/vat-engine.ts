/**
 * Pure VAT engine, shared by the server (authoritative) and the invoice form (live preview).
 * No server-only imports: keep it that way. Integer halalas, bigint micro-units for quantity,
 * round half-up (inputs are non-negative, so half-up = half away from zero).
 */
import { ValidationError } from '@/server/common/errors';
import { VATEX_REASONS, type TaxCategoryCode } from '@/server/zatca/codes';

export const MAX_LINES = 500;
export const STANDARD_RATE_BP = 1500;
/** Postgres Int: every stored amount must fit. */
const MAX_HALALAS = 2_147_483_647n;
const MICRO = 1_000_000n;

export interface EngineLineInput {
  /** Decimal string, up to 6 decimals ("0.5"). */
  quantity: string;
  unitPriceHalalas: number;
  lineDiscountHalalas?: number;
  taxCategory: TaxCategoryCode;
  taxRateBp: number;
  exemptionReasonCode?: string | null;
  exemptionReason?: string | null;
}

export interface EngineInput {
  lines: EngineLineInput[];
  docDiscountHalalas?: number;
}

export interface ComputedLine {
  netHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
}

export interface ComputedTaxSubtotal {
  taxCategory: TaxCategoryCode;
  taxRateBp: number;
  taxableHalalas: number;
  taxHalalas: number;
  exemptionReasonCode?: string;
  exemptionReason?: string;
}

export interface ComputedTotals {
  lineExtensionHalalas: number;
  allowanceTotalHalalas: number;
  taxExclusiveHalalas: number;
  taxHalalas: number;
  taxInclusiveHalalas: number;
  payableHalalas: number;
}

export interface ComputedDocument {
  lines: ComputedLine[];
  totals: ComputedTotals;
  taxSubtotals: ComputedTaxSubtotal[];
}

const fail = (code: string, message: string): never => {
  throw new ValidationError(`${message} (${code})`, { code });
};

/** n / d rounded half-up, n >= 0, d > 0. */
const divRound = (n: bigint, d: bigint) => (n + d / 2n) / d;

function checkAmount(v: bigint, what: string): number {
  if (v > MAX_HALALAS) fail('AMOUNT_TOO_LARGE', `${what} is too large`);
  return Number(v);
}

function nonNegInt(v: number | undefined, what: string): bigint {
  if (v === undefined) return 0n;
  if (!Number.isSafeInteger(v) || v < 0) fail('INVALID_AMOUNT', `${what} must be a non-negative whole number of halalas`);
  return BigInt(v);
}

/** "1.5" -> 1_500_000n. Positive, at most 6 decimals, plain digits only. */
export function quantityToMicro(q: string): bigint {
  const m = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(q.trim());
  if (!m) return fail('INVALID_QUANTITY', 'Quantity must be a positive number with at most 6 decimals');
  const micro = BigInt(m[1]) * MICRO + BigInt((m[2] ?? '').padEnd(6, '0'));
  if (micro <= 0n) fail('INVALID_QUANTITY', 'Quantity must be greater than 0');
  return micro;
}

function checkTaxFields(l: EngineLineInput, i: number) {
  const at = `Line ${i + 1}`;
  if (l.taxCategory === 'S') {
    if (l.taxRateBp !== STANDARD_RATE_BP) fail('INVALID_TAX_RATE', `${at}: standard-rated lines must use 15%`);
    return;
  }
  if (l.taxRateBp !== 0) fail('INVALID_TAX_RATE', `${at}: this category must use 0%`);
  if (l.taxCategory === 'O') {
    if (!l.exemptionReason?.trim()) fail('EXEMPTION_REQUIRED', `${at}: an exemption reason text is required for out-of-scope lines`);
    return;
  }
  const code = l.exemptionReasonCode;
  if (!code || VATEX_REASONS[code]?.category !== l.taxCategory) {
    fail('EXEMPTION_REQUIRED', `${at}: a valid exemption reason code is required for ${l.taxCategory} lines`);
  }
}

export function computeDocument(input: EngineInput): ComputedDocument {
  const { lines } = input;
  if (lines.length < 1 || lines.length > MAX_LINES) fail('INVALID_LINE_COUNT', `A document needs 1 to ${MAX_LINES} lines`);
  const docDiscount = nonNegInt(input.docDiscountHalalas, 'Document discount');

  const computed: ComputedLine[] = [];
  const groups = new Map<string, ComputedTaxSubtotal & { net: bigint }>();
  let lineExtension = 0n;

  lines.forEach((l, i) => {
    checkTaxFields(l, i);
    const price = nonNegInt(l.unitPriceHalalas, `Line ${i + 1} unit price`);
    const discount = nonNegInt(l.lineDiscountHalalas, `Line ${i + 1} discount`);
    const net = divRound(quantityToMicro(l.quantity) * price, MICRO) - discount;
    if (net < 0n) fail('NEGATIVE_NET', `Line ${i + 1}: the discount exceeds the line amount (net would be negative)`);
    const vat = divRound(net * BigInt(l.taxRateBp), 10000n);
    computed.push({
      netHalalas: checkAmount(net, `Line ${i + 1}`),
      vatHalalas: Number(vat),
      totalHalalas: checkAmount(net + vat, `Line ${i + 1}`),
    });
    lineExtension += net;

    // One subtotal per category, rate and exemption reason (each reason is its own TaxSubtotal).
    const code = l.taxCategory === 'Z' || l.taxCategory === 'E' ? l.exemptionReasonCode! : undefined;
    const reason = l.taxCategory === 'O' ? l.exemptionReason!.trim() : undefined;
    const key = [l.taxCategory, l.taxRateBp, code, reason].join('|');
    const g = groups.get(key) ?? {
      taxCategory: l.taxCategory,
      taxRateBp: l.taxRateBp,
      taxableHalalas: 0,
      taxHalalas: 0,
      ...(code ? { exemptionReasonCode: code } : {}),
      ...(reason ? { exemptionReason: reason } : {}),
      net: 0n,
    };
    g.net += net;
    groups.set(key, g);
  });

  if (docDiscount > 0n && groups.size > 1) {
    fail('DOC_DISCOUNT_MIXED_CATEGORIES', 'A document discount needs all lines to share one tax category, rate and exemption');
  }
  if (docDiscount > lineExtension) fail('DOC_DISCOUNT_EXCEEDS_TOTAL', 'The document discount exceeds the sum of the lines');

  // With a discount there is exactly one group, so the discount applies to it whole.
  const taxSubtotals: ComputedTaxSubtotal[] = [...groups.values()].map(({ net, ...g }) => {
    const taxable = net - (docDiscount > 0n ? docDiscount : 0n);
    return {
      ...g,
      taxableHalalas: checkAmount(taxable, 'Taxable amount'),
      taxHalalas: Number(divRound(taxable * BigInt(g.taxRateBp), 10000n)),
    };
  });

  const taxExclusive = lineExtension - docDiscount;
  const tax = taxSubtotals.reduce((n, s) => n + s.taxHalalas, 0);
  const taxInclusive = taxExclusive + BigInt(tax);
  return {
    lines: computed,
    taxSubtotals,
    totals: {
      lineExtensionHalalas: checkAmount(lineExtension, 'Document total'),
      allowanceTotalHalalas: Number(docDiscount),
      taxExclusiveHalalas: checkAmount(taxExclusive, 'Document total'),
      taxHalalas: tax,
      taxInclusiveHalalas: checkAmount(taxInclusive, 'Document total'),
      payableHalalas: checkAmount(taxInclusive, 'Document total'),
    },
  };
}
