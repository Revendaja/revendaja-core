-- Tipo de conta: contas de revisão das lojas de app e internas ficam fora das métricas/faturamento.
CREATE TYPE "AccountType" AS ENUM ('standard', 'store_review', 'internal');

ALTER TABLE "users" ADD COLUMN "account_type" "AccountType" NOT NULL DEFAULT 'standard';
