export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CursorParams {
  cursor?: string;
  limit?: number;
}

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export function clampLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.max(1, Math.trunc(value)), MAX_PAGE_LIMIT);
}
