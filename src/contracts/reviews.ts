import { z } from 'zod';

export const reviewInputSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().min(10).max(2000),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface ReviewSummary {
  count: number;
  average: number;
}

export interface ReviewableItem {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string | null;
  imageUrl: string | null;
  deliveredAt: string;
}
