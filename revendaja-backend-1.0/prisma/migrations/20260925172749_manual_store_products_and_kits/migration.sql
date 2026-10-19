-- CreateEnum
CREATE TYPE "StoreProductKind" AS ENUM ('catalog', 'manual');

-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "description" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "kind" "StoreProductKind" NOT NULL DEFAULT 'catalog',
ADD COLUMN     "name" TEXT,
ALTER COLUMN "product_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "store_product_components" (
    "id" TEXT NOT NULL,
    "kit_id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_product_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_item_components" (
    "id" TEXT NOT NULL,
    "sale_item_id" TEXT NOT NULL,
    "component_store_product_id" TEXT,
    "component_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sale_item_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_product_components_component_id_idx" ON "store_product_components"("component_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_product_components_kit_id_component_id_key" ON "store_product_components"("kit_id", "component_id");

-- CreateIndex
CREATE INDEX "sale_item_components_sale_item_id_idx" ON "sale_item_components"("sale_item_id");

-- CreateIndex
CREATE INDEX "sale_item_components_component_store_product_id_idx" ON "sale_item_components"("component_store_product_id");

-- AddForeignKey
ALTER TABLE "store_product_components" ADD CONSTRAINT "store_product_components_kit_id_fkey" FOREIGN KEY ("kit_id") REFERENCES "store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_product_components" ADD CONSTRAINT "store_product_components_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "store_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_components" ADD CONSTRAINT "sale_item_components_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_components" ADD CONSTRAINT "sale_item_components_component_store_product_id_fkey" FOREIGN KEY ("component_store_product_id") REFERENCES "store_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
