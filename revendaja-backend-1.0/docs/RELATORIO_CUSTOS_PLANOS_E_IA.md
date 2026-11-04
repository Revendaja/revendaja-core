# Relatório: custo por cliente, planos e melhorias (com o assistente de IA)

> Atualizado em **03/11/2026**. Complementa e substitui os números de
> [`CUSTOS_E_PLANOS.md`](./CUSTOS_E_PLANOS.md) (set/2026), que não tinha IA, voz, cobrança nem a
> hospedagem real.
>
> **Atualização:** as seções 1 a 8 consideram todos os assinantes pagando pela Stripe e não incluem o imposto do MEI. A [seção 9](#9-canais-de-venda-stripe-apple-e-google-play-e-imposto-do-mei) refaz as contas com a comissão de cada canal (Stripe, Apple e Google Play) e com o DAS do MEI, e é o que o painel de administração usa.
>
> **Cotação:** R$ 5,40 por US$ 1,00 (a mesma do documento anterior). Todos os valores em R$ salvo
> onde indicado.
>
> **Como ler os números:** o que foi **medido no seu sistema** está marcado como _(medido)_; o que
> vem de página de preços como _(preço oficial)_; o que é suposição minha como _(premissa)_. Nenhum
> valor aqui foi inventado sem esse aviso. As contas estão num script reproduzível (ver
> [Apêndice](#apêndice-como-reproduzir-os-números)).

---

## 1. Resumo executivo

1. **A IA é barata, quase irrelevante no custo.** Com o `gpt-6-luna`, uma mensagem do assistente
   custa em média **R$ 0,0065** (menos de 1 centavo); 100 mensagens custam **R$ 0,65**. Uma
   mensagem por voz de 20 segundos soma mais **R$ 0,008**.
2. **O maior custo variável por cliente pagante é a taxa do gateway de pagamento** (~5% do preço),
   não a IA nem a infraestrutura. Cliente do plano Inicial: R$ 2,21/mês de custo, dos quais
   R$ 1,59 são taxa de cartão.
3. **A margem de contribuição está entre 90% e 93% no uso típico** e **entre 68% e 83% no pior
   caso** (cliente que gasta 100% da cota do assistente todo mês, só com operações pesadas e voz).
4. **O custo que decide a operação é o fixo** (servidor, bancos, conta de loja de apps): **R$ 86/mês
   no modelo enxuto, R$ 257/mês no modelo estável**. Para só cobrir a infraestrutura bastam **2 a 6
   assinantes**; para pagar também o seu tempo (ex.: R$ 3.000/mês) são necessários cerca de **75 a
   80 assinantes**.
5. **O risco real de custo é trocar de modelo.** No `gpt-6-sol` (o modelo maior) a mesma mensagem
   custaria **~20 vezes mais** (R$ 0,13). Aí o plano Empresarial passaria a gastar ~R$ 78/mês só de
   IA (60% do preço). As cotas atuais só são seguras com o Luna; ver
   [seção 5](#5-seguranca-de-custo-da-ia).
6. **Há uma inconsistência de produto que vale corrigir antes de vender:** o app anuncia
   _relatórios por plano_, _vitrine sem marca_, _múltiplas usuárias_ e _exportação_, e **nada disso
   é bloqueado ou existe no código** (detalhes na [seção 6](#6-o-que-cada-plano-inclui)).

---

## 2. Premissas e fontes

### 2.1 Preços usados

| Item                                                                 | Valor                                                                            | Origem                                                                                                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IA — `gpt-6-luna`                                                    | US$ 0,10 entrada · US$ 0,01 entrada em cache · US$ 0,50 saída, por 1 M de tokens | _(preço oficial)_ [OpenAI — Pricing](https://developers.openai.com/api/docs/pricing)                                                                                                    |
| IA — `gpt-6-sol` (referência)                                        | US$ 2,00 · US$ 0,20 · US$ 10,00 por 1 M                                          | _(preço oficial)_ mesma página                                                                                                                                                          |
| Transcrição de voz — `gpt-transcribe`                                | US$ 0,0045 por minuto                                                            | _(preço oficial)_ mesma página                                                                                                                                                          |
| Servidor — Fly.io, 1 máquina `shared-cpu-1x` com 1 GB, sempre ligada | ≈ US$ 6,70/mês (R$ 36)                                                           | _(fonte secundária)_ [Fly.io — Resource Pricing](https://fly.io/docs/about/pricing/) e comparativos de 2026; **confirme na sua fatura**                                                 |
| Taxa de cobrança (Stripe, cartão nacional)                           | 3,99% + R$ 0,39 por cobrança                                                     | _(fonte secundária)_ a própria Stripe Brasil não apareceu na pesquisa; **confirme no seu painel**. Pode haver acréscimo da cobrança recorrente (a fonte cita 0,7% do volume no Billing) |
| Banco (Neon), S3, e-mail (Resend)                                    | mesmos do documento anterior                                                     | [`CUSTOS_E_PLANOS.md`](./CUSTOS_E_PLANOS.md)                                                                                                                                            |

### 2.2 O que foi medido no seu sistema

| Medida                                                                         | Valor                                                        | Como                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Pedido-base enviado ao modelo (instruções + 28 ferramentas + 1 mensagem curta) | **5.120 tokens**                                             | API de contagem da OpenAI, com o código atual                                                                             |
| Só as instruções                                                               | 884 tokens                                                   | idem — ou seja, **~4.200 tokens são a definição das ferramentas**                                                         |
| Consumo real registrado até agora                                              | 3 mensagens: 4.583 tokens de entrada e 98 de saída, em média | tabela `ai_usage` do banco. **Amostra pequena** (3 mensagens), com o conjunto antigo de ferramentas; serve só de sanidade |

### 2.3 Perfis de uma mensagem do assistente (premissa)

O modelo é chamado de novo a cada ferramenta que usa, e **cada chamada reenvia as ~5.100 tokens-base**.
Por isso o custo de uma mensagem depende de quantas ferramentas ela aciona:

| Perfil                            | Chamadas ao modelo | Tokens de entrada | Tokens de saída | Custo (Luna, sem cache) |
| --------------------------------- | ------------------ | ----------------- | --------------- | ----------------------- |
| Simples ("oi", resposta direta)   | 1                  | 5.700             | 150             | R$ 0,0035               |
| Consulta ("quanto lucrei?")       | 2                  | 11.900            | 260             | R$ 0,0071               |
| Ação ("venda 2 Una para a Maria") | 3                  | 18.500            | 420             | R$ 0,0111               |
| **Média (40% / 40% / 20%)**       |                    |                   |                 | **R$ 0,0065**           |

Raciocínio do modelo desligado (`AI_REASONING_EFFORT=none`, o padrão). Os 40/40/20 são suposição
minha; troque pelos seus números quando houver uso real.

### 2.4 Perfil de cada cliente (premissa)

|                               | Gratuito                | Inicial | Pro   | Empresarial |
| ----------------------------- | ----------------------- | ------- | ----- | ----------- |
| Uso do assistente (% da cota) | 40%                     | 40%     | 40%   | 40%         |
| Mensagens por voz             | 30% das mensagens, 20 s | idem    | idem  | idem        |
| Visitas à vitrine por mês     | 100                     | 500     | 3.000 | 10.000      |

### 2.5 O que **não** está nas contas

Impostos além do MEI (veja a seção 9), seu tempo de desenvolvimento e suporte, custo de aquisição de
clientes e a conta Google Play (R$ 25 uma única vez). O MEI paga um valor fixo por mês, que entra na seção 9.

---

## 3. Custo por cliente, por mês

### 3.1 Uso típico

| Plano       | Preço     | IA (chat) | Voz  | Vitrine e outros | Gateway | **Custo total** | **Contribuição** | Margem |
| ----------- | --------- | --------- | ---- | ---------------- | ------- | --------------- | ---------------- | ------ |
| Gratuito    | R$ 0      | 0,04      | 0,02 | 0,03             | —       | **R$ 0,09**     | −R$ 0,09         | —      |
| Inicial     | R$ 29,99  | 0,39      | 0,15 | 0,09             | 1,59    | **R$ 2,21**     | **R$ 27,78**     | 92,6%  |
| Pro         | R$ 49,99  | 1,29      | 0,49 | 0,45             | 2,38    | **R$ 4,61**     | **R$ 45,38**     | 90,8%  |
| Empresarial | R$ 129,99 | 3,88      | 1,46 | 1,44             | 5,58    | **R$ 12,36**    | **R$ 117,63**    | 90,5%  |

Em todos os planos pagos a **IA típica fica entre 1,8% e 4,1% do preço**.

### 3.2 Pior caso (cliente que usa 100% da cota, toda mensagem "pesada", toda por voz de 30 s)

| Plano       | Custo total | Contribuição | Margem |
| ----------- | ----------- | ------------ | ------ |
| Gratuito    | R$ 0,38     | −R$ 0,38     | —      |
| Inicial     | R$ 5,17     | R$ 24,82     | 82,8%  |
| Pro         | R$ 14,47    | R$ 35,52     | 71,1%  |
| Empresarial | R$ 41,93    | R$ 88,06     | 67,7%  |

**Mesmo no pior caso nenhum plano pago dá prejuízo.** O teto teórico de abuso numa conta Empresarial
é de R$ 34,91 de IA no mês, e isso exigiria usar as 1.500 mensagens todas com operações de 3 etapas
e voz.

### 3.3 Custos fixos (rateados entre todas as lojas)

| Item                        | Enxuto                 | Estável                                         |
| --------------------------- | ---------------------- | ----------------------------------------------- |
| Servidor (Fly.io)           | 1 máquina: R$ 36       | 2 máquinas, para não cair em manutenção: R$ 72  |
| Banco (Neon) e fila (Redis) | planos gratuitos: R$ 0 | planos pagos (premissa US$ 15 + US$ 10): R$ 135 |
| Conta Apple Developer       | US$ 99/ano: R$ 45      | R$ 45                                           |
| Domínio e extras            | R$ 5                   | R$ 5                                            |
| **Total/mês**               | **≈ R$ 86**            | **≈ R$ 257**                                    |

O Neon e o Redis são **suposição**: confirme em qual plano cada um está hoje.

### 3.4 Ponto de equilíbrio

Mix de pagantes hipotético: 60% Inicial, 30% Pro, 10% Empresarial → **contribuição média de R$ 42,04
por assinante** (já descontada gateway e custos variáveis).

| Objetivo                                  | Assinantes necessários |
| ----------------------------------------- | ---------------------- |
| Cobrir só a infraestrutura enxuta (R$ 86) | **≈ 2**                |
| Cobrir a infraestrutura estável (R$ 257)  | **≈ 6**                |
| Estável + um salário de R$ 3.000/mês      | **≈ 78**               |

Cada 5 contas gratuitas por assinante pagante acrescentam menos de R$ 0,50/mês de custo: o plano
Gratuito é praticamente "de graça" de manter. O que decide o negócio é **converter**, não o custo.

---

## 4. A IA em detalhe

### 4.1 Quanto custa cada coisa

|                                             | Custo     |
| ------------------------------------------- | --------- |
| Mensagem média, sem cache                   | R$ 0,0065 |
| Mensagem média, com 80% da entrada em cache | R$ 0,0023 |
| 100 mensagens                               | R$ 0,65   |
| Mensagem por voz de 20 s                    | R$ 0,008  |
| Mensagem por voz de 60 s (máximo do app)    | R$ 0,024  |

### 4.2 Sensibilidade: o que muda o custo (IA por cliente típico/mês)

| Plano       | Luna (hoje) | Luna com cache 80% | Luna com raciocínio ligado\* | **Sol**   |
| ----------- | ----------- | ------------------ | ---------------------------- | --------- |
| Gratuito    | R$ 0,04     | 0,01               | 0,06                         | 0,78      |
| Inicial     | R$ 0,39     | 0,14               | 0,63                         | **7,76**  |
| Pro         | R$ 1,29     | 0,46               | 2,10                         | **25,88** |
| Empresarial | R$ 3,88     | 1,38               | 6,31                         | **77,63** |

\* Premissa: +1.500 tokens de saída por mensagem.

**Leitura:** com o Luna a IA cabe em qualquer plano com folga. No Sol ela passa a pesar (no
Empresarial, 60% do preço) e as cotas teriam que cair ou o preço subir.

### 4.3 De onde vem o custo (e como reduzir)

**~82% do que se gasta por chamada é a definição das 28 ferramentas e as instruções (5.100 de
~5.700 tokens).** Isso se repete a cada chamada. Três alavancas, em ordem de retorno:

1. **Cache de prompt:** a OpenAI cobra 10× menos pela parte repetida (US$ 0,01 vs US$ 0,10). Hoje
   a data de hoje está no **começo** das instruções, o que muda o prefixo todo dia. Mover a data
   para o fim e manter a ordem das ferramentas estável deve levar o cache a funcionar (−65% no
   custo de entrada). Não medi o acerto de cache de verdade; é a primeira coisa a verificar.
2. **Enviar só as ferramentas relevantes à mensagem** (ex.: pergunta de estoque não precisa das
   ferramentas de loja). Pode cortar ~4.200 para ~1.500 tokens por chamada.
3. **Trocar por um modelo ainda mais barato só nas perguntas simples.** Não recomendo agora: a
   diferença é de centavos.

---

## 5. Segurança de custo da IA

O que já existe: cota **mensal de mensagens por plano**, reservada antes de chamar o modelo (não
passa do teto nem com requisições simultâneas), devolvida se der erro, e todos os tokens ficam
registrados por loja em `ai_usage`.

**O que falta para ficar à prova de surpresas:**

| Risco                                                                 | Hoje                                                                                     | Recomendação                                                                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Alguém trocar `AI_MODEL` para `gpt-6-sol` e as cotas viraram prejuízo | Nada impede                                                                              | **Teto de gasto por loja** (em tokens ou R$) além do teto de mensagens; e um teste/alerta que avise se o modelo configurado não for o esperado |
| Chave da OpenAI vazar ou um erro gerar loop                           | Sem limite no lado da OpenAI                                                             | Defina **limite de gasto mensal no painel da OpenAI** (hard cap) e use chaves diferentes para desenvolvimento e produção                       |
| Conta de teste com cota alta                                          | O plano é lido do banco                                                                  | Painel admin com `ai_usage` por loja e alerta acima de R$ X                                                                                    |
| Mensagem pesada demais                                                | Já limitada (2.000 caracteres, 4.096 tokens de saída, 6 rodadas, 12 turnos de histórico) | OK                                                                                                                                             |

**Regra para recalibrar as cotas se o modelo mudar:**

`cota por mês = (orçamento de IA por cliente em R$) ÷ (custo da mensagem média)`.
Exemplo no Luna: com orçamento de 5% do preço do Inicial (R$ 1,50) a cota poderia ir até
**~230 mensagens** (sem voz). Com o Sol, os mesmos R$ 1,50 dão apenas **~12**.

> A cota atual (15 / 150 / 500 / 1.500) é **uma decisão de produto, não de custo**: com o Luna o
> custo não seria o limite.

---

## 6. O que cada plano inclui

Legenda: ✅ existe e é aplicado pelo sistema · 🟡 aparece no app mas **não é aplicado** (ou é só
parcial) · 🔲 não existe ainda.

### 6.1 Situação atual no código

| Recurso                                                | Gratuito | Inicial            | Pro       | Empresarial | Estado                                                                              |
| ------------------------------------------------------ | -------- | ------------------ | --------- | ----------- | ----------------------------------------------------------------------------------- |
| Limite de produtos                                     | 30       | 200                | ilimitado | ilimitado   | ✅ aplicado                                                                         |
| Cadastro manual e cestas (kits)                        | não      | sim                | sim       | sim         | ✅ aplicado                                                                         |
| Categorias                                             | não      | sim                | sim       | sim         | ✅ aplicado                                                                         |
| Preço promocional                                      | não      | sim                | sim       | sim         | ✅ aplicado                                                                         |
| Vitrine online e pedidos                               | sim      | sim                | sim       | sim         | ✅                                                                                  |
| Assistente de IA (mensagens/mês)                       | 15       | 150                | 500       | 1.500       | ✅ aplicado                                                                         |
| Assistente por voz                                     | sim      | sim                | sim       | sim         | ✅ (conta como mensagem)                                                            |
| Relatório "mais vendidos"                              | —        | sim                | sim       | sim         | 🟡 **liberado para todos os planos** (não há checagem de plano no módulo de vendas) |
| Relatório "produtos parados" e demais                  | —        | —                  | sim       | sim         | 🟡 idem                                                                             |
| Vitrine sem a marca Revendajá                          | —        | —                  | sim       | sim         | 🔲 não existe                                                                       |
| Suporte por e-mail / prioritário / WhatsApp / dedicado | e-mail   | e-mail prioritário | WhatsApp  | dedicado    | 🔲 processo, não é código                                                           |
| Múltiplas usuárias por loja                            | —        | —                  | —         | sim         | 🔲 não existe (`Store.userId` é único)                                              |
| Exportação de dados / relatório por período            | —        | —                  | —         | sim         | 🔲 não existe                                                                       |
| Cobrança e troca de plano (Stripe)                     |          |                    |           |             | ✅ existe                                                                           |

### 6.2 O que o assistente já faz hoje (28 ferramentas)

Todas as alterações passam por **proposta → confirmação da usuária → execução pelos mesmos serviços
do app**, então **o assistente respeita automaticamente os limites do plano** (ex.: no Gratuito
ele recusa criar categoria e explica o upgrade).

| Área               | Consultas                                                                                                                   | Alterações (com confirmação)                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo e estoque | pesquisa nos 27 mil produtos, estoque em falta/baixo, produtos parados, valor investido                                     | cadastrar do catálogo, ajustar quantidade, remover produto, cadastrar produto próprio                                                     |
| Vendas             | listar e detalhar vendas, pedidos online pendentes, mais vendidos, marcas, evolução por dia/semana/mês                      | **registrar venda**, marcar pedido como pago, cancelar pedido                                                                             |
| Finanças           | faturamento, lucro, margem, a receber, comparação com período anterior, meta                                                | definir meta mensal                                                                                                                       |
| Clientes           | quem mais compra, quem está sem comprar, pendências, histórico de uma cliente (**por nome digitado**, pois não há cadastro) | —                                                                                                                                         |
| Loja               | resumo do mês, dados e configurações, o que cada plano inclui                                                               | preço, custo, promoção, estoque mínimo, ativar/esconder, categoria; vitrine online, nome, descrição, formas de pagamento; criar categoria |
| Divulgação         | textos de WhatsApp, promoções, kits (a IA escreve com o estoque real)                                                       | —                                                                                                                                         |

**Não cobre (e avisa a usuária em vez de inventar):** cadastro de clientes com telefone/endereço,
boletos e contas a pagar, despesas, fotos e banners, trocar o link da vitrine, assinar plano.

### 6.3 Proposta de pacote por plano (para você decidir)

|                                | Gratuito                                                                      | Inicial                                                             | Pro                                                                               | Empresarial                               |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| **Produtos**                   | 30                                                                            | 200                                                                 | ilimitado                                                                         | ilimitado                                 |
| **Vitrine**                    | com marca Revendajá                                                           | com marca                                                           | **sem marca** 🔲                                                                  | sem marca 🔲                              |
| **Assistente — mensagens/mês** | 15                                                                            | 150                                                                 | 500                                                                               | 1.500                                     |
| **Assistente — o que faz**     | consultas de estoque e vendas, cadastrar produto do catálogo, registrar venda | + preços, promoções, categorias, textos de divulgação, comparativos | + análise de clientes (inativos, melhores), relatório de marcas, resumos semanais | + histórico longo, prioridade de resposta |
| **Relatórios**                 | resumo do mês                                                                 | + mais vendidos                                                     | + parados, marcas, evolução                                                       | + exportação 🔲                           |
| **Equipe**                     | 1 usuária                                                                     | 1                                                                   | 1                                                                                 | **várias** 🔲                             |
| **Suporte**                    | e-mail                                                                        | e-mail prioritário                                                  | WhatsApp                                                                          | dedicado                                  |
| **Preço sugerido**             | R$ 0                                                                          | R$ 29,99                                                            | R$ 49,99                                                                          | R$ 129,99                                 |

**Por que esse desenho:** o Gratuito mostra o "uau" da IA (15 mensagens custam menos de R$ 0,40 no
pior caso) para converter; o Inicial é o plano de entrada com a loja completa; o Pro é para quem
vive da revenda (volume e análise); o Empresarial só deve ser vendido **depois** de existirem
equipe e exportação.

---

## 7. Melhorias recomendadas

Esforço: **P** (dias) · **M** (1 a 2 semanas) · **G** (mais de 2 semanas). Impacto em receita, custo
ou risco.

### P0 — antes de divulgar o assistente

| #   | Melhoria                                                                                                                                                  | Por quê                                                                                                                          | Esforço |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | **Revogar a chave da OpenAI que apareceu no chat** e criar chaves separadas (desenvolvimento/produção) com **limite de gasto mensal** no painel da OpenAI | Segurança e custo máximo garantido                                                                                               | P       |
| 2   | Colocar `OPENAI_API_KEY` nos Secrets do Fly e conferir `NODE_ENV=production`, `TRUST_PROXY=true`                                                          | O assistente não funciona em produção sem isso                                                                                   | P       |
| 3   | **Teste do assistente com uso real**: ~30 frases de consultoras ("quanto lucrei?", "vendi 2 Una pra Ana") conferindo resposta, valores e confirmações     | Até agora foi testado com simulações (961 testes) e 3 mensagens reais; a qualidade das respostas em escala **não está validada** | P       |
| 4   | **Decidir sobre os relatórios**: bloquear por plano (como anunciado) ou parar de anunciar                                                                 | Hoje o app promete diferença entre planos que não existe                                                                         | P       |
| 5   | **Teto de gasto por loja** (tokens/R$) além do teto de mensagens                                                                                          | Fecha o risco de troca de modelo (seção 5)                                                                                       | P       |

### P1 — maior valor para a consultora e para a receita

| #   | Melhoria                                                                                            | Por quê                                                                                                                             | Esforço |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 6   | **Cadastro de clientes** (telefone, aniversário, observações)                                       | Hoje a "cliente" é só um nome digitado. Habilita recuperar clientes inativos por WhatsApp, a feature que a própria IA mais valoriza | M       |
| 7   | **Contas a pagar, boletos e despesas** (pedido original do assistente)                              | Fecha o financeiro ("estou tendo lucro de verdade?"); a IA já está pronta para consumir                                             | M       |
| 8   | **Venda a prazo / fiado com parcelas a receber**                                                    | Existia e foi removido; é comum na revenda. Verificar a demanda antes                                                               | M       |
| 9   | **Reduzir o prompt** (cache + ferramentas por intenção, seção 4.3)                                  | −65% a −85% do custo de entrada e respostas mais rápidas                                                                            | P–M     |
| 10  | **Respostas em streaming** no app                                                                   | Hoje a resposta chega inteira após 5–15 s; streaming melhora muito a sensação de velocidade                                         | M       |
| 11  | **Assistente também no painel web** (mesma API) e **tela de admin com custo por loja** (`ai_usage`) | Acompanhar quem consome e atender quem usa o computador                                                                             | M       |
| 12  | Retomar conversas anteriores no app                                                                 | O backend já guarda o histórico; falta a tela                                                                                       | P       |

### P2 — crescimento

| #   | Melhoria                                                                                                             | Por quê                                                                                                                    | Esforço |
| --- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- |
| 13  | **Plano anual com desconto** e **teste grátis de 7 dias do Pro**                                                     | Reduz desistência e taxa de cobrança por mês                                                                               | P–M     |
| 14  | **Pix Automático / outro gateway**                                                                                   | A taxa de cartão (~5%) é o maior custo variável; a Stripe pode não ter Pix recorrente no Brasil (a pesquisa não confirmou) | M       |
| 15  | **Avisos proativos gerados por IA** ("você vendeu R$ X esta semana; 3 produtos parados") usando a fila que já existe | Custa ~R$ 0,003 por aviso e aumenta o uso diário do app                                                                    | M       |
| 16  | **Upsell dentro do assistente** quando bater a cota ou um limite de plano                                            | Hoje ele só explica; pode levar direto à tela Planos                                                                       | P       |
| 17  | Construir **vitrine sem marca**, **equipe** e **exportação** antes de vender Pro/Empresarial como descritos          | Hoje são promessas sem código                                                                                              | M–G     |

### P3 — base técnica

| #   | Melhoria                                                                                                                                                                   | Por quê                                                         | Esforço |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| 18  | **LGPD:** política de privacidade que cite o envio de dados à OpenAI (nomes de clientes e valores entram nas consultas); confirmar a política de retenção da API da OpenAI | Dados de terceiros (clientes finais) passam pelo provedor de IA | P       |
| 19  | Monitoramento de erros (ex.: Sentry) e alertas de custo                                                                                                                    | Hoje um erro na IA só aparece no log do Fly                     | P       |
| 20  | Backup e recuperação no Neon (point-in-time) e **2ª máquina no Fly**                                                                                                       | Servidor único cai a cada manutenção                            | P       |
| 21  | Testes automáticos no app mobile e testes de ponta a ponta do fluxo "propor → confirmar"                                                                                   | O mobile não tem testes hoje                                    | M       |

---

## 8. Incertezas e o que confirmar

| Ponto                                                                             | Efeito                                                              | Como confirmar                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| Preço da Fly.io (US$ 6,70 com 1 GB) e taxa da Stripe BR vêm de fontes secundárias | Mexe nos custos fixos e na margem em ±R$ 1–2 por cliente            | Fatura do Fly e painel da Stripe            |
| Plano atual do Neon e do Redis                                                    | Pode adiantar ou atrasar o salto do custo fixo de R$ 86 para R$ 257 | Painéis dos dois serviços                   |
| Perfil de uso (40/40/20, 40% da cota, 30% por voz)                                | Muda o custo de IA proporcionalmente                                | `ai_usage` depois de 30 dias de uso real    |
| Acerto do cache de prompt da OpenAI                                               | Pode reduzir o custo de IA em ~65% (ou nada)                        | Campo de tokens em cache na resposta da API |
| Impostos e custo do seu tempo ficaram de fora                                     | Reduz o lucro líquido                                               | Contador                                    |
| Os preços da IA mudam                                                             | Todos os números da seção 4                                         | Reaplicar o script do apêndice              |

---

## 9. Canais de venda (Stripe, Apple e Google Play) e imposto do MEI

Duas correções que mudam a conta: **por onde o assinante paga** e **o imposto do MEI**.

### 9.1 Comissão de cada canal

| Canal                    | Comissão                     | Origem                                                                                                                                                                          |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe (cartão, no site) | 3,99% + R$ 0,39 por cobrança | _(fonte secundária)_; **confirme no seu painel da Stripe** (você mencionou ~3% + valor fixo: se a sua tarifa for menor, os custos caem)                                         |
| Apple (App Store)        | 15%                          | _(fonte secundária)_ só vale com a inscrição no Programa para pequenos desenvolvedores da Apple (até US$ 1 milhão por ano); sem ela, 30%                                        |
| Google Play              | 15%                          | _(fonte secundária)_ para assinaturas; há notícias de mudança de estrutura em 2026 (taxa de serviço mais taxa de cobrança, somando 15%). **Confirme na documentação do Google** |

**Atenção sobre a Apple e o Google:** o app hoje só vende assinatura pela Stripe. As lojas costumam exigir
o pagamento dentro do app pelo sistema delas para assinaturas digitais; **o backend ainda não tem essa
integração** (compra dentro do app, validação do recibo, renovação e cancelamento). É preciso construí-la
(ou usar um serviço de apoio) antes de contar com esses canais, e vale confirmar a regra atual de cada
loja antes de publicar.

### 9.2 Imposto do MEI

O MEI **não paga percentual sobre a receita**: paga um valor fixo por mês, o DAS. Em 2026 (salário mínimo de
R$ 1.621): **R$ 81,05 de INSS + R$ 5,00 de ISS (prestação de serviços) = R$ 86,05 por mês**
([Jornal Contábil](https://jornalcontabil.com.br/noticia/veja-quais-serao-os-valores-de-contribuicao-do-mei-em-2026/),
fonte secundária; confirme no Portal do Empreendedor). Se a atividade for classificada como comércio, o valor
é de R$ 82,05. Esse valor entra nos **custos fixos**.

O MEI também tem **teto de faturamento de R$ 81.000 por ano (R$ 6.750 por mês)**. Com mensalidade média de
R$ 45,99, o teto chega com **cerca de 147 assinantes pagantes**. Passando disso é preciso deixar de ser MEI
(virar microempresa), com outros impostos e outras regras. Vale confirmar com um contador se a sua atividade
pode ser MEI e se o valor recebido pelas lojas de aplicativos conta inteiro como faturamento.

### 9.3 Custo e margem por cliente, por canal

Mesmas premissas de uso das seções anteriores; muda só a comissão.

| Cenário                                                                  | Inicial          | Pro              | Empresarial       |
| ------------------------------------------------------------------------ | ---------------- | ---------------- | ----------------- |
| **Tudo pela Stripe** — sobra por cliente                                 | R$ 27,78 (92,6%) | R$ 45,38 (90,8%) | R$ 117,63 (90,5%) |
| **Divisão padrão do painel (30% Stripe, 20% Apple, 50% Google)** — sobra | R$ 25,74 (85,8%) | R$ 41,80 (83,6%) | R$ 107,88 (83,0%) |
| **Tudo pelas lojas (50% Apple, 50% Google)** — sobra                     | R$ 24,87 (82,9%) | R$ 40,26 (80,5%) | R$ 103,71 (79,8%) |

A comissão média por cliente sobe de **cerca de 5%** (só Stripe) para **cerca de 12%** (divisão padrão) ou
**15%** (só lojas). Cada cliente que paga pelo site em vez da loja de aplicativos deixa
**de R$ 2,91 (Inicial) a R$ 13,92 (Empresarial) a mais** por mês, dependendo do plano.

### 9.4 Ponto de equilíbrio com o MEI

Custo fixo enxuto sobe de R$ 86 para **R$ 172 por mês** (inclui o DAS de R$ 86,05).

| Cenário          | Assinantes para cobrir o fixo | Assinantes para cobrir o fixo e R$ 3.000 por mês |
| ---------------- | ----------------------------- | ------------------------------------------------ |
| Tudo pela Stripe | ≈ 4                           | ≈ 75                                             |
| Divisão padrão   | ≈ 4                           | ≈ 82                                             |
| Tudo pelas lojas | ≈ 5                           | ≈ 85                                             |

Nos três cenários o equilíbrio de **R$ 3.000 por mês fica bem abaixo do teto do MEI** (cerca de 147
assinantes), mas já usa mais da metade dele.

### 9.5 O que mudou no painel

Em **Custos e planos** o painel passou a mostrar a comissão de cada canal, o imposto do MEI nos custos fixos,
uma tabela "quanto sobra por canal de venda" e o medidor do teto anual do MEI. Você edita **por onde seus
assinantes pagam** (a divisão entre Stripe, Apple e Google Play), porque o sistema ainda não consegue
medir isso. As comissões e o DAS ficam fixos no código (`costModel.ts`). Para reproduzir os números desta
seção: `python docs/cost_model_canais.py`.

---

## Apêndice: como reproduzir os números

O modelo está em [`cost_model.py`](./cost_model.py) (`python docs/cost_model.py`). As premissas
ficam no topo do arquivo (preços, perfis de mensagem, uso por plano, custos fixos): basta
alterá-las e rodar de novo. Para recalibrar com dados reais, use:

```sql
-- custo de IA por loja no mês (tokens x preço do modelo)
SELECT s.store_name, u.messages, u.transcriptions, u.input_tokens, u.output_tokens,
       ROUND((u.input_tokens * 0.10 + u.output_tokens * 0.50) / 1000000.0 * 5.40, 2) AS ia_reais
FROM ai_usage u JOIN stores s ON s.id = u.store_id
WHERE u.period = '2026-11'
ORDER BY u.output_tokens DESC;
```

(A fórmula acima usa os preços do `gpt-6-luna` sem cache; ajuste se mudar de modelo.)
