# Custo por cliente e proposta de planos

> Cotação usada nas conversões: **R$ 5,40 por US$ 1,00** (aproximada, varia — os preços de origem
> são todos em dólar). Preços consultados nas páginas oficiais de cada serviço em set/2026;
> confira antes de fechar orçamento, esses valores mudam.

## Resumo executivo

O **custo variável real por cliente é baixíssimo** (menos de R$ 1,00/mês mesmo pra uma loja
grande) — banco de dados, S3 e e-mail escalam quase de graça no volume de dados que uma loja de
revenda gera. O custo que **realmente importa** pra decidir os planos é o **custo fixo** (servidor
da API, e o tempo de quem mantém e dá suporte ao app), que precisa ser dividido pelo número de
lojas ativas. Por isso:

- **Não dá pra precificar "custo + margem" por cliente** — o custo direto é irrelevante perto do
  preço de qualquer plano pago. O preço dos planos Inicial/Pro/Empresarial deve ser definido pelo
  **valor entregue** (quanto a consultora fatura/economiza usando o app) e pelo que o mercado
  brasileiro de ferramentas pra revendedora já cobra, não pelo custo de servidor.
- O que o custo direto define é **quanto o plano Gratuito pode "aguentar"** sem virar prejuízo em
  escala, e **a partir de quantos clientes pagantes a operação se sustenta**.

## O que já está confirmado no código (não é estimativa)

| Serviço | Uso no Revendajá | Onde está configurado |
|---|---|---|
| **Postgres (Neon)** | Banco principal — lojas, produtos, vendas, categorias | `DATABASE_URL` |
| **AWS S3** | Foto de produto manual/kit (upload via `/uploads/product-image`, até 5 MB, com validação de tipo real do arquivo) | `AWS_*`, `S3_BUCKET_NAME` em `src/config/env.ts` |
| **Resend** | E-mail transacional: código de verificação (OTP) e de redefinição de senha | `RESEND_API_KEY`, `MAIL_FROM` |
| **WhatsApp** | **Custo zero** — o app abre o `Share` nativo do celular (a própria consultora escolhe o WhatsApp na hora); não existe integração paga com a API do WhatsApp Business | `Share.share()` no app |

O que **não está confirmado** (não achei configuração no repositório) e entra como estimativa:
onde a API (o servidor Fastify) está hospedada. Uso Render/Railway como referência abaixo por
serem citados como exemplo de proxy no próprio `.env` de configuração — mas confirme o provedor
real antes de fechar número.

## Custo por categoria

### 1. Banco de dados (Neon)

Preço oficial: **US$ 0,35/GB-mês de armazenamento** + **US$ 0,106/hora de computação (CU)** no
plano Launch (US$ 0,222/hora no Scale). O plano Free cobre 0,5 GB de armazenamento e 100 horas de
computação por mês, e a computação hiberna sozinha depois de 5 min sem uso — então uma base
pequena de lojas pode rodar de graça por um bom tempo.

**Armazenamento por loja** (a parte que realmente escala por cliente): uma linha de produto
(`StoreProduct`) ocupa uns 300–400 bytes com índices. Uma loja com **1.000 produtos** (bem mais que
o "100+" do público-alvo) e um histórico de **1 ano de vendas** (600 vendas × 2–3 itens) fica em
torno de **2–4 MB no total**. A **R$ 1,89/GB-mês** (0,35 × 5,40), isso é **menos de R$ 0,01/mês por
loja** — nem arredonda pra um centavo.

**Computação** é o item que pesa, mas é um recurso **compartilhado** entre todas as lojas (não dá
pra fatiar "por cliente" de forma limpa) — depende de quantas requisições por segundo o servidor
todo recebe, não de quantos produtos uma loja tem. Ver tabela de escala abaixo.

### 2. Armazenamento de imagens (S3)

Preço oficial: **US$ 0,023/GB-mês** de armazenamento, **US$ 0,0004/1.000 leituras (GET)**,
**~US$ 0,005/1.000 uploads (PUT)**, e **100 GB de saída de dados por mês grátis** (depois disso,
~US$ 0,09/GB).

Só o **produto manual/kit** sobe foto pro S3 (produto de catálogo usa a imagem que já vem do
catálogo global, não é upload da loja). Uma loja com **50 produtos próprios**, foto de ~500 KB cada
(compressão de 0,8 já aplicada no app) = 25 MB → **R$ 0,003/mês** de armazenamento. Upload e
leitura dessas fotos: também fração de centavo por mês.

O único item que cresce de verdade é a **saída de dados** (bandwidth) quando a vitrine pública é
visitada — cada visita carrega as miniaturas dos produtos. Uma vitrine popular com 5.000
visitas/mês, ~20 fotos por visita (~50 KB cada) = ~5 GB/mês → **~R$ 2,40/mês** depois de estourada
a franquia gratuita de 100 GB (que é por conta inteira, somando todos os clientes, não por loja).
Isso tende a acontecer só em lojas Pro/Empresarial com bastante tráfego — é o item mais "honesto"
pra cobrar mais de quem usa mais.

### 3. E-mail transacional (Resend)

Plano gratuito: **3.000 e-mails/mês** (até 100/dia). Depois disso, **a partir de US$ 20/mês**
(≈ R$ 108) pro próximo volume. Uma consultora troca senha ou confirma cadastro raramente — 2 a 5
e-mails por mês é uma estimativa generosa. Isso significa que a **franquia grátis do Resend cobre
sozinha algo entre 600 e 1.500 contas ativas** antes de precisar de plano pago — praticamente
grátis na fase inicial.

### 4. Servidor da API (hospedagem do backend)

Não é um custo por cliente — é fixo e **dividido pelo número de lojas ativas**. Com Render ou
Railway (as duas referências mais comuns pra uma API Node pequena, hoje), um serviço leve fica
entre **US$ 7 e US$ 25/mês** (≈ R$ 38–135) pra tráfego baixo/médio, subindo com o uso.

| Lojas ativas | Custo do servidor (estimado) | Rateio por loja |
|---|---|---|
| 50 | R$ 40–70/mês | R$ 0,80–1,40 |
| 200 | R$ 70–135/mês | R$ 0,35–0,70 |
| 1.000 | R$ 200–500/mês (precisa subir de plano) | R$ 0,20–0,50 |

### 5. Taxa de cobrança (só planos pagos)

Se a cobrança das mensalidades passar por um gateway (Stripe, Pagar.me, Mercado Pago assinaturas),
a taxa típica no Brasil é **~4% + R$ 0,40 por cobrança no cartão**, ou **~1% no Pix**. Isso não é
custo de infraestrutura — é uma fatia da receita, mas precisa entrar na conta de margem líquida de
quem paga.

## Custo total por cliente — panorama

| Item | Loja leve (~30 produtos) | Loja média (~150 produtos) | Loja grande (~1.000 produtos, vitrine com tráfego) |
|---|---|---|---|
| Banco (armazenamento) | < R$ 0,01 | < R$ 0,01 | < R$ 0,01 |
| S3 (fotos + tráfego da vitrine) | < R$ 0,01 | ~R$ 0,05 | ~R$ 0,50–2,50 |
| E-mail | < R$ 0,01 | < R$ 0,01 | < R$ 0,01 |
| Servidor (rateado, cenário 200 lojas) | ~R$ 0,50 | ~R$ 0,50 | ~R$ 0,50 |
| **Total direto/mês** | **~R$ 0,50** | **~R$ 0,55** | **~R$ 1,00–3,00** |

Ou seja: mesmo a loja "grande" custa menos de R$ 3/mês pra manter no ar. Qualquer plano pago acima
de R$ 15–20/mês já tem margem bruta acima de 90%.

## Proposta dos 4 planos

Nomes que você já definiu: **Gratuito, Inicial, Pro, Empresarial**. Abaixo, o que sugiro de limite
e o preço — separando o que **já existe hoje no app** do que **ainda precisa ser construído**.

### Gratuito — R$ 0

- Até **30 produtos** no estoque.
- Vitrine pública ativa, mas **sem** categorias, promoção nem relatórios.
- Sem cadastro manual/kit (só produtos do catálogo).
- Suporte só por e-mail, sem prazo.
- Objetivo: deixar a consultora testar e sentir o app funcionando antes de pagar qualquer coisa.
- Custo real: praticamente zero (a franquia grátis de Neon/Resend/S3 cobre sozinha uma base
  inicial de contas gratuitas).

### Inicial — sugestão R$ 29,99/mês

- Até **200 produtos**.
- Cadastro manual/kit, categorias e promoção **liberados** (já existem no app hoje).
- Relatórios básicos (mais vendidos).
- Suporte por e-mail com prioridade.
- **Tudo aqui já dá pra entregar sem desenvolvimento novo.**

### Pro — sugestão R$ 49,99/mês

- Produtos **ilimitados**.
- Todos os relatórios (mais vendidos + parados).
- Vitrine sem a marca "Revendajá" (rodapé "Powered by") — **precisa de um campo novo** (algo como
  `Store.whiteLabel`) e um ajuste no site da vitrine; não existe hoje.
- Suporte prioritário (WhatsApp/chat).
- **Parcialmente pronto**: os relatórios e o cadastro ilimitado já existem; o "sem marca" é
  desenvolvimento novo, pequeno.

### Empresarial — sugestão R$ 129,99/mês

- Tudo do Pro.
- **Múltiplas usuárias por loja ou múltiplas lojas por conta** — hoje o banco tem
  `Store.userId` **único** (uma conta = uma loja, um usuário só): isso **não existe** e precisa de
  uma tabela nova (loja ↔ usuários, com papéis) antes de vender essa promessa.
- Exportação de dados / relatório por período customizado — também precisa de endpoint novo.
- Suporte dedicado.
- **É o único plano que depende de trabalho de desenvolvimento de verdade antes de poder ser
  vendido como está descrito aqui** — os outros três são só configuração/preço.

### Nota técnica: limites já implementados no código (2026-09-26)

`prisma/schema.prisma` já tem os 4 valores (`enum Plan { free starter premium business }`,
migration `20260926120000_add_business_plan`). Os nomes exibidos e os limites de cada plano vivem
em `src/modules/store/store.plans.ts` (`STORE_PLAN_NAMES` / `STORE_PLAN_LIMITS`):

- **Gratuito**: até 30 produtos, sem cadastro manual/kit, sem categorias, sem preço promocional.
- **Inicial**: até 200 produtos, com cadastro manual/kit, categorias e promoção liberados.
- **Pro** e **Empresarial**: produtos ilimitados, tudo acima liberado.

A checagem roda em `store.service.ts` (`addProduct`, `addManualProduct`, `createCategory` e
`updateProduct`), devolvendo `403 PLAN_LIMIT_REACHED` com uma mensagem pronta pra exibir quando o
teto é atingido ou o recurso não existe nesse plano. O app mobile já mostra essa mensagem sem
código novo (o formulário de produto/categoria já cai no tratamento de erro genérico).

**Ainda falta** (são recursos novos, não "limite a mais"): tirar a marca Revendajá da vitrine no
Pro, múltiplas usuárias por loja e exportação de dados no Empresarial, e a própria cobrança —
hoje o plano só muda direto no banco, não existe checkout nem rota para trocar de plano.

## Resumo de margem

| Plano | Preço | Custo direto/mês | Margem bruta | Observação |
|---|---|---|---|---|
| Gratuito | R$ 0 | ~R$ 0,50 (rateado) | — | Custo de aquisição, não de venda |
| Inicial | R$ 29,99 | ~R$ 0,55 | ~97% | Taxa de gateway (~4% + R$0,40) ainda reduz a margem líquida |
| Pro | R$ 49,99 | ~R$ 1,50 | ~97% | |
| Empresarial | R$ 129,99 | ~R$ 3,00 | ~97,5% | Precisa do desenvolvimento citado acima antes de vender |

## O que decide se isso é lucrativo (não é o custo por cliente)

1. **Quantas contas ficam no Gratuito pra sempre** vs. quantas migram pra um plano pago — o
   Gratuito só "paga a conta" enquanto a base pagante cobre o servidor fixo.
2. **A partir de quantas lojas pagantes o custo fixo (servidor + seu tempo de suporte) se dilui** —
   pelas contas acima, uns **20 a 30 assinantes do Inicial** já cobrem o servidor pra centenas de
   contas gratuitas por cima.
3. O preço de venda deve ser comparado com o que a consultora **economiza ou fatura a mais** usando
   o app (menos tempo organizando estoque, vitrine própria, relatório de parados evitando prejuízo)
   — não com o custo de rodar o servidor, que é irrelevante no valor final.
