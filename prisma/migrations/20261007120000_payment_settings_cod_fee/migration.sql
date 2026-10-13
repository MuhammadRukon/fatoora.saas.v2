-- CreateEnum
CREATE TYPE "CodFeeType" AS ENUM ('FLAT', 'PERCENT');

-- CreateEnum
CREATE TYPE "CodFeeStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED', 'WAIVED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "codFeeCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "customerTxnId" TEXT,
ADD COLUMN     "feeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "feeStatus" "CodFeeStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "feeType" "CodFeeType",
ADD COLUMN     "feeValue" INTEGER,
ADD COLUMN     "feeVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "feeVerifiedById" TEXT,
ADD COLUMN     "txnSubmittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "codEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bkashEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sslcommerzEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bankTransferEnabled" BOOLEAN NOT NULL DEFAULT false,
    "codFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "codFeeType" "CodFeeType" NOT NULL DEFAULT 'FLAT',
    "codFeeValue" INTEGER NOT NULL DEFAULT 0,
    "qrImageUrl" TEXT,
    "qrImagePublicId" TEXT,
    "contactNumber" TEXT,
    "paymentNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_customerTxnId_key" ON "Payment"("customerTxnId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_feeVerifiedById_fkey" FOREIGN KEY ("feeVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the default singleton row (COD on, fee off, all other methods off).
INSERT INTO "PaymentSettings" ("id", "updatedAt")
VALUES ('singleton', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
