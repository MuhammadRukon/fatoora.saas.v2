import { z } from 'zod';

export const cartItemInputSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export interface CartLine {
  itemId: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantName: string | null;
  sku: string;
  imageUrl: string | null;
  unitPriceCents: number;
  originalUnitPriceCents: number;
  quantity: number;
  /** Variant stock at fetch time. UI shows insufficiency when quantity > stock. */
  stock: number;
  isActive: boolean;
}

export interface CartSnapshot {
  lines: CartLine[];
  subtotalCents: number;
  itemCount: number;
}

/** One guest line the merge could not fully apply: applied 0 = removed, applied < requested = clamped. */
const mergeAdjustmentSchema = z.object({
  variantId: z.string(),
  name: z.string().optional(),
  requested: z.number().int().min(0),
  applied: z.number().int().min(0),
});
export type MergeAdjustment = z.infer<typeof mergeAdjustmentSchema>;

/** Snapshot fields stay at the top level (older clients ignore `adjustments`). */
export const mergeResultSchema = z.object({ adjustments: z.array(mergeAdjustmentSchema) });
export type CartMergeResult = CartSnapshot & z.infer<typeof mergeResultSchema>;

export interface CartSummary {
  subtotalCents: number;
  itemCount: number;
  hasIssues: boolean;
}

export const guestCartLineSchema = z.object({
  variantId: z.string().max(64),
  quantity: z.number().int().min(1).max(99),
});
export type GuestCartLine = z.infer<typeof guestCartLineSchema>;

export const MAX_GUEST_LINES = 50;
export const hydrateBodySchema = z.object({
  lines: z.array(guestCartLineSchema).max(MAX_GUEST_LINES),
});
