-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "current_period_end" TIMESTAMP(3),
ADD COLUMN     "stripe_customer_id" TEXT,
ADD COLUMN     "stripe_subscription_id" TEXT,
ADD COLUMN     "subscription_status" TEXT;

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_stripe_customer_id_key" ON "stores"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "stores_stripe_subscription_id_key" ON "stores"("stripe_subscription_id");
