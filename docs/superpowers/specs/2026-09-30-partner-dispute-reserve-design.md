# Reserva de disputa do parceiro (10%, 120 dias)

## Contexto

O repasse ao parceiro (peça 4 do roadmap de marketplace) paga 100% do
`partner_amount` assim que passam 16 dias da venda (`PAYOUT_RETENTION_DAYS`).
Essa janela protege contra **reembolso voluntário** (que só pode ser pedido
em até 15 dias — spec `2026-09-30-app-purchase-refund-design.md`), mas não
protege contra **disputa/chargeback**: a janela de contestação das
bandeiras (Visa/Mastercard) costuma ser de até 120 dias, bem além dos 16
dias de retenção atual.

Hoje, se uma venda de app com parceiro sofre uma disputa e a LOBBY perde
depois do repasse já ter sido feito, o sistema desconta a comissão própria
de `financial_transactions` (spec/migração do dia 2026-09-30, "disputa
Stripe perdida") mas **não existe nenhum mecanismo pra recuperar a fatia do
parceiro** — o dinheiro já saiu via PIX/TED e ninguém sinaliza que precisa
cobrar de volta.

Decisão de negócio confirmada pelo usuário (2026-09-30): o parceiro passa a
bancar uma fatia do risco de chargeback, no modelo usado por plataformas
como Stripe Connect — **10% do `partner_amount`** de cada venda fica retido
numa reserva separada, liberada só depois de **120 dias** sem disputa.
Escopo: só `app_purchases` (venda avulsa) — `subscription_invoices` fica
fora, mesmo limite já aplicado em todo o trabalho de reembolso/disputa
anterior.

## Objetivo

Reduzir a exposição da LOBBY a chargeback tardio sem mudar a experiência
do parceiro pra maior parte do dinheiro (90% continua pagando no mesmo
prazo de hoje), e dar visibilidade clara ao líder de quanto precisa cobrar
manualmente do parceiro nos casos em que a automação não alcança (dinheiro
que já saiu antes da disputa chegar).

## Não-objetivos

- `subscription_invoices` — sem reserva nesta leva.
- Qualquer débito automático na conta do parceiro — não existe integração
  bancária no sistema (repasse é PIX/TED manual, mesmo princípio de sempre).
  Quando o dinheiro já saiu, o sistema só **sinaliza o valor**, a cobrança
  continua 100% manual.
- Percentual/janela configurável por parceiro ou categoria — fixo em 10%/120
  dias pra todo mundo nesta leva (decisão do usuário: simplicidade primeiro).

## Schema — `app_purchases`

```sql
alter table public.app_purchases
  add column if not exists reserve_amount numeric(12,2) not null default 0,
  add column if not exists reserve_status text;

alter table public.app_purchases
  add constraint app_purchases_reserve_status_check
  check (reserve_status is null or reserve_status = any (array['held', 'released', 'clawed_back']));

alter table public.app_purchases
  add constraint app_purchases_reserve_amount_check
  check (reserve_amount >= 0 and reserve_amount <= partner_amount);
```

`reserve_amount` é **snapshot no checkout** — 10% do `partner_amount`
resolvido naquele momento, nunca recalculado depois (mesmo princípio de
`commission_amount`/`partner_amount`). `partner_amount` continua
representando a fatia **total** do parceiro — a reserva é uma fatia
*dentro* dele, não um valor adicional. O CHECK
`commission_amount + partner_amount = amount` já existente continua válido
sem alteração.

`reserve_status` só é significativo quando `reserve_amount > 0` (ou seja,
quando `partner_id is not null` — apps da própria LOBBY não têm parceiro
pra reter nada). Começa `'held'`, termina em `'released'` (passou os 120
dias sem disputa, pago) ou `'clawed_back'` (disputa perdida antes de ser
liberada — LOBBY absorve, parceiro nunca recebe essa fatia).

## Checkout — `app/api/apps/[appId]/checkout/route.ts`

Onde hoje calcula `commissionCents`/`partnerCents`, adiciona:

```typescript
const reserveCents = partnerId ? Math.round(partnerCents * RESERVE_PERCENT / 100) : 0
```

Grava `reserve_amount: reserveCents / 100` e `reserve_status: partnerId ? 'held' : null` no insert de `app_purchases`.

## Constantes — `lib/services/payouts.ts`

```typescript
export const RESERVE_PERCENT = 10
export const DISPUTE_RESERVE_WINDOW_DAYS = 120
```

Mesmo padrão de `PAYOUT_RETENTION_DAYS`: espelho pra exibição/cálculo no
client, fonte de verdade real é a RPC no banco.

## `partner_payout_items` ganha discriminador `kind`

A mesma venda agora pode ser paga em **dois momentos diferentes** — os 90%
no dia 16 (fluxo atual, inalterado), os 10% de reserva só no dia 120. A
checagem atual de "já coberto por repasse confirmado" olha só
`app_purchase_id`, sem distinguir qual fatia — isso bloquearia a reserva
pra sempre depois que a fatia principal fosse paga.

```sql
alter table public.partner_payout_items
  add column if not exists kind text not null default 'main'
  check (kind = any (array['main', 'reserve']));
```

Linhas já existentes (criadas antes desta migração) recebem `kind='main'`
pelo default — correto, são todas repasses da fatia principal, reserva
nunca existiu antes.

## `create_partner_payout` ganha 4º parâmetro: `p_reserve_app_purchase_ids`

Mesma função (`create_partner_payout`, hoje com 5 parâmetros), ganha um 6º:

```sql
create or replace function public.create_partner_payout(
  "p_partner_id"                uuid,
  "p_app_purchase_ids"          uuid[],
  "p_reference"                 text,
  "p_notes"                     text default null,
  "p_subscription_invoice_ids"  uuid[] default null,
  "p_reserve_app_purchase_ids"  uuid[] default null
)
```

Main e reserva são pagas em momentos diferentes (dia 16 vs dia 120,
possivelmente meses de distância uma da outra) — cada uma calcula seu
próprio desconto por reembolso parcial **de forma independente**, sobre a
sua própria base, nunca sobre o `partner_amount` total de uma vez (não dá
pra "repartir" um desconto já calculado entre duas pernas que não sabem a
mesma hora se vão existir). Isso pode gerar um desvio de centavo entre a
soma das duas pernas e o desconto que seria calculado de uma vez só —
aceito, mesma classe de arredondamento sub-centavo já documentada no spec
de reembolso.

- **Elegibilidade da fatia principal** (`p_app_purchase_ids`, inalterada
  exceto a base de cálculo): `status='paid'`, `paid_at <= now() - interval
  '16 days'`, sem item `kind='main'` confirmado cobrindo essa venda. Valor
  pago:
  ```sql
  (ap.partner_amount - ap.reserve_amount)
    - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2)
  ```
  (antes desta mudança era `ap.partner_amount - round(ap.refunded_amount * ap.partner_amount / ap.amount, 2)` — a reserva nunca fez parte do que é elegível aqui).
- **Elegibilidade da reserva** (`p_reserve_app_purchase_ids`, nova):
  `status='paid'`, `reserve_status='held'`, `paid_at <= now() - interval
  '120 days'`, sem item `kind='reserve'` confirmado cobrindo essa venda.
  Valor pago:
  ```sql
  ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2)
  ```
  Ao confirmar, marca `app_purchases.reserve_status = 'released'`.
- `partner_payout_items` inserido pra cada lista usa `kind='main'`/`kind='reserve'`
  respectivamente.

Na tela (`RepassesClient`), a reserva elegível entra **automaticamente**
junto com o resto da fila do parceiro quando o líder gera o repasse — sem
passo manual separado, mesma filosofia de fila única já usada pra
app+assinatura.

## Disputa perdida — `handleDisputeClosed` (webhook)

No branch `dispute.status !== 'won'`, além do write-down de
`financial_transactions` já existente (feature de 2026-09-30), adiciona
pra `source_type='app_purchases'` com `partner_id` setado:

1. **Reserva ainda não liberada** (`reserve_status='held'`): automático —
   `update app_purchases set reserve_status='clawed_back' where id=... and
   reserve_status='held'`. Nunca é paga; LOBBY absorve essa fatia.
2. **Dinheiro já pago antes da disputa chegar**: soma
   `partner_payout_items.amount` (de qualquer `kind`) ligado a essa venda
   via repasses com `status='confirmado'`. Se a soma for maior que zero,
   grava em `payment_disputes.partner_clawback_amount` (coluna nova) — é o
   valor que o líder precisa cobrar do parceiro por fora, porque não existe
   API de débito bancário no sistema. Não tenta reverter nem calcular
   automaticamente nenhuma cobrança — só sinaliza o número certo.

```sql
alter table public.payment_disputes
  add column if not exists partner_clawback_amount numeric(12,2);
```

`null`/`0` = nada a cobrar (reserva cobriu tudo, ou nada tinha sido pago
ainda — venda já vira `status='disputed'` assim que a disputa abre,
ficando permanentemente inelegível pro repasse normal, mesmo princípio já
usado hoje).

## UI

- **`/admin/disputas`**: mostra `partner_clawback_amount` com destaque
  quando `> 0` — "Cobrar do parceiro: R$ X" — pra ficar impossível de
  passar batido.
- **`/admin/marketplace/repasses`**: linha de reserva aparece junto com as
  vendas elegíveis normais, com um rótulo (`kind` visível, ex: "Reserva
  (120d)") pra o líder entender o que está pagando. Reserva `clawed_back`
  não aparece em lugar nenhum da fila (nunca vai ser paga).

## Erros e casos de borda

- **App da própria LOBBY** (`partner_id is null`): `reserve_amount=0`,
  `reserve_status=null` — fórmulas de elegibilidade nunca entram em jogo
  (sem parceiro pra reter nada, comportamento idêntico ao que já existe
  hoje pra app sem parceiro).
- **Reembolso voluntário parcial antes da reserva ser liberada**: a mesma
  fórmula de desconto proporcional já usada na fatia principal
  (`round(refunded_amount * valor / amount, 2)`) se aplica também à
  reserva — reserva nunca paga mais do que a fatia líquida realmente devida.
- **Disputa chega depois dos 120 dias** (raro, mas possível pra alguns
  motivos de chargeback que estendem a janela): a reserva já foi liberada
  (`reserve_status='released'`) — cai automaticamente no caso 2 (dinheiro já
  pago, soma entra em `partner_clawback_amount`), sem tratamento especial
  extra necessário.
- **Múltiplas disputas na mesma venda** (não deveria acontecer, mas a
  constraint não impede): a segunda chamada do write-down encontra
  `reserve_status` já `'clawed_back'` e o `update ... where
  reserve_status='held'` não casa nenhuma linha — idempotente por
  construção, sem necessidade de guard explícito adicional.

## Testes

- Checkout: `reserve_amount`/`reserve_status` calculados corretamente pra
  app com parceiro vs. app da LOBBY.
- `create_partner_payout`: fatia principal paga valor líquido de reserva
  (90% apenas); reserva não entra na fila antes de 120 dias; reserva entra
  depois de 120 dias e marca `reserve_status='released'`; reserva com
  reembolso parcial paga valor proporcional correto.
- Webhook disputa perdida: reserva `held` vira `clawed_back` e nunca
  aparece em `partner_clawback_amount`; dinheiro já pago (reserva
  `released` ou fatia principal já paga) soma corretamente em
  `partner_clawback_amount`; nada pago ainda (venda nunca chegou a
  `status='paid'` elegível) não gera nenhum lançamento de cobrança.
