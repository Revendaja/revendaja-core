-- Vários aparelhos mobile por conta: troca o índice único (user_id, client) por um índice comum.
-- O limite (web = 1, mobile = MAX_MOBILE_SESSIONS) passa a ser aplicado em `sessionsRepository.replaceForUser`.
DROP INDEX "sessions_user_id_client_key";
CREATE INDEX "sessions_user_id_client_idx" ON "sessions"("user_id", "client");
