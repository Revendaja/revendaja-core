-- Busca tolerante a erro de digitação e acento (word_similarity), usada em catalog.search.ts.
-- As duas são extensões "trusted" do Postgres: não precisam de superusuário.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
