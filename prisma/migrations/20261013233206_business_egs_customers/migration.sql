-- CreateEnum
CREATE TYPE "ZatcaEnvironment" AS ENUM ('SIMULATION', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "SellerIdScheme" AS ENUM ('CRN', 'MOM', 'MLS', '700', 'SAG', 'OTH');

-- CreateEnum
CREATE TYPE "BuyerIdScheme" AS ENUM ('TIN', 'CRN', 'MOM', 'MLS', '700', 'SAG', 'NAT', 'GCC', 'IQA', 'PAS', 'OTH');

-- CreateEnum
CREATE TYPE "EgsStatus" AS ENUM ('NEW', 'COMPLIANCE_ISSUED', 'ACTIVE', 'FAILED', 'REVOKED');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "vatNumber" CHAR(15) NOT NULL,
    "sellerIdScheme" "SellerIdScheme" NOT NULL,
    "sellerIdValue" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "streetAr" TEXT,
    "buildingNumber" CHAR(4) NOT NULL,
    "additionalNumber" TEXT,
    "district" TEXT NOT NULL,
    "districtAr" TEXT,
    "city" TEXT NOT NULL,
    "cityAr" TEXT,
    "postalCode" CHAR(5) NOT NULL,
    "countryCode" CHAR(2) NOT NULL DEFAULT 'SA',
    "businessCategory" TEXT NOT NULL,
    "zatcaEnvironment" "ZatcaEnvironment" NOT NULL DEFAULT 'SIMULATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EgsUnit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "environment" "ZatcaEnvironment" NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "commonName" TEXT NOT NULL,
    "functionalityMap" TEXT NOT NULL DEFAULT '1100',
    "status" "EgsStatus" NOT NULL DEFAULT 'NEW',
    "privateKeyEnc" TEXT,
    "csrPem" TEXT,
    "complianceRequestId" TEXT,
    "complianceCsidEnc" TEXT,
    "complianceSecretEnc" TEXT,
    "productionCsidEnc" TEXT,
    "productionSecretEnc" TEXT,
    "certificatePem" TEXT,
    "certNotAfter" TIMESTAMP(3),
    "lastIcv" INTEGER NOT NULL DEFAULT 0,
    "lastInvoiceHash" TEXT NOT NULL DEFAULT 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EgsUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "vatNumber" TEXT,
    "buyerIdScheme" "BuyerIdScheme",
    "buyerIdValue" TEXT,
    "street" TEXT,
    "buildingNumber" TEXT,
    "additionalNumber" TEXT,
    "district" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "countryCode" CHAR(2) NOT NULL DEFAULT 'SA',
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Business_ownerId_idx" ON "Business"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "EgsUnit_serialNumber_key" ON "EgsUnit"("serialNumber");

-- CreateIndex
CREATE INDEX "EgsUnit_businessId_idx" ON "EgsUnit"("businessId");

-- CreateIndex
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EgsUnit" ADD CONSTRAINT "EgsUnit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one non-REVOKED EGS unit per business and environment (partial index; not expressible in schema.prisma)
CREATE UNIQUE INDEX "EgsUnit_one_live_per_business_env" ON "EgsUnit"("businessId", "environment") WHERE "status" <> 'REVOKED';
