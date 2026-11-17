-- Marca Odorata (mesmo id do seed, prisma/seed/brands.json). Idempotente: onde ela já existe não muda nada.
INSERT INTO "brands" ("id", "name", "logo", "from_catalog", "full_catalog", "profitability", "created_at", "updated_at")
SELECT 223, 'Odorata', NULL, true, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "brands" WHERE "id" = 223 OR LOWER("name") = 'odorata');

-- O id foi explícito: alinha a sequência pra próxima marca criada sem id não colidir.
SELECT setval(pg_get_serial_sequence('"brands"', 'id'), (SELECT MAX("id") FROM "brands"));
