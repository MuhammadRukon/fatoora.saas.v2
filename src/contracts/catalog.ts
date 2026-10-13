import { z } from 'zod';
import { PublishStatus } from '@prisma/client';

// --- Brand -------------------------------------------------------------------

export const brandInputSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(120),
  logoUrl: z.string().url().nullish(),
  isPopular: z.boolean().optional(),
  status: z.enum(PublishStatus).optional(),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

export const brandSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  isPopular: z.boolean(),
  status: z.enum(PublishStatus),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Brand = z.infer<typeof brandSchema>;

// --- Category ----------------------------------------------------------------

export const categoryInputSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(120),
  iconUrl: z.string().url().nullish(),
  parentId: z.string().nullish(),
  isPopular: z.boolean().optional(),
  status: z.enum(PublishStatus).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  iconUrl: z.string().nullable(),
  parentId: z.string().nullable(),
  isPopular: z.boolean(),
  status: z.enum(PublishStatus),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Category = z.infer<typeof categorySchema>;

// --- Product image -----------------------------------------------------------

export const productImageInputSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(1),
  alt: z.string().max(200).nullish(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type ProductImageInput = z.infer<typeof productImageInputSchema>;

// --- Variant -----------------------------------------------------------------

export const variantInputSchema = z
  .object({
    id: z.string().optional(),
    sku: z.string().min(1).max(64),
    name: z.string().max(120).nullish(),
    attributes: z.record(z.string(), z.string()).optional(),
    buyingPriceCents: z.number().int().min(0),
    sellingPriceCents: z.number().int().min(0),
    discountCents: z.number().int().min(0),
    stock: z.number().int().min(0),
    lowStockThreshold: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .refine((v) => v.discountCents <= v.sellingPriceCents, {
    message: 'discountCents cannot exceed sellingPriceCents',
    path: ['discountCents'],
  });
export type VariantInput = z.infer<typeof variantInputSchema>;

// --- Product -----------------------------------------------------------------

export const productInputSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(180),
  description: z.string().min(2),
  brandId: z.string().min(1),
  categoryIds: z.array(z.string()).min(1),
  status: z.enum(PublishStatus).optional(),
  isPopular: z.boolean().optional(),
  warrantyMonths: z.number().int().min(0).max(120),
  metaTitle: z.string().max(180).nullish(),
  metaDescription: z.string().max(320).nullish(),
  images: z.array(productImageInputSchema).max(20),
  variants: z.array(variantInputSchema).min(1),
});
export type ProductInput = z.infer<typeof productInputSchema>;

const inStockSchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'string' ? v === 'true' : v));

export const productListQuerySchema = z.object({
  q: z.string().max(100).optional(),
  brandSlug: z.string().optional(),
  categorySlug: z.string().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: inStockSchema.optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

// --- Public DTOs --------------------------------------------------------------

export interface PublicProductSummary {
  id: string;
  slug: string;
  name: string;
  brand: { id: string; name: string; slug: string };
  imageUrl: string | null;
  /** Lowest active variant price in cents, after applying its discount. */
  priceCents: number;
  /** Original (non-discounted) lowest variant price for showing strikethrough. */
  originalPriceCents: number;
  inStock: boolean;
  isPopular: boolean;
}

export interface PublicProductPage {
  items: PublicProductSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicProductVariant {
  id: string;
  sku: string;
  name: string | null;
  attributes: Record<string, string>;
  priceCents: number;
  originalPriceCents: number;
  inStock: boolean;
}

export interface PublicProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  warrantyMonths: number;
  metaTitle: string | null;
  metaDescription: string | null;
  brand: { id: string; name: string; slug: string };
  categories: { id: string; name: string; slug: string }[];
  images: { url: string; alt: string | null }[];
  variants: PublicProductVariant[];
}

export interface PublicProductMetadata {
  slug: string;
  name: string;
  metaTitle: string | null;
  metaDescription: string | null;
  imageUrl: string | null;
}
