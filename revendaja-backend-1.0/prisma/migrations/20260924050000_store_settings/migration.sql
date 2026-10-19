-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "accepted_payment_methods" "PaymentMethod"[] DEFAULT ARRAY['pix', 'card', 'cash']::"PaymentMethod"[],
ADD COLUMN     "hide_out_of_stock" BOOLEAN NOT NULL DEFAULT true;
