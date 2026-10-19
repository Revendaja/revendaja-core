# Revendaja Web

App web do Revendaja (Next.js + TypeScript + Tailwind). Consome a **mesma API** do `revendaja-backend-1.0`
usada pelo app mobile — autenticação por Bearer token (access + refresh), sem rotas próprias no Next.

## Rodando localmente

1. Suba o backend primeiro (porta `3000`): siga o README de `revendaja-backend-1.0` (Postgres + Redis via
   `docker-compose up`, depois `npm run dev`).
2. Copie `.env.example` para `.env.local` e ajuste `NEXT_PUBLIC_API_URL` se o backend não estiver em
   `http://localhost:3000`.
3. `npm install`
4. `npm run dev` — abre em [http://localhost:3001](http://localhost:3001) (porta `3001` de propósito, para não
   colidir com o backend na `3000`).

## O que já existe

- **Autenticação completa**: cadastro (3 passos), login, verificação por código (OTP), esqueci/redefinir senha.
- **Onboarding**: confirmação de e-mail e criação da loja (`POST /store`), passos obrigatórios antes do painel.
- **Painel** (`/dashboard`): faturamento do mês, meta de vendas e alertas (estoque baixo / vendas pendentes),
  a partir de `GET /home` — o mesmo endpoint que alimenta a tela Início do app mobile.

Tudo em `src/lib/api/*` e `src/lib/auth/*` é uma adaptação direta do que já existe em
`revendaja-mobile-1.0/src/api` e `src/auth`, para os dois apps falarem com o backend da mesma forma.

### Sessão no navegador

O access token (15 min) vive só em memória; o refresh token fica em `localStorage` para a sessão sobreviver a
um F5 (ver `src/lib/auth/tokenStorage.ts`). A API autentica por Bearer, não por cookie — não há proxy/BFF no
Next para isso.

## Próximos passos (fora do escopo desta entrega)

Catálogo, vendas, estoque, vitrine e configurações da loja ainda só existem no app mobile.
