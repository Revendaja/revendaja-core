-- CreateEnum
CREATE TYPE "SaleSource" AS ENUM ('manual', 'online');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "customer_whatsapp" TEXT,
ADD COLUMN     "source" "SaleSource" NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "store_visits" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_visits_store_id_created_at_idx" ON "store_visits"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_store_id_source_idx" ON "sales"("store_id", "source");

-- AddForeignKey
ALTER TABLE "store_visits" ADD CONSTRAINT "store_visits_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
