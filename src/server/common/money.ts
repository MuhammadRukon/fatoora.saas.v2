/**
 * All monetary amounts in the system are stored as integer halalas
 * (1 SAR = 100 halalas) to avoid floating-point drift. UI converts at render.
 */

export const CURRENCY = 'SAR';

const DECIMAL = /^(-)?(\d*)(?:\.(\d*))?$/;

/**
 * SAR amount -> integer halalas, rounding half-up (away from zero) at the
 * third decimal. Parses the decimal string digit by digit, so "10.005" is
 * exactly 1001 (parseFloat * 100 would give 1000.4999...). Numbers go through
 * their shortest string form; exponent forms (1e-7, 1e21) are rejected.
 */
export function toHalalas(sar: string | number): number {
  const text = typeof sar === 'number' ? String(sar) : sar.trim();
  const m = DECIMAL.exec(text);
  if (!m || (!m[2] && !m[3])) throw new Error(`Invalid SAR amount: ${String(sar)}`);
  const [, minus, whole = '', frac = ''] = m;
  let halalas = Number(whole || '0') * 100 + Number(frac.slice(0, 2).padEnd(2, '0'));
  if (frac.charCodeAt(2) >= 53 /* '5' */) halalas += 1;
  if (!Number.isSafeInteger(halalas)) throw new Error(`SAR amount out of range: ${String(sar)}`);
  return minus && halalas !== 0 ? -halalas : halalas;
}

/** Integer halalas -> SAR decimal string with exactly 2 decimals ("1.50"). */
export function fromHalalas(halalas: number): string {
  if (!Number.isSafeInteger(halalas)) throw new Error(`Invalid halalas: ${halalas}`);
  const abs = Math.abs(halalas);
  const sar = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return halalas < 0 ? `-${sar}` : sar;
}

const formatters = {
  en: new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  ar: new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

/** Display-only: "SAR 1,234.56" (en) or Arabic digits with "ر.س." (ar). */
export function formatSAR(halalas: number, locale: 'en' | 'ar'): string {
  return formatters[locale].format(halalas / 100);
}
