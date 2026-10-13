-- AlterTable
-- Destructive on columns: the four boolean flags are replaced by one array.
-- The existing row (if any) is converted first, in enum order.
ALTER TABLE "PaymentSettings" ADD COLUMN     "enabledMethods" "PaymentMethod"[] DEFAULT ARRAY['COD']::"PaymentMethod"[];

UPDATE "PaymentSettings"
SET "enabledMethods" = array_remove(
  ARRAY[
    CASE WHEN "codEnabled" THEN 'COD'::"PaymentMethod" END,
    CASE WHEN "sslcommerzEnabled" THEN 'SSLCOMMERZ'::"PaymentMethod" END,
    CASE WHEN "bkashEnabled" THEN 'BKASH'::"PaymentMethod" END,
    CASE WHEN "bankTransferEnabled" THEN 'BANK_TRANSFER'::"PaymentMethod" END
  ],
  NULL
);

ALTER TABLE "PaymentSettings" DROP COLUMN "codEnabled",
DROP COLUMN "bkashEnabled",
DROP COLUMN "sslcommerzEnabled",
DROP COLUMN "bankTransferEnabled";
