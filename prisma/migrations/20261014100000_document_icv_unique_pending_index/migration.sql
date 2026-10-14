-- CreateIndex
CREATE UNIQUE INDEX "Document_egsUnitId_icv_key" ON "Document"("egsUnitId", "icv");


-- Partial index for the cron/overdue queries; not expressible in schema.prisma (Prisma ignores it when diffing).
CREATE INDEX "Document_pending_retry_idx" ON "Document"("submissionStatus", "issuedAt") WHERE "submissionStatus" = 'PENDING_RETRY';
