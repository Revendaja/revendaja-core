# Revendaja Backend

Backend em **Node.js + TypeScript** organizado em módulos por funcionalidade (cada pasta
em `src/modules/` contém seu próprio controller, service, repositório de banco, schema de
validação e testes).

## Stack e por quê

| Peça           | Escolha                                                              | Motivo                                                                                                                              |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Runtime        | Node.js 20+                                                          | LTS, amplamente suportado                                                                                                           |
| Linguagem      | TypeScript                                                           | Tipagem estática pega erros antes de produção                                                                                       |
| Framework HTTP | [Fastify](https://fastify.dev)                                       | Alta performance, validação de schema nativa, e o modelo de plugins do Fastify combina diretamente com a arquitetura modular pedida |
| Validação      | [Zod](https://zod.dev)                                               | Um único schema define validação de entrada **e** tipo TypeScript **e** documentação OpenAPI                                        |
| Banco          | PostgreSQL                                                           | Dados relacionais de negócio (usuários, pedidos, revenda) se beneficiam de integridade referencial                                  |
| ORM            | [Prisma](https://www.prisma.io)                                      | Migrations versionadas, tipos gerados automaticamente, ótimo suporte a TypeScript                                                   |
| Autenticação   | JWT (`jsonwebtoken`) + `bcryptjs`                                    | Padrão simples e amplamente compreendido para APIs stateless                                                                        |
| Testes         | Jest + `ts-jest`                                                     | Padrão de mercado, boa integração com TypeScript                                                                                    |
| Lint/format    | ESLint 9 (flat config) + Prettier                                    | Consistência de código automatizada                                                                                                 |
| Git hooks      | Husky + lint-staged + Commitlint                                     | Garante lint/format antes do commit e mensagens no padrão Conventional Commits                                                      |
| Docs de API    | Swagger/OpenAPI (`@fastify/swagger`) gerado a partir dos schemas Zod | Uma única fonte de verdade — documentar o schema já documenta a API                                                                 |

Veja o racional completo da arquitetura em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estrutura de pastas

```
prisma/
  schema.prisma          # modelos do banco (fonte da verdade das tabelas)
src/
  app.ts                 # monta a instância do Fastify e registra os módulos
  server.ts              # ponto de entrada: conecta no banco, sobe o servidor, shutdown gracioso
  config/
    env.ts               # validação das variáveis de ambiente (Zod)
  database/
    prisma.ts            # instância única do PrismaClient
  shared/
    errors/              # hierarquia de erros de domínio + handler central
    middlewares/          # middlewares reaproveitáveis (ex.: authenticate)
    mail/                # envio de e-mail (Resend) + templates HTML/texto
    logger.ts            # instância única do Pino
  modules/
    auth/                  # cadastro, login, /me (emite access + refresh token)
    otp/                   # geração/validação/reenvio do código (enviado por e-mail)
    store/                 # criação da loja (handle/subdomínio único) e meta de vendas
    home/                  # GET /home: o payload da tela Início (compõe consultas de sales + store)
    storefront/            # vitrine online: rotas públicas do revendaja-web (visitas, pedidos) + estatísticas
    users/                 # acesso à tabela de usuários (sem rotas públicas)
    health/                # healthcheck
    <novo-modulo>/
      <nome>.routes.ts
      <nome>.controller.ts
      <nome>.service.ts
      <nome>.repository.ts
      <nome>.schema.ts
      __tests__/
test/
  jest.setup.ts           # variáveis de ambiente usadas apenas nos testes
docs/
  ARCHITECTURE.md
  CONTRIBUTING.md
```

## Como rodar localmente

Pré-requisitos: Node.js 20+ (`.nvmrc`) e Docker.

```bash
npm install
cp .env.example .env
docker compose up -d        # sobe o PostgreSQL local
npm run db:migrate          # cria as tabelas
npm run dev                 # sobe a API em modo watch (http://localhost:3000)
```

Documentação interativa da API (Swagger UI): `http://localhost:3000/docs`

## E-mails transacionais (Resend)

O envio de e-mail (código de verificação, boas-vindas, etc.) usa a [Resend](https://resend.com).

| Variável         | Padrão                              | Descrição                                                                                                                                                            |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | _(vazia)_                           | Chave da API. Vazia = e-mails só são logados no console. Obrigatória em produção.                                                                                    |
| `MAIL_FROM`      | `Revendaja <onboarding@resend.dev>` | Remetente. O padrão é o domínio de testes da Resend (só entrega para o e-mail dono da conta). Para enviar a qualquer pessoa, verifique um domínio próprio na Resend. |

Modelos disponíveis (`src/shared/mail/templates/`), todos em HTML + texto puro:

| Modelo                | Método do `MailService` | Quando é enviado                                                 |
| --------------------- | ----------------------- | ---------------------------------------------------------------- |
| Código de verificação | `sendVerificationCode`  | No cadastro e no reenvio (`isResend: true` muda assunto e texto) |
| Boas-vindas           | `sendWelcome`           | Quando a usuária confirma o código                               |
| Esqueci a senha       | `sendPasswordReset`     | `POST /auth/forgot-password` (código de 6 dígitos)               |
| Senha alterada        | `sendPasswordChanged`   | Depois de `POST /auth/reset-password`                            |

## Fluxo de negócio (cadastro → verificação → loja)

1. `POST /auth/register` — cria a conta (`phone_verified_at = null`) e dispara um OTP de
   6 dígitos por e-mail (Resend). Já retorna `accessToken`/`refreshToken`, mas rotas que exigem
   verificação continuam bloqueadas até o OTP ser confirmado.
2. `POST /auth/otp/verify` — confirma o código e envia o e-mail de boas-vindas; `phone_verified_at` é
   preenchido.
3. `POST /store` — só funciona depois da verificação; recebe só o nome da loja e o backend
   gera o `handle`/subdomínio.
4. **Uma sessão por conta**: um login novo (em outro aparelho) derruba o anterior — o token
   antigo passa a receber `401`. `POST /auth/logout` encerra a sessão atual. O access token
   dura 15 min; quando expira, o front chama `POST /auth/refresh` com o refresh token (30
   dias) para pegar outro, sem pedir login de novo.
5. Esqueceu a senha? `POST /auth/forgot-password` manda um **código de 6 dígitos** por e-mail
   (o app não usa link); o app chama `POST /auth/reset-password` com e-mail, código e nova
   senha. O código expira em 15 min e tem 5 tentativas.
6. Quem já tem conta usa `POST /auth/login` e pula direto pro app (`GET /me` diz em que
   ponto do onboarding a usuária está: `isVerified`, `hasStore`).

## Endpoints disponíveis

| Método   | Rota                            | Descrição                                                                                                         | Autenticado                |
| -------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------- |
| GET      | `/health`                       | Verifica se a API e o banco estão de pé                                                                           | Não                        |
| **POST** | **`/auth/register`**            | **Cadastra a conta e dispara o OTP por e-mail**                                                                   | Não                        |
| POST     | `/auth/login`                   | Autentica com e-mail e senha (derruba a sessão anterior)                                                          | Não                        |
| POST     | `/auth/refresh`                 | Troca o refresh token por um novo access token (mesma sessão)                                                     | Não (usa o refresh token)  |
| POST     | `/auth/logout`                  | Encerra a sessão atual                                                                                            | Sim                        |
| POST     | `/auth/forgot-password`         | Envia o código de redefinição por e-mail (resposta sempre igual)                                                  | Não                        |
| POST     | `/auth/reset-password`          | Define a nova senha com e-mail + código; derruba a sessão                                                         | Não                        |
| GET      | `/me`                           | Usuário autenticado + `isVerified` + `store` (ou `null`)                                                          | Sim                        |
| POST     | `/auth/otp/verify`              | Confirma o código de 6 dígitos recebido por e-mail                                                                | Sim                        |
| POST     | `/auth/otp/resend`              | Reenvia o código (rate limit: cooldown + limite por hora)                                                         | Sim                        |
| POST     | `/store`                        | Cria a loja (nome → handle/subdomínio automático)                                                                 | Sim **e** conta verificada |
| GET      | `/catalog/brands`               | Lista as marcas do catálogo global                                                                                | Sim                        |
| GET      | `/catalog/products`             | Lista produtos do catálogo (`search` por nome **ou código de barras**, `brandId`, paginação)                      | Sim                        |
| GET      | `/catalog/products/:id`         | Detalha um produto do catálogo                                                                                    | Sim                        |
| POST     | `/store/products`               | Adiciona um produto do catálogo à loja com `price`, `costPrice` (custo, opcional) e `stock` (estoque, padrão 0)   | Sim **e** conta verificada |
| GET      | `/store/products`               | Lista os produtos da loja (`search` por nome ou código de barras; traz `price`, `costPrice`, `stock`, `isActive`) | Sim **e** conta verificada |
| PATCH    | `/store/products/:id`           | Edita `price`, `costPrice` (`null` limpa), `stock` (valor absoluto) e/ou `isActive`                               | Sim **e** conta verificada |
| DELETE   | `/store/products/:id`           | Remove o produto da loja (204, sem corpo)                                                                         | Sim **e** conta verificada |
| POST     | `/sales`                        | Registra a venda (baixa estoque, numera "Venda #N", idempotente por `clientRequestId`)                            | Sim **e** conta verificada |
| GET      | `/sales`                        | Lista as vendas (`from`, `to`, `status`, `source`, paginação)                                                     | Sim **e** conta verificada |
| GET      | `/sales/summary`                | Resumo financeiro do período (`from`/`to` obrigatórios; `source` opcional: `online`/`manual`)                     | Sim **e** conta verificada |
| GET      | `/sales/:id`                    | Detalhe da venda com os itens                                                                                     | Sim **e** conta verificada |
| PATCH    | `/sales/:id`                    | Venda pendente: marca como paga (`paid`) ou cancela (`cancelled`, devolvendo o estoque reservado)                 | Sim **e** conta verificada |
| GET      | `/home`                         | Tudo da tela Início: plano, faturamento (só pagas), meta e alertas (`from`/`to`/`previousFrom` obrigatórios)      | Sim **e** conta verificada |
| GET      | `/store/stats`                  | Visitas (7 dias) e pedidos feitos pela vitrine (tela Minha Loja)                                                  | Sim **e** conta verificada |
| GET      | `/public/stores/:handle`        | Vitrine pública: loja, formas de pagamento aceitas e produtos visíveis (usada pelo revendaja-web)                 | **Não**                    |
| POST     | `/public/stores/:handle/visits` | Registra uma visita à vitrine (204)                                                                               | **Não**                    |
| POST     | `/public/stores/:handle/orders` | Pedido do cliente: vira venda **pendente** da loja online (idempotente por `clientRequestId`)                     | **Não**                    |
| PATCH    | `/store`                        | Liga/desliga a vitrine (`isOnline`) e edita nome, link (`handle`) e descrição (`bio`); devolve a loja             | Sim **e** conta verificada |
| PUT      | `/store/goal`                   | Define (ou troca) a meta de faturamento mensal (`monthlyGoal`)                                                    | Sim **e** conta verificada |
| GET      | `/store/settings`               | Plano da loja + formas de pagamento aceitas + ocultar produtos sem estoque (tela Mais)                            | Sim **e** conta verificada |
| PATCH    | `/store/settings`               | Altera `acceptedPaymentMethods` (ao menos uma, sem fiado) e/ou `hideOutOfStock`                                   | Sim **e** conta verificada |

"Autenticado" = header `Authorization: Bearer <accessToken>`.

### Testando o fluxo completo

```bash
# 1. cadastro — dispara o OTP (em dev, o código aparece no log da aplicação
#    como "[MAIL MOCK] ... 123456", ver shared/mail — ou chega no e-mail se RESEND_API_KEY estiver definida)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana Souza","email":"ana@email.com","whatsapp":"5511982214432","password":"123456"}'
# -> { user, accessToken, refreshToken, isVerified: false, hasStore: false }

# 2. confirma o código (pegue o valor logado no passo 1)
curl -X POST http://localhost:3000/auth/otp/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"code":"123456"}'

# 3. cria a loja — só funciona depois do passo 2
curl -X POST http://localhost:3000/store \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"storeName":"Leal Perfumaria"}'
# -> { handle: "lealperfumaria", catalogLink: "https://lealperfumaria.revendaja.com", ... }

# 4. em outra sessão: login direto
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@email.com","password":"123456"}'
```

## Scripts

| Script                                      | O que faz                                           |
| ------------------------------------------- | --------------------------------------------------- |
| `npm run dev`                               | Sobe o servidor em modo watch                       |
| `npm run build`                             | Compila TypeScript para `dist/`                     |
| `npm start`                                 | Roda a versão compilada (`dist/server.js`)          |
| `npm run lint` / `lint:fix`                 | ESLint                                              |
| `npm run format` / `format:check`           | Prettier                                            |
| `npm run typecheck`                         | Checagem de tipos sem gerar arquivos                |
| `npm test` / `test:watch` / `test:coverage` | Jest                                                |
| `npm run db:migrate`                        | Cria/aplica migrations do Prisma em desenvolvimento |
| `npm run db:migrate:deploy`                 | Aplica migrations em produção                       |
| `npm run db:studio`                         | Abre o Prisma Studio (GUI do banco)                 |

## Testes e qualidade

- Testes unitários de regra de negócio (`*.service.test.ts`) injetam um repositório fake —
  não dependem de banco de dados.
- Testes de rota (`*.routes.test.ts`) usam `app.inject()` do Fastify e mockam o módulo do
  Prisma — não sobem servidor HTTP nem banco real.
- Todo commit passa por `eslint --fix` + `prettier --write` nos arquivos alterados
  (pre-commit) e por validação de mensagem no padrão Conventional Commits (commit-msg).
- O CI (`.github/workflows/ci.yml`) roda lint, typecheck, testes com cobertura e build a
  cada push/PR para `main`, com um PostgreSQL real de serviço.

Guia completo de contribuição, padrão de commits e checklist de PR:
[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

## Docker

```bash
docker build -t revendaja-backend .
docker run --env-file .env -p 3000:3000 revendaja-backend
```

O `docker-compose.yml` na raiz sobe apenas o PostgreSQL, para desenvolvimento local — a
aplicação em si roda com `npm run dev` fora do container por padrão.
