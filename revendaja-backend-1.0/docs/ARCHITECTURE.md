# Arquitetura

## Ideia central: organização por funcionalidade (feature folders)

Em vez de separar o projeto por "tipo técnico" (uma pasta `controllers/` com todos os
controllers, outra `services/` com todos os services, etc.), cada funcionalidade de negócio
vive na sua própria pasta dentro de `src/modules/`, e **dentro dela** ficam todas as camadas
daquele recurso:

```
src/modules/store/
├── store.routes.ts       # define os endpoints HTTP e os schemas de validação
├── store.controller.ts   # traduz request/response HTTP <-> chamadas de service
├── store.service.ts      # regra de negócio (gera handle único, 1 loja por conta, etc.)
├── store.repository.ts   # acesso ao banco (Prisma) — o "banco" da funcionalidade
├── store.schema.ts       # schemas Zod (validação de entrada e forma da resposta)
├── store.types.ts        # tipos TypeScript do domínio
└── __tests__/
    └── store.service.test.ts
```

(Nem todo módulo precisa de todas as camadas — `users`, por exemplo, só tem
`repository`/`types`/`schema`, porque não expõe rotas próprias; ver "Fluxo de cadastro,
verificação e loja" abaixo.)

Vantagens desse modelo (às vezes chamado de "vertical slice"):

- Para entender ou alterar "usuários", você abre uma pasta e vê tudo que importa — não
  precisa pular entre `controllers/`, `services/` e `repositories/` espalhados pelo projeto.
- Cada módulo pode ser adicionado, removido ou testado isoladamente.
- Reduz a tentação de acoplar regras de negócio de features diferentes.

Cada módulo só se comunica com o mundo de fora através das funções que exporta
(`*.routes.ts` é o único arquivo que o `src/app.ts` conhece). Um módulo pode importar
coisas de outro módulo quando faz sentido de negócio (ex.: `auth` lê a tabela de usuários),
mas evite que módulos "invadam" o service/repository interno um do outro sem necessidade.

## Camadas dentro de cada módulo

```
requisição HTTP
      │
      ▼
  routes.ts        → registra a rota no Fastify, valida body/params/query com Zod
      │
      ▼
  controller.ts    → só entende HTTP: lê request, chama o service, formata a resposta
      │
      ▼
  service.ts       → regra de negócio pura (não conhece Fastify, nem request/reply)
      │
      ▼
  repository.ts    → única camada que fala com o Prisma/banco de dados
```

Essa separação existe para que a regra de negócio (`service.ts`) possa ser testada
com testes unitários simples, sem precisar subir um servidor HTTP nem um banco de dados —
basta injetar um repositório "fake" (veja `auth.service.test.ts`, `otp.service.test.ts` e
`store.service.test.ts`).

## Injeção de dependência simples

Cada `Service` recebe seu `Repository` pelo construtor, com o valor real como padrão:

```ts
export class StoreService {
  constructor(private readonly repository: StoreRepository = storeRepository) {}
}
```

Isso permite, nos testes, fazer `new StoreService(repositoryFalso)` sem precisar de
nenhum framework de DI/mocking de módulos — só um objeto plano com `jest.fn()`.

## Banco de dados

- **PostgreSQL** + **Prisma** como ORM. O schema (`prisma/schema.prisma`) é único e
  centralizado — é a "fonte da verdade" das tabelas (`User`, `OtpCode`, `Store`) — mas o
  **código que consulta** cada tabela fica no repositório do módulo dono daquele dado:
  `users.repository.ts` (tabela `users`), `otp.repository.ts` (tabela `otp_codes`) e
  `store.repository.ts` (tabela `stores`).
- O módulo `users` não expõe rotas HTTP próprias — ele só existe para centralizar o acesso
  à tabela de usuários, que `auth`, `otp` e o `requireVerified` (ver abaixo) importam e
  reaproveitam. Isso evita duplicar a mesma query em três lugares.

### Por que a senha (e o código OTP) nunca vazam na API

As rotas declaram um `response` schema (`userPublicSchema`, sem `passwordHash`). O
Fastify serializa a resposta **com base nesse schema como allow-list**: mesmo que o
controller devolva o objeto inteiro vindo do Prisma, qualquer campo fora do schema de
resposta é descartado antes de sair pela rede. Isso é reforçado, não substituído, pelo
fato de a senha e o código OTP só serem armazenados com hash (`bcryptjs`) — nunca em
texto puro, nem no banco nem em log.

## Fluxo de cadastro, verificação e loja

Três módulos cooperam nesse fluxo, cada um dono de uma responsabilidade:

```
auth      → orquestra o fluxo: cria a conta, emite tokens, decide isVerified/hasStore
otp       → gera, envia (via e-mail, por enquanto), verifica e reenvia o código de 6 dígitos
store     → gera o handle único e cria a loja
```

- **`POST /auth/register`** (`auth.service.register`): valida duplicidade de e-mail/
  WhatsApp, cria o `User` com `phone_verified_at = null`, chama `otpService.generateAndSend`
  e já emite `accessToken` + `refreshToken`. O token já é válido para chamadas
  autenticadas, mas rotas de negócio continuam bloqueadas até a verificação (ver
  `requireVerified` abaixo). Se o envio do e-mail falhar, o erro é logado mas o cadastro
  **não** é desfeito — a usuária pede outro código em `/auth/otp/resend`.
- **OTP** (`src/modules/otp`): o código de 6 dígitos nunca é armazenado em texto puro
  (`bcryptjs`, igual à senha). Regras aplicadas em `otp.service.ts`:
  - expira em `OTP_EXPIRATION_MINUTES` (padrão 10 min);
  - no máximo `OTP_MAX_ATTEMPTS` tentativas erradas (padrão 5) antes de exigir reenvio;
  - reenvio (`POST /auth/otp/resend`) tem **rate limit no servidor**, não só no app:
    cooldown de `OTP_RESEND_COOLDOWN_SECONDS` (padrão 30s) e teto de
    `OTP_RESEND_MAX_PER_HOUR` por hora — ambos verificados contra o histórico em
    `otp_codes`, não apenas confiando no cliente.
  - **Por enquanto o código vai por e-mail** (Resend), via `MailService`
    (`src/shared/mail`, ver "Código compartilhado"). A coluna `phone_verified_at` e o
    campo `whatsapp` continuam no banco — a verificação só mudou de canal. Quando o
    WhatsApp voltar, `src/shared/whatsapp/whatsappProvider.ts` (interface
    `WhatsAppProvider`, hoje só um mock que loga) é o ponto de partida; ele **não é
    usado** por nenhum módulo no momento.
  - Ao confirmar o código, `verify` envia o e-mail de boas-vindas. Falha nesse envio é
    apenas logada — a conta já está verificada e isso não deve virar erro para a usuária.
- **Store** (`src/modules/store`): `POST /store` recebe só `storeName`; o `handle` é
  gerado removendo acentos/espaços/símbolos (`lealperfumaria`) e, em caso de colisão,
  ganha um sufixo numérico (`lealperfumaria-2`). Uma loja por conta é garantido checando
  `Store.userId` (campo `@unique`) antes de criar.

## Autenticação e autorização (`src/modules/auth` + `src/shared/middlewares`)

- **Tokens**: `POST /auth/register` e `POST /auth/login` emitem um par
  `accessToken`/`refreshToken` (JWT, `jsonwebtoken`). São assinados com **segredos
  diferentes** (`JWT_SECRET` vs `JWT_REFRESH_SECRET`) e vidas diferentes (`JWT_EXPIRES_IN`
  = 15 min por padrão, `JWT_REFRESH_EXPIRES_IN` = 30 dias) — isso já isola os dois tipos de
  token (um refresh token não passa na verificação de uma rota comum) sem precisar de uma
  claim extra de "tipo" no payload. Os dois carregam também `sid`, o id da **sessão**
  (ver abaixo).
- **Refresh** (`POST /auth/refresh` `{ refreshToken }`, público — o access token já expirou,
  quem autentica é o próprio refresh token): valida o refresh token (segredo
  `JWT_REFRESH_SECRET`, então um access token nunca passa), confere no banco que a sessão
  (`sid`) ainda é a vigente da usuária e devolve **só um access token novo**, na mesma
  sessão. O refresh token **não é rotacionado**: vale até o fim da sessão (30 dias após o
  login) e a chamada é idempotente — repetir por falha de rede não derruba ninguém. O
  custo é não haver janela deslizante: depois de 30 dias é preciso logar de novo. Rotação
  com detecção de reuso é possível no futuro (exigiria guardar o hash do refresh token na
  sessão). Um 401 no refresh significa "faça login": sessão trocada, apagada ou expirada.
- **Sessão única** (`src/modules/sessions`, tabela `sessions`): cada conta tem no máximo
  UMA sessão ativa. `sessions.user_id` é `UNIQUE`, então o próprio banco impede duas. Todo
  login/cadastro chama `SessionService.start`, que gera um id novo e faz _upsert_ por
  `userId` — como os tokens carregam esse id (`sid`), **fazer login em outro aparelho
  derruba o anterior** (o token antigo passa a receber 401 "Sessão encerrada"). A sessão
  expira junto com o refresh token (`JWT_REFRESH_EXPIRES_IN`). `POST /auth/logout` apaga a
  sessão atual, e a redefinição de senha apaga a sessão da conta.
- **`authenticate`** (`src/shared/middlewares/authenticate.ts`): lê
  `Authorization: Bearer <accessToken>`, valida contra `JWT_SECRET`, **confere no banco que
  o `sid` é a sessão vigente da usuária** (e não expirou) e popula `request.userId` e
  `request.sessionId`. Custa uma consulta por request autenticado — é o preço de poder
  revogar. Tokens sem `sid` (emitidos antes desta mudança) são recusados: é preciso logar
  de novo. Usado como `preHandler` em toda rota autenticada.
- **`requireVerified`** (`src/shared/middlewares/requireVerified.ts`): roda depois de
  `authenticate`; busca o usuário no banco e checa `phoneVerifiedAt`. Consulta o banco a
  cada chamada em vez de confiar numa claim do token — o access token é emitido **antes**
  da verificação e nunca é reemitido depois, então uma claim ficaria desatualizada.
  Aceita uma mensagem customizada:

```ts
server.post(
  '/store',
  { preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de criar a loja.')] },
  createStore,
);
```

## Recuperação de senha (`src/modules/passwordReset`)

O cliente é um app, então **não há link**: a redefinição usa um código de 6 dígitos enviado
por e-mail, no mesmo formato do OTP de verificação.

- `POST /auth/forgot-password` `{ email }` → **sempre** `200 { sent: true }`, exista ou não
  conta com o e-mail. Também não revela cooldown, limite por hora nem falha no envio: nesses
  casos só sai sem fazer nada e loga o motivo. Se há conta e nenhum limite foi atingido,
  invalida os códigos anteriores e envia um novo por e-mail (cooldown de 30 s, teto de 5 por
  hora, validade de 15 min). _Ressalva honesta_: isso é higiene, não blindagem — `POST
/auth/register` já responde 409 "Já existe uma conta com este e-mail", então quem quiser
  descobrir se um e-mail tem conta consegue por lá.
- `POST /auth/reset-password` `{ email, code, password }`. **Toda** falha (e-mail sem conta,
  sem código pendente, expirado, tentativas esgotadas, já usado, código errado) devolve a
  mesma resposta: `400 PASSWORD_RESET_CODE_INVALID` "Código inválido ou expirado. Solicite um
  novo." — mensagens diferentes serviriam de oráculo. Sucesso: troca a senha, invalida os
  outros códigos, **apaga a sessão da conta** (quem estava logado com a senha antiga cai) e
  envia o e-mail "senha alterada". Não há login automático.
- **Por que 6 dígitos é aceitável aqui** (1 milhão de combinações é pouco): defesas em
  camadas, todas no banco (`password_reset_codes`):
  - só o **hash bcrypt** do código é guardado;
  - validade curta (15 min) e **uso único** (`used_at`, consumo atômico);
  - **no máximo 5 tentativas por código**, e o limite é imposto por um único
    `UPDATE ... WHERE attempts < 5 AND used_at IS NULL AND expires_at > now()` que já soma a
    tentativa (`claimAttempt`), executado **antes** de comparar o código. Ler o contador e
    depois incrementar deixaria N requisições paralelas testarem N palpites; com o UPDATE
    atômico só as 5 primeiras chegam a comparar (verificado contra o Postgres real: 40
    palpites simultâneos deixam `attempts` em exatamente 5, e o código certo depois disso
    continua recusado);
  - pedir outro código exige esperar o cooldown e conta no teto por hora, então o total de
    palpites possíveis por hora é da ordem de 25.
- Variáveis (`.env`): `PASSWORD_RESET_EXPIRATION_MINUTES` (15), `PASSWORD_RESET_MAX_ATTEMPTS`
  (5), `PASSWORD_RESET_COOLDOWN_SECONDS` (30), `PASSWORD_RESET_MAX_PER_HOUR` (5). Registros
  usados/expirados não são apagados automaticamente — uma limpeza periódica fica como
  melhoria futura.

## Vendas e finanças (`src/modules/sales`)

Tabelas: `sales` e `sale_items` (mais `stores.sale_counter` e `store_products.cost_price`).

- **`POST /sales`** registra uma venda e faz tudo numa **única transação**, ou nada:
  1. incrementa `stores.sale_counter` (o UPDATE trava a linha da loja: vendas simultâneas da
     mesma loja são serializadas e nunca repetem o número — "Venda #N", contíguo por loja);
  2. lê o **preço e o custo vigentes** dos produtos (o app **não envia preço**: o servidor é
     quem manda no valor da venda) e calcula o total em **centavos inteiros**;
  3. baixa o estoque com um UPDATE condicional (`stock >= quantidade`): o próprio banco recusa
     vender além do estoque, mesmo com vendas em paralelo (**409** "Estoque insuficiente para
     \"X\": disponível N.");
  4. grava a venda e os itens.
     Qualquer falha desfaz tudo — inclusive o número consumido e o estoque já baixado.
- **Idempotência:** `clientRequestId` (UUID gerado pelo app) é único por loja
  (`UNIQUE(store_id, client_request_id)`). Repetir a chamada devolve **a mesma venda com 200**
  (a primeira devolve 201) sem baixar estoque de novo — inclusive quando duas chamadas iguais
  chegam ao mesmo tempo: a segunda cai no índice único, tem a transação desfeita e recebe a
  venda da primeira.
- **Itens são uma cópia do momento da venda** (`product_name`, `product_image_sm`,
  `unit_price`, `unit_cost`): editar o preço/custo depois não altera vendas antigas, e remover
  o produto da loja só zera `store_product_id` (`ON DELETE SET NULL`) — o histórico e o
  resumo financeiro continuam idênticos.
- **Sem fiado:** a venda registrada pela própria loja (`POST /sales`) só aceita `pix`, `card` ou `cash`
  e **sempre nasce `paid`** (`on_account` no body dá 400). O valor `on_account` continua no enum do
  banco e nas respostas só para vendas antigas não quebrarem.
- **Origem da venda** (`sales.source`): `manual` (registrada pela loja no app) ou `online` (pedido do
  cliente na vitrine, ver "Vitrine online"). Pedido online **sempre nasce `pending`** e guarda o
  WhatsApp do cliente (`customer_whatsapp`); a loja recebe com `PATCH /sales/:id` `{ "status": "paid" }`.
  `GET /sales` aceita `?source=online|manual` e devolve `source` e `customerWhatsapp` em cada venda.
- **Regras:** `installments` só vale para `card` (sem informar = 1). O mesmo produto não pode aparecer
  duas vezes na venda (400 `DUPLICATE_SALE_ITEM`). Produto com `isActive = false` **pode** ser
  vendido: a visibilidade é só da vitrine. O status só sai de `pending`, com `PATCH /sales/:id`
  `{ "status": "paid" | "cancelled" }` (ver "Cancelamento" abaixo); nada volta a pendente.
- **Cancelamento** (`PATCH /sales/:id` `{ "status": "cancelled" }`, status `cancelled`): só um pedido
  **pendente** cancela. Numa única transação o UPDATE (que só casa `pending`) muda o status e o
  **estoque reservado volta** a cada produto da loja (`stock + quantidade`, em ordem de id, como na
  criação). É idempotente: cancelar de novo devolve a venda **sem devolver o estoque outra vez**, e
  duas chamadas simultâneas devolvem uma vez só. Venda **paga não cancela** (409), uma cancelada não
  vira paga (409), e item cujo produto saiu da loja não tem estoque a devolver. Pedido cancelado fica
  de fora do faturamento, do "a receber", das vendas pendentes da Início e de `ordersCount`; continua
  na lista (`?status=cancelled`).
- **`GET /sales/summary?from=&to=`** (período obrigatório; `from` inclusivo, `to` exclusivo):
  - `grossRevenue`: soma de **todas** as vendas do período (pagas + pendentes);
  - `pendingTotal`: soma das pendentes;
  - `profit`: soma de `(unitPrice - unitCost) * quantity` só dos itens de vendas **pagas que
    têm custo**; `null` se nenhum item tiver custo;
  - `marginPercent`: `profit` ÷ (preço × qtd desses mesmos itens) × 100, com 2 casas; `null`
    sem lucro;
  - `profitIsPartial`: existe item pago **sem** custo (o lucro o ignora).
    Custo `0` conta como custo informado; `null` é "não informado".
- **Custo nunca sai da API por venda:** a lista e o detalhe mostram só total, preços e
  subtotais — nenhum custo, lucro ou margem por venda. O custo só aparece em
  `StoreProduct.costPrice` (o produto da loja) e agregado no resumo.
- **Isolamento entre lojas:** toda consulta é escopada por `store_id` na própria query (uma
  loja nunca lê, altera nem vende produto de outra); `clientRequestId` e a numeração são
  independentes por loja.
- Datas de período são ISO-8601 com `Z` ou offset (ex.: `2026-09-01T00:00:00-03:00`); o app
  calcula os limites no fuso do aparelho.
- **Limite conhecido:** a transação faz uma ida ao banco por consulta e mantém a linha da loja
  travada. Em produção (servidor perto do banco) isso é irrelevante; com o banco remoto de
  desenvolvimento, ~10 vendas simultâneas da mesma loja já levam segundos. Por isso a
  transação tem `timeout` de 30 s e as vendas por chamada são limitadas a 50 itens.

## Tela Início (`src/modules/home`)

`GET /home?from=&to=&previousFrom=` devolve **tudo que a tela Início mostra numa chamada só**,
no formato da tela (o app não precisa somar, dividir nem varrer listas). O módulo não tem
tabela nem repository próprio: só compõe consultas de `sales` e `store`, em paralelo.

```jsonc
{
  "plan": { "id": "free", "name": "Free" }, // badge ao lado do nome
  "revenue": {
    "total": 4250.5, // card "Faturamento em <mês>": só vendas PAGAS
    "growthPercent": 44.08, // seta ↑/↓ ao lado; null = esconde
  },
  "goal": { "target": 5000, "percent": 85.01, "remaining": 749.5 }, // card "Meta de Vendas"; null = ainda não escolheu
  "alerts": {
    // seção "Atenção necessária"
    "lowStock": {
      "threshold": 25,
      "count": 7,
      "products": [{ "storeProductId": "…", "name": "…", "stock": 0 }],
    },
    "pendingSales": { "count": 3 },
  },
}
```

- **Período:** como em `/sales/summary`, o app manda os limites no fuso do aparelho (ISO-8601 com
  `Z` ou offset). O período atual é `[from, to)` e o anterior, usado só no crescimento, é
  `[previousFrom, from)` — o mês anterior colado no atual. Exige `previousFrom < from < to`.
- **Faturamento = só vendas pagas.** `revenue.total`, o crescimento e o progresso da meta contam
  apenas o que já foi recebido: uma venda antiga ainda pendente entra quando for paga. Por isso o
  número da Início pode ser menor que o "Faturamento Total Bruto" de Finanças (`GET /sales/summary`,
  que soma pagas + pendentes). A Início **não mostra lucro** (nem margem ou custo), então a rota não
  o calcula. O crescimento compara pagas com pagas; sem faturamento pago no período anterior é `null`
  (não há base — evita dividir por zero).
- **Meta:** `stores.monthly_goal` (`DECIMAL(12,2)`, nulo até a loja escolher — a API não inventa um
  valor). O app pede a escolha logo no início (`goal: null` na resposta) e grava com
  `PUT /store/goal` `{ "monthlyGoal": 5000 }` (de 0,01 a 9.999.999.999,99); depois a meta só pode ser
  trocada por outra, não removida. `percent` vai de 0 a 100 (limitado, a barra não passa do fim) e
  `remaining` é 0 quando a meta foi batida. A conta é feita em centavos inteiros, como no resto do
  módulo de vendas.
- **Plano:** `stores.plan` (enum `Plan`: `free`, `starter`, `premium`), sempre `free` ao criar a loja.
  A Início devolve `plan: { id, name }`. **Não há rota para trocar de plano** de propósito: sem
  cobrança, qualquer conta poderia se promover sozinha. Preço e limites de cada plano também ainda
  não existem — virão com a assinatura.
- **Alertas:**
  - `lowStock`: produtos da loja com `stock <= threshold` (25, definido no servidor e devolvido na
    resposta), esgotados e ocultos na vitrine inclusive. O estoque é opcional ao adicionar o produto
    (`POST /store/products` sem `stock` grava 0), então um produto cadastrado sem quantidade
    já conta aqui. `count` é o total; `products` traz só os 5
    mais críticos (menor estoque primeiro), suficiente para o subtítulo do alerta.
  - `pendingSales`: vendas pendentes de **qualquer período** — os pedidos da vitrine online que
    ainda esperam o pagamento. Continua sendo dinheiro a receber, então não some quando o mês vira.

## Tela Mais (`GET/PATCH /store/settings`)

A aba **Mais** mostra o plano da loja e duas configurações da vitrine. Tudo vive em `stores` e a rota
fica no módulo `store` (uma tabela só, sem agregação):

```jsonc
// GET /store/settings  e  PATCH /store/settings (devolve o mesmo formato, já atualizado)
{
  "plan": { "id": "free", "name": "Free" }, // card "Sua assinatura" (somente leitura)
  "acceptedPaymentMethods": ["pix", "card", "cash"], // switches "Aceitar Pix/Cartão/Dinheiro"
  "hideOutOfStock": true, // switch "Ocultar produtos sem estoque"
}
```

- **Colunas** (`stores`): `accepted_payment_methods` (`PaymentMethod[]`, padrão `pix, card, cash`) e
  `hide_out_of_stock` (`BOOLEAN`, padrão `true`). Lojas que já existiam recebem os padrões.
- **`PATCH`** só muda o que vier (ao menos um campo). `acceptedPaymentMethods` exige **ao menos uma**
  forma de pagamento, sem repetidas e **sem fiado** (`on_account` dá 400); é gravado sempre em ordem
  fixa (Pix, Cartão, Dinheiro). `hideOutOfStock: false` é um valor enviado, não "campo ausente". O
  plano e a meta não mudam por aqui (campos desconhecidos são ignorados).
- **Quem usa:** a vitrine online (ver "Vitrine online"): `acceptedPaymentMethods` é validado em cada
  pedido do cliente e `hideOutOfStock` filtra os produtos da vitrine pública.
- A contagem "N pedidos pela vitrine" da tela **não vem daqui**: é `ordersCount` de
  `GET /store/stats` (ver "Tela Minha Loja").

## Telas Minha Loja e Editar Loja (`PATCH /store`)

A tela **Minha Loja** (aberta por "Link Minha Loja", na aba Mais) mostra o nome, o usuário e o link da
vitrine — que já vêm de `GET /me` (`store`) — e tem o switch **Loja Online/Offline**:

- **`PATCH /store`** liga/desliga a vitrine e edita a identidade da loja. Todos os campos são
  **opcionais**, mas ao menos um é obrigatório, e só muda o que vier (o que já está igual não conta:
  repetir a chamada é idempotente e nem toca no banco). Devolve a loja no mesmo formato de
  `POST /store` e `GET /me` (`id`, `storeName`, `handle`, `catalogLink`, `isOnline`, `bio`, `createdAt`),
  para o app atualizar a sessão sem outra chamada.
  - `isOnline` — liga/desliga a vitrine (`stores.is_online`, padrão `true`). Tela Minha Loja.
  - `storeName` — 2 a 120 caracteres.
  - `handle` — o **link da vitrine**: minúsculas, números e hífen (sem começar, terminar ou repetir
    hífen), de 3 a 63 caracteres (é um subdomínio, cabe num rótulo de DNS); maiúsculas são aceitas e
    viram minúsculas. **Trocar o handle troca o `catalogLink` junto** (`https://{handle}.{domínio}`) e
    o endereço antigo **deixa de funcionar** (as rotas públicas passam a responder
    `STORE_NOT_FOUND`); não há redirecionamento. Link de outra loja ou reservado (`www`, `api`,
    `admin`, `suporte`...) dá **409 `HANDLE_UNAVAILABLE`** — a mesma resposta nos dois casos, para não
    revelar qual. Se duas lojas disputarem o mesmo link no mesmo instante, o índice único do banco
    decide e a perdedora também recebe o 409 (nunca 500).
  - `bio` — descrição curta (até 280 caracteres, aparece no topo da vitrine). Texto vazio ou `null`
    **limpa** a descrição. Coluna `stores.bio`, nula por padrão.
    Campos desconhecidos (`userId`, plano, meta...) são ignorados.
- **Loja desativada some da vitrine:** com `isOnline = false` **todas** as rotas públicas respondem 404
  `STORE_OFFLINE` (vitrine, visita e pedido). É assim que a loja é "desativada".
- **`GET /store/stats`** → `{ "visitsLast7Days": 184, "ordersCount": 13 }`: visitas dos últimos 7 dias
  (janela móvel de 168 h até agora) e o total de pedidos feitos pela vitrine (`sales.source = online`,
  qualquer período e status, exceto os cancelados). A dona vê os números mesmo com a loja desativada.

## Tela Vendas Recentes (`GET /sales?source=online` + `GET /sales/summary?source=online`)

A tela **Vendas Recentes** (aba Mais, logo abaixo de Editar Loja) lista os **pedidos feitos pela
vitrine** e resume o dinheiro deles. Usa as rotas de vendas com o filtro de origem:

- **Lista:** `GET /sales?source=online&from=&to=&status=&page=&pageSize=` (mais recente primeiro). Cada
  venda traz `source`, `status`, `customerName` e `customerWhatsapp` (só dígitos).
- **Resumo:** `GET /sales/summary?from=&to=&source=online` devolve os mesmos números de Finanças
  (`grossRevenue`, `pendingTotal`, `profit`, `marginPercent`, `profitIsPartial`), **só dos pedidos da
  vitrine** (`source` também aceita `manual`; sem ele, todas as vendas). O app pede os **últimos 30 dias**.
- **Detalhe:** o mesmo de Finanças (`GET /sales/:id`), onde a loja marca como recebido, cancela e vê o
  WhatsApp do cliente.

## Vitrine online (`src/modules/storefront`)

Rotas **públicas** (sem login), usadas pelo **revendaja-web**, mais `GET /store/stats` (do app). Ficam
sob `/public/stores/:handle` (o `handle` é o usuário da loja, aceito em qualquer caixa). Loja
inexistente responde **404 `STORE_NOT_FOUND`** e loja desativada **404 `STORE_OFFLINE`**.

- **`GET /public/stores/:handle`** — `{ store: { storeName, handle, bio, acceptedPaymentMethods }, products }`
  (`bio` é a descrição da loja, ou `null`).
  `products` é paginado (`page`, `pageSize` até 60, `search` por nome ou código de barras). Só entram
  produtos **visíveis** (`isActive`); se a loja escolheu ocultar sem estoque (`hideOutOfStock`), os
  zerados também ficam de fora, senão aparecem com `inStock: false`. Cada produto traz `id` (o id do
  produto **da loja**, usado no pedido), `name`, `description`, `brand`, `image`, `imageSm`, `price` e
  `inStock`. **Nunca** sai custo, estoque exato, meta, plano ou dados do catálogo interno.
- **`POST /public/stores/:handle/visits`** — 204 sem corpo. O site chama **uma vez por visita** (ao abrir a
  vitrine); cada chamada grava uma linha em `store_visits` (só o momento, sem dado do visitante).
- **`POST /public/stores/:handle/orders`** — cria o pedido do cliente. Body: `clientRequestId` (UUID),
  `customerName`, `customerWhatsapp` (aceita máscara; guarda só os dígitos, 10 a 15), `paymentMethod`
  (`pix`/`card`/`cash`, **precisa estar em `acceptedPaymentMethods`** da loja, senão 400
  `PAYMENT_METHOD_NOT_ACCEPTED`), `installments` (só cartão) e `items` (`storeProductId` + `quantity`).
  O **preço nunca vem do cliente**. O pedido vira uma **venda `pending` com `source = online`** pela
  mesma transação da venda da loja: numera ("Pedido/Venda #N"), **reserva o estoque** e é idempotente
  por `clientRequestId` (201 novo, 200 repetido sem baixar estoque de novo). Só vende produto visível
  na vitrine (senão 404) e recusa além do estoque (409). A resposta é um comprovante: `number`,
  `status`, `total`, `paymentMethod`, `installments`, `customerName`, `createdAt`, `expiresAt` e os itens — **sem** id
  da venda, WhatsApp, custo nem ids internos.
- **Limite de requisições** (`@fastify/rate-limit`, **por IP**, só nestas rotas; o resto da API não é
  limitado): vitrine **120/min**, visitas **30/min** e pedidos **10/hora** (cada rota tem o seu
  contador). O limite roda antes da validação, então um robô mandando corpo vazio também é contido.
  Acima disso: **429** `TOO_MANY_REQUESTS` no formato de erro da API, com `Retry-After`. Os contadores
  ficam na **memória de cada instância** (com várias instâncias o limite efetivo multiplica; para um
  limite global seria preciso um Redis). **Atrás de um proxy/balanceador** ligue `TRUST_PROXY=true`
  (só com proxy confiável): sem isso todos os clientes parecem vir do IP do proxy e dividem um único
  limite; com ele ligado sem proxy, o IP poderia ser forjado pelo `X-Forwarded-For`.
- **Pedido que nunca é pago é cancelado sozinho:** um job (`sales.expiration.ts`, iniciado em
  `server.ts`) roda na subida e **a cada 15 minutos** e cancela os pedidos **online** que continuam
  `pending` há mais de `ONLINE_ORDER_EXPIRATION_HOURS` (padrão **48 h**, mínimo 1), devolvendo o
  estoque que reservavam. Só os `online`: uma venda pendente registrada pela própria loja não é
  tocada. Usa o mesmo cancelamento da loja (`salesRepository.cancel`), então é seguro com várias
  instâncias e contra o pagamento — se a loja recebeu no meio do caminho, o UPDATE (que só casa
  `pending`) não cancela. Processa até 100 pedidos por lote e 50 lotes por rodada, e a busca usa o
  índice `(status, source, created_at)`. O comprovante do pedido traz `expiresAt` (criação + prazo)
  para o site avisar o cliente. Um pedido cancelado por prazo aparece como `cancelled`, igual ao
  cancelado à mão; a loja ainda pode cancelar antes. As rotinas periódicas usam o helper
  `src/shared/jobs.ts`, que só loga uma falha e tenta de novo na rodada seguinte.
- **Limpeza das visitas:** um job (`storefront.cleanup.ts`, iniciado em `server.ts`) apaga, na subida e
  a cada 24 h, as visitas mais antigas que `STORE_VISITS_RETENTION_DAYS` (padrão **30**, mínimo 7 — a
  tela usa os últimos 7 dias). Uma falha só é logada e a rodada seguinte tenta de novo; com várias
  instâncias todas apagam o mesmo intervalo, o que é inofensivo.
- **Ainda em aberto:** um bot com **muitos IPs** (ou que contorne o limite) ainda consegue criar
  pedidos falsos; a defesa seguinte seria confirmar o WhatsApp do cliente por código ou usar captcha.

Próximos passos naturais (fora de escopo por enquanto): bio/produtos/clientes da loja, vitrine pública, planos/assinatura.

## Notificações (`src/modules/notifications`)

Notificações **in-app** (persistidas, listáveis, com lido/não lido) e **push** (Expo). Modelo de
dados é **fan-out**: mesmo um broadcast para todo mundo ou para um plano grava **uma linha por
destinatário** em `notifications` — isso torna a listagem e a segurança triviais (sempre
`WHERE userId = request.userId`, sem tabela de leitura por usuário separada).

- **Admin** (`authenticate` + `requireAdmin` — exige `User.role = 'admin'`, promovido manualmente
  no banco, sem rota para isso):
  - `POST /notifications/admin/all` e `POST /notifications/admin/plan` — **assíncronos**: só
    enfileiram o job `notification:fanout` e respondem **202** na hora. O worker resolve os
    destinatários em lotes de 500 (cursor), grava as notificações do lote e enfileira **um**
    `push:send` por lote (não um por usuário). É assim que um broadcast grande não trava a
    resposta do admin nem sobrecarrega o banco numa request só.
  - `POST /notifications/admin/user/:userId` — síncrono, 1 usuária só (404 se não existir).
- **Usuária autenticada**: `GET /notifications` (paginado, `{items,page,pageSize,total}`),
  `GET /notifications/unread-count`, `PATCH /notifications/:id/read` (idempotente, 404 cruzado
  entre usuárias), `PATCH /notifications/read-all`.
- **Tokens de push do dispositivo** (Expo): `POST` e `DELETE /notifications/device-tokens[/:token]`,
  guardados em `push_tokens` (upsert por `token`, não por usuária — o mesmo aparelho logando em
  outra conta migra o token em vez de duplicar).
- **Automáticas**, via 3 jobs recorrentes do BullMQ (ver infra abaixo):
  - `notification:stock-check` — varre `StoreProduct` com `minStock > 0` (configurável por produto
    nas rotas de `store`). Anti-duplicação: `lowStockNotifiedAt` só é setado uma vez enquanto o
    estoque continuar baixo (`claimLowStockNotification`, atômico) e é liberado
    (`resetLowStockNotification`) quando o estoque volta pra cima do mínimo.
  - `notification:goal-check` — para lojas com `monthlyGoal`, notifica 1x por mês ao cruzar
    `NOTIFICATION_GOAL_THRESHOLD_PERCENT` (padrão 80%). Anti-duplicação vem do índice único de
    `store_goal_notifications` (`storeId, monthKey, threshold`) — a tabela existe (em vez de um
    campo na `Store`) pra deixar a porta aberta a outros gatilhos de meta no futuro.
  - `notification:promotion` — roda **todo dia**, mas cada loja só é notificada se já passaram
    `NOTIFICATION_PROMOTION_INTERVAL_DAYS` dias (padrão 3) desde a última vez (ou desde a criação,
    se nunca notificada): o "3 em 3 dias" é uma propriedade por loja, não a frequência do job.
    Mensagem sorteada entre templates fixos (`notifications.promotionTemplates.ts`).

**Fila (`src/shared/queue`, novo — BullMQ + Redis, `REDIS_URL`)**: uma única `Queue`/`Worker` para
todos os jobs acima, despachados por `job.name` (`notifications.worker.ts`). Os 3 recorrentes são
registrados no boot de forma idempotente (`upsertJobScheduler` — reiniciar o processo atualiza o
agendamento em vez de duplicar). Se o Redis cair, a API continua no ar servindo venda/estoque
normalmente (só loga o erro): é uma exceção deliberada ao "fail-fast" do resto do projeto, porque
notificação é secundária ao core de venda. Nos testes, `bullmq` e `ioredis` são mockados
globalmente (`src/__mocks__/`) — sem isso, o simples `import` do módulo (registrado em `app.ts`)
tentaria abrir uma conexão real em **todo** teste do projeto, não só os de notificações.

**Push (`src/shared/push`, novo — `expo-server-sdk`)**: `PushNotificationService` é uma camada
independente do resto (só recebe tokens + payload, nunca sabe de quem é o token) que nunca lança
erro pra quem chamou e remove do banco qualquer token que o Expo devolva como
`DeviceNotRegistered`. Envio nunca acontece na request HTTP nem no service síncrono — sempre via o
job `push:send`, enfileirado sempre que uma notificação in-app é criada.

## Código compartilhado (`src/shared` e `src/config`)

- **CORS** (`src/app.ts`): libera `GET, HEAD, POST, PUT, PATCH, DELETE` de qualquer origem
  (`*`). O padrão do `@fastify/cors` só libera GET/HEAD/POST, o que faria o preflight do
  navegador falhar em `PATCH`/`DELETE` (edição/remoção de produtos da loja). `*` é
  aceitável porque a autenticação é por header Bearer, não por cookie; se um dia houver
  cookie, restrinja a origem.
- **Datas nas respostas**: os schemas de resposta usam `z.date()`. O serializador do
  `@fastify/type-provider-zod` mantém o `Date`, que o JSON converte em ISO-8601
  (`2026-09-23T12:00:00.000Z`), e o OpenAPI documenta como `string`/`date-time`. Não use
  `z.coerce.string()` para datas: ele produz `Date.toString()`, dependente de fuso e idioma.

- `src/config/env.ts`: lê e valida `process.env` com Zod uma única vez, na subida da
  aplicação. Se faltar variável obrigatória, a aplicação falha imediatamente com uma
  mensagem clara — em vez de falhar de forma obscura em algum ponto no meio da execução.
- `src/shared/errors`: uma hierarquia pequena de erros de domínio (`NotFoundError`,
  `ConflictError`, `UnauthorizedError`, `ForbiddenError`, `TooManyRequestsError`) e um
  `errorHandler` central registrado no Fastify, que traduz esses erros (e erros de
  validação do Zod) para o status HTTP correto.
- `src/shared/middlewares`: middlewares reaproveitáveis por mais de um módulo —
  `authenticate` (valida o token) e `requireVerified` (exige conta verificada).
- `src/shared/mail`: e-mails transacionais, em três camadas:
  - `mailProvider.ts` — interface `MailProvider` + duas implementações: Resend (quando
    `RESEND_API_KEY` está definida) e console (só loga; padrão em dev/test). Em produção
    a chave é obrigatória (`env.ts` falha na subida sem ela).
  - `mailService.ts` — `MailService`, o que os módulos usam: `sendVerificationCode`,
    `sendWelcome`, `sendPasswordReset`, `sendPasswordChanged`. Cada método monta o
    template e entrega pelo provider; quem chama não conhece HTML nem a Resend.
  - `templates/` — funções puras `(dados) => { subject, html, text }`, com layout de
    tabelas + estilos inline (compatível com Gmail/Outlook). Todo dado da usuária passa
    por `escapeHtml`. Para criar um modelo novo: crie o template, adicione um método no
    `MailService` e um teste em `__tests__/templates.test.ts`.
  - `sendPasswordReset` e `sendPasswordChanged` são usados pelo módulo
    `passwordReset` (ver "Recuperação de senha").
- `src/shared/whatsapp`: abstração do envio de WhatsApp (`WhatsAppProvider`). Hoje sem
  uso (o OTP migrou para e-mail), mantida para quando o canal voltar.
- `src/shared/logger.ts`: instância única do Pino, usada tanto pelo Fastify (logs de
  request) quanto fora do contexto de request (ex.: mensagens de bootstrap em `server.ts`).

## Documentação da API

O Swagger/OpenAPI é gerado automaticamente a partir dos mesmos schemas Zod usados para
validar as rotas (`@fastify/type-provider-zod` + `@fastify/swagger`). Não existe uma
segunda fonte de verdade para manter sincronizada: documentar bem o schema Zod já
documenta a API. A UI fica disponível em `/docs` com o servidor rodando.

## Adicionando um novo módulo

1. Crie `src/modules/<nome>/` com `*.schema.ts`, `*.repository.ts`, `*.service.ts`,
   `*.controller.ts`, `*.routes.ts` e uma pasta `__tests__/`.
2. Registre a função `<nome>Routes` em `src/app.ts`.
3. Se o módulo tiver uma tabela nova, adicione o `model` em `prisma/schema.prisma` e rode
   `npm run db:migrate`.
