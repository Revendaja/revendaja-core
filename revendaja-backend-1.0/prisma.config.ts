import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Migrations precisam de conexão direta com o banco: o pooler do Neon (host com "-pooler") não segura
// o advisory lock do `migrate deploy` e estoura P1002. DIRECT_URL = mesma URL sem "-pooler" no host.
// Sem ela, cai na DATABASE_URL (dev local).
const databaseUrl = process.env.DIRECT_URL || env('DATABASE_URL');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
