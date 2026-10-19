# Guia de contribuição

## Requisitos

- Node.js 20+ (veja `.nvmrc`)
- Docker (para o PostgreSQL local via `docker-compose`)

## Configuração inicial

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run dev
```

O `npm install` já configura os git hooks (script `prepare`), então os passos abaixo
passam a valer automaticamente a partir do primeiro commit.

## Padrão de commits (Conventional Commits)

Todo commit é validado pelo `commitlint` (hook `commit-msg` do Husky). O formato é:

```
<tipo>(<escopo opcional>): <descrição curta no imperativo>
```

Tipos aceitos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`, `revert`.

Exemplos válidos:

```
feat(auth): adiciona endpoint de login com senha
fix(users): corrige validação de e-mail duplicado
docs: atualiza instruções de setup no README
```

Commits fora do padrão são **rejeitados** pelo hook — corrija a mensagem e tente de novo.

## Antes de commitar

O hook `pre-commit` roda `lint-staged`, que aplica automaticamente nos arquivos alterados:

- `eslint --fix`
- `prettier --write`

Se o ESLint encontrar um erro que não pode corrigir sozinho, o commit é bloqueado até você
resolver o problema manualmente.

## Testes

```bash
npm test              # roda toda a suíte uma vez
npm run test:watch    # modo watch
npm run test:coverage # com relatório de cobertura
```

Regras práticas usadas neste projeto:

- **Services** são testados unitariamente, injetando um repositório fake (`jest.fn()`),
  sem precisar de banco de dados real.
- **Rotas** são testadas com `app.inject()` (Fastify), mockando o módulo do Prisma
  (`jest.mock('.../database/prisma')`), sem precisar subir um servidor HTTP de verdade.

Todo endpoint novo deve vir acompanhado de pelo menos um teste de rota, e toda regra de
negócio não trivial deve ter teste de service.

## Checklist antes de abrir um PR

- [ ] `npm run lint` sem erros
- [ ] `npm run typecheck` sem erros
- [ ] `npm test` passando
- [ ] Se mudou o schema do banco: migration criada (`npm run db:migrate`) e commitada
- [ ] Endpoints novos/alterados documentados via schema Zod (a doc em `/docs` é gerada
      automaticamente a partir deles)

O workflow de CI (`.github/workflows/ci.yml`) roda lint, typecheck, testes e build em
todo push/PR para `main`.
