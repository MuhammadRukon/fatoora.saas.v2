-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateEnum
CREATE TYPE "DocumentSubtype" AS ENUM ('STANDARD', 'SIMPLIFIED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'ISSUED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_RETRY', 'REPORTED', 'CLEARED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('S', 'Z', 'E', 'O');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "subtype" "DocumentSubtype" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "sequence" INTEGER,
    "number" TEXT,
    "customerId" TEXT,
    "buyerSnapshot" JSONB,
    "sellerSnapshot" JSONB,
    "issueDate" DATE,
    "issueTime" TEXT,
    "issuedAt" TIMESTAMP(3),
    "supplyDate" DATE,
    "supplyEndDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "paymentMeansCode" TEXT,
    "docDiscountHalalas" INTEGER NOT NULL DEFAULT 0,
    "docDiscountReason" TEXT,
    "lineExtensionHalalas" INTEGER NOT NULL DEFAULT 0,
    "allowanceTotalHalalas" INTEGER NOT NULL DEFAULT 0,
    "taxExclusiveHalalas" INTEGER NOT NULL DEFAULT 0,
    "taxHalalas" INTEGER NOT NULL DEFAULT 0,
    "taxInclusiveHalalas" INTEGER NOT NULL DEFAULT 0,
    "payableHalalas" INTEGER NOT NULL DEFAULT 0,
    "billingReferenceId" TEXT,
    "noteReason" TEXT,
    "notes" TEXT,
    "egsUnitId" TEXT,
    "uuid" TEXT,
    "icv" INTEGER,
    "pih" TEXT,
    "invoiceHash" TEXT,
    "signedXml" TEXT,
    "clearedXml" TEXT,
    "qrBase64" TEXT,
    "signingTime" TIMESTAMP(3),
    "submissionStatus" "SubmissionStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "hasWarnings" BOOLEAN NOT NULL DEFAULT false,
    "zatcaResponse" JSONB,
    "submissionAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCode" TEXT NOT NULL DEFAULT 'PCE',
    "unitPriceHalalas" INTEGER NOT NULL,
    "lineDiscountHalalas" INTEGER NOT NULL DEFAULT 0,
    "taxCategory" "TaxCategory" NOT NULL,
    "taxRateBp" INTEGER NOT NULL,
    "exemptionReasonCode" TEXT,
    "exemptionReason" TEXT,
    "netHalalas" INTEGER NOT NULL,
    "vatHalalas" INTEGER NOT NULL,
    "totalHalalas" INTEGER NOT NULL,

    CONSTRAINT "DocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_uuid_key" ON "Document"("uuid");

-- CreateIndex
CREATE INDEX "Document_businessId_createdAt_idx" ON "Document"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_customerId_idx" ON "Document"("customerId");

-- CreateIndex
CREATE INDEX "Document_billingReferenceId_idx" ON "Document"("billingReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_businessId_kind_sequence_key" ON "Document"("businessId", "kind", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLine_documentId_position_key" ON "DocumentLine"("documentId", "position");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_billingReferenceId_fkey" FOREIGN KEY ("billingReferenceId") REFERENCES "Document"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_egsUnitId_fkey" FOREIGN KEY ("egsUnitId") REFERENCES "EgsUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
