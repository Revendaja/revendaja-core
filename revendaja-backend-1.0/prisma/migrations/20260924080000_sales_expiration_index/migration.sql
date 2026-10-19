-- CreateIndex
CREATE INDEX "sales_status_source_created_at_idx" ON "sales"("status", "source", "created_at");
