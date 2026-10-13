-- DropIndex
-- `Product.slug` is `@unique`, so `Product_slug_key` already indexes it. `0_init` also
-- created a plain `Product_slug_idx` that schema.prisma never declared, which made
-- `prisma migrate dev` propose this drop on every run. IF EXISTS keeps the migration
-- safe on databases where the index is already gone.
DROP INDEX IF EXISTS "public"."Product_slug_idx";
