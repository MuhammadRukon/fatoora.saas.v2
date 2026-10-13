-- CreateIndex
CREATE INDEX "Payment_bankRef_lower_idx" ON "Payment" (lower("bankRef"));
