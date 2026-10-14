import { fromHalalas } from '@/server/common/money';

const group = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1,234.56": Latin digits and exactly 2 decimals, for lists, forms and the print view. */
export const formatAmount = (halalas: number) => group.format(Number(fromHalalas(halalas)));

/** Display name of a document: its number, or "Draft" before issue. */
export const documentLabel = (d: { number: string | null }) => d.number ?? 'Draft';
