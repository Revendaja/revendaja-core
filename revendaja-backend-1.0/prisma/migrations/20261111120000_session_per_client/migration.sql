-- Uma sessão por tipo de aparelho (web e mobile) em vez de uma por conta.
CREATE TYPE "SessionClient" AS ENUM ('web', 'mobile');

-- As sessões que já existem viram "mobile" (padrão); quem usa o painel web faz login de novo.
ALTER TABLE "sessions" ADD COLUMN "client" "SessionClient" NOT NULL DEFAULT 'mobile';

DROP INDEX "sessions_user_id_key";
CREATE UNIQUE INDEX "sessions_user_id_client_key" ON "sessions"("user_id", "client");
