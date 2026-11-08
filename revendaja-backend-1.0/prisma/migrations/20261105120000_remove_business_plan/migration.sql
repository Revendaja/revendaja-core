-- Remove o plano Empresarial: lojas que ainda estavam nele passam para o Pro.
UPDATE "stores" SET "plan" = 'premium' WHERE "plan" = 'business';

-- O Postgres não remove valor de enum: recria o tipo sem `business`.
ALTER TABLE "stores" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TYPE "Plan" RENAME TO "Plan_old";
CREATE TYPE "Plan" AS ENUM ('free', 'starter', 'premium');
ALTER TABLE "stores" ALTER COLUMN "plan" TYPE "Plan" USING ("plan"::text::"Plan");
ALTER TABLE "stores" ALTER COLUMN "plan" SET DEFAULT 'free';
DROP TYPE "Plan_old";
