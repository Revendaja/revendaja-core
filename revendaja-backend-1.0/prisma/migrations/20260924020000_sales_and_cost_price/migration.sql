-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('pix', 'card', 'cash', 'on_account');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('paid', 'pending');

-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "cost_price" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "sale_counter" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "client_request_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "installments" INTEGER,
    "status" "SaleStatus" NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "store_product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "product_image_sm" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(10,2),

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_store_id_created_at_idx" ON "sales"("store_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_store_id_number_key" ON "sales"("store_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_store_id_client_request_id_key" ON "sales"("store_id", "client_request_id");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_store_product_id_idx" ON "sale_items"("store_product_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_store_product_id_fkey" FOREIGN KEY ("store_product_id") REFERENCES "store_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

