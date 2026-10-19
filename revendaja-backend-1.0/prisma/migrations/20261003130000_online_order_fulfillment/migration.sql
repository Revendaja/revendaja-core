-- Pedido online: retirada ou entrega, endereço e troco. Só ADICIONA colunas nulas: as vendas
-- existentes ficam como estão (fulfillment/endereço/troco nulos).
-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('pickup', 'delivery');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cash_change_for" DECIMAL(12,2),
ADD COLUMN     "delivery_address" TEXT,
ADD COLUMN     "fulfillment" "FulfillmentMethod";
