-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'starter', 'premium');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'free';
