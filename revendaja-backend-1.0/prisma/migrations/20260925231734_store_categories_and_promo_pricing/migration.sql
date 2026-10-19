-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "promo_ends_at" TIMESTAMP(3),
ADD COLUMN     "promo_price" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "store_categories" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_categories_store_id_name_key" ON "store_categories"("store_id", "name");

-- CreateIndex
CREATE INDEX "store_products_category_id_idx" ON "store_products"("category_id");

-- AddForeignKey
ALTER TABLE "store_categories" ADD CONSTRAINT "store_categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "store_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
