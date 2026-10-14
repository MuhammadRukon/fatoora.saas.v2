-- DropForeignKey
ALTER TABLE "public"."Document" DROP CONSTRAINT "Document_customerId_fkey";

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
