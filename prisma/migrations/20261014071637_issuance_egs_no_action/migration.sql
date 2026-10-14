-- DropForeignKey
ALTER TABLE "public"."Document" DROP CONSTRAINT "Document_egsUnitId_fkey";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "submittingSince" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_egsUnitId_fkey" FOREIGN KEY ("egsUnitId") REFERENCES "EgsUnit"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
