# Snapshot dos prazos financeiros por venda (reembolso/retenção/reserva)

## Contexto

Etapa 1 ("Auditoria e base") do roadmap da área "Vendas e financeiro" do
parceiro (ver pedido do usuário de 2026-10-01) pediu pra mapear, entre
outras coisas, se os prazos de 16 dias (retenção) e 120 dias (reserva de
disputa) correm "ao vivo" contra a configuração atual ou são fixados no
momento da venda. A auditoria encontrou: **não são fixados**. Os três
prazos do sistema financeiro de app (janela de reembolso de 15 dias,
retenção de repasse de 16 dias, janela de reserva de disputa de 120 dias)
estão todos como literais `interval '15 days'` / `'16 days'` / `'120 days'`
direto no SQL das RPCs — se qualquer um mudar no futuro, a mudança vale
retroativamente pra toda venda já existente, não só pras novas.

Isso já aconteceu uma vez nesta sessão: `PAYOUT_RETENTION_DAYS` foi de 14
pra 16 dias num plano anterior, e qualquer venda hipotética feita sob a
regra de 14 dias teria sido silenciosamente reavaliada sob 16. Não houve
dado real afetado (banco tinha zero vendas na época), mas o padrão é
errado pra uma área que o próprio parceiro vai passar a enxergar
("contagem de dias" visível pro cliente — spec da área financeira,
seção 5: "Não vamos presumir que sejam 136 dias nem recalcular tudo usando
apenas a configuração atual").

`commission_percent`/`commission_amount`/`reserve_amount` já são snapshot
corretamente (gravados no checkout, nunca recalculados). Este spec estende
o mesmo princípio aos três prazos em dias.

Confirmado por auditoria: banco de produção tem **zero linhas** em
`app_purchases` e `partner_payouts` — sem necessidade de backfill com
valor reconstruído, os defaults das novas colunas já cobrem o caso
"nenhuma venda existente".

## Objetivo

Toda venda de app passa a carregar, desde o checkout, os três prazos que
estavam em vigor naquele momento. Nenhuma RPC financeira volta a ler uma
constante global pra decidir elegibilidade de reembolso/repasse/reserva —
sempre lê da própria linha da venda.

## Não-objetivos

- `subscription_invoices` (retenção de assinatura) fica fora — nunca
  entrou no escopo da reserva de disputa, mesmo limite já aplicado o
  tempo todo nesta sessão.
- Enforcement de permissões granulares da equipe do parceiro — decisão do
  usuário (2026-10-01): fica pra Etapa 5 do roadmap da área financeira,
  não faz parte desta correção de base.
- Qualquer tela nova da área "Vendas e financeiro" — este spec é só a
  correção de dado, pré-requisito pras Etapas 2+ nunca mostrarem uma
  contagem de dias que minta se a regra mudar no futuro.

## Schema — `app_purchases`

```sql
alter table public.app_purchases
  add column if not exists refund_window_days   integer not null default 15,
  add column if not exists retention_days        integer not null default 16,
  add column if not exists reserve_window_days    integer not null default 120;

alter table public.app_purchases
  add constraint app_purchases_refund_window_days_check   check (refund_window_days > 0);
alter table public.app_purchases
  add constraint app_purchases_retention_days_check        check (retention_days > 0);
alter table public.app_purchases
  add constraint app_purchases_reserve_window_days_check    check (reserve_window_days > 0);
```

Defaults batem com as constantes atuais — cobre qualquer insert que
esqueça de setar explicitamente (não deveria acontecer, só rede de
segurança). O checkout (único inserter de `app_purchases`) sempre seta os
3 explicitamente a partir das constantes JS — mesmo princípio de
`commission_percent`, nunca confiar no default do banco silenciosamente
divergir da constante do código.

## Constante nova — `lib/services/payouts.ts`

`REFUND_WINDOW_DAYS` hoje é um `const` local duplicado em 2 arquivos TS
(achado durante o design, não fazia parte do pedido original de auditoria)
— nunca foi promovido a export compartilhado como `PAYOUT_RETENTION_DAYS`
e `DISPUTE_RESERVE_WINDOW_DAYS` já são. Consolidando aqui pro mesmo
arquivo, mesmo padrão:

```typescript
/** Janela pra pedir reembolso voluntário de app_purchases — RPC
 *  refund_app_purchase. Sempre fecha antes de PAYOUT_RETENTION_DAYS
 *  (16 dias) ficar elegível, por desenho (spec: 2026-09-30-app-purchase-
 *  refund-design.md) — garante que nunca existe venda simultaneamente
 *  reembolsável e elegível pra repasse. */
export const REFUND_WINDOW_DAYS = 15
```

## Checkout — `app/api/apps/[appId]/checkout/route.ts`

Importa `REFUND_WINDOW_DAYS` junto com `calculateReserveAmountCents`
(já importado de `lib/services/payouts.ts`), mais
`PAYOUT_RETENTION_DAYS`/`DISPUTE_RESERVE_WINDOW_DAYS`. No insert de
`app_purchases`, adiciona:

```typescript
      refund_window_days:  REFUND_WINDOW_DAYS,
      retention_days:       PAYOUT_RETENTION_DAYS,
      reserve_window_days:   DISPUTE_RESERVE_WINDOW_DAYS,
```

## RPC `refund_app_purchase` — lê `refund_window_days` da própria venda

Troca (em `supabase/migrations/20260930110000_reembolso_app_purchase.sql`,
via novo `CREATE OR REPLACE` — assinatura idêntica, sem DROP necessário):

```sql
  if purchase.paid_at is null or purchase.paid_at <= now() - interval '15 days' then
    raise exception 'Fora do prazo de reembolso — só é possível solicitar até 15 dias após o pagamento.';
  end if;
```

por:

```sql
  if purchase.paid_at is null or purchase.paid_at <= now() - (purchase.refund_window_days || ' days')::interval then
    raise exception 'Fora do prazo de reembolso — só é possível solicitar até % dias após o pagamento.', purchase.refund_window_days;
  end if;
```

`(coluna_integer || ' days')::interval` é o padrão Postgres pra construir
um `interval` dinâmico a partir de uma coluna — `select` já traz
`refund_window_days` junto com o resto de `purchase` (a função já faz
`select * into purchase`, a coluna nova vem de graça).

## RPC `create_partner_payout` — lê `retention_days`/`reserve_window_days` da venda

Só a perna de `app_purchases` muda (a de `subscription_invoices` continua
com `interval '16 days'` fixo — fora de escopo). Troca, nas duas
ocorrências (elegibilidade + comentário de erro):

```sql
      and ap.paid_at <= now() - interval '16 days'
```
por
```sql
      and ap.paid_at <= now() - (ap.retention_days || ' days')::interval
```

e

```sql
      and ap.paid_at <= now() - interval '120 days'
```
por
```sql
      and ap.paid_at <= now() - (ap.reserve_window_days || ' days')::interval
```

Mesma assinatura (6 parâmetros) — `CREATE OR REPLACE` direto, sem DROP.

## `classifyPurchasePayoutStatus` ganha 3º parâmetro opcional

Em `lib/services/payouts.ts`, troca:

```typescript
export function classifyPurchasePayoutStatus(
  paidAt: string,
  coveredByConfirmedPayout: boolean,
): 'retido' | 'elegivel' | 'pago' {
  if (coveredByConfirmedPayout) return 'pago'
  const cutoff = new Date(paidAt).getTime() + PAYOUT_RETENTION_DAYS * 86400_000
  return Date.now() >= cutoff ? 'elegivel' : 'retido'
}
```

por:

```typescript
export function classifyPurchasePayoutStatus(
  paidAt: string,
  coveredByConfirmedPayout: boolean,
  retentionDays: number = PAYOUT_RETENTION_DAYS,
): 'retido' | 'elegivel' | 'pago' {
  if (coveredByConfirmedPayout) return 'pago'
  const cutoff = new Date(paidAt).getTime() + retentionDays * 86400_000
  return Date.now() >= cutoff ? 'elegivel' : 'retido'
}
```

Parâmetro opcional com default = constante atual — toda chamada existente
que não passa o 3º argumento continua com o comportamento de hoje
(`subscription_invoices`, que não tem coluna própria, nunca precisa
mudar). Só as duas chamadas sobre `app_purchases` passam a informar
`p.retention_days`.

## Telas que hoje leem a constante global — passam a ler a coluna da venda

**`app/admin/marketplace/repasses/page.tsx`**:
- Loop da fatia principal: `classifyPurchasePayoutStatus(p.paid_at, coveredIds.has(p.id))` → `classifyPurchasePayoutStatus(p.paid_at, coveredIds.has(p.id), p.retention_days)`.
- Loop da reserva: troca `const RESERVE_WINDOW_MS = DISPUTE_RESERVE_WINDOW_DAYS * 86400_000` (constante única, fora do loop) por `p.reserve_window_days * 86400_000` calculado dentro do loop, por venda.
- Select de `purchases` ganha `retention_days, reserve_window_days`.

**`app/admin/financeiro/contas/page.tsx`**:
- Mesma troca na chamada de `classifyPurchasePayoutStatus` pra `app_purchases` (a de `subscription_invoices`, logo abaixo, continua sem 3º argumento).
- Select ganha `retention_days`.

**`app/api/admin/app-purchases/[purchaseId]/refund/route.ts`**:
- Remove o `const REFUND_WINDOW_DAYS = 15` local, importa de `@/lib/services/payouts`.
- Select ganha `refund_window_days`.
- Checagem de janela passa a usar `purchase.refund_window_days` em vez da constante importada diretamente (mesmo raciocínio: depois que o Stripe confirma o pagamento, a verdade sobre a janela daquela venda específica vive na própria linha, não numa constante compartilhada que pode já ter mudado).

**`components/admin/finance/RefundAppPurchaseModal.tsx`**:
- Remove o `const REFUND_WINDOW_DAYS = 15` local.
- `PaidAppPurchase` ganha campo `refund_window_days: number`.
- `withinWindow`/texto de aviso usam `purchase.refund_window_days` em vez da constante.

**`app/admin/financeiro/page.tsx`**:
- Select de `paidApps` (linha que já traz `refund_status`/`refunded_amount`/etc pro `PaidAppPurchase`) ganha `refund_window_days`.

## Erros e casos de borda

- **Zero vendas existentes** (confirmado): não há backfill a decidir, os
  defaults das colunas novas já cobrem o único estado real do banco hoje.
- **`refund_window_days` como `0` ou negativo**: bloqueado pelo CHECK —
  nunca uma venda fica sem nenhuma janela de reembolso por erro de dado.
- **Sessão de checkout criada antes desta migração, confirmada depois**:
  não existe — `app_purchases` nasce `pending` e só vira `paid` pelo
  webhook; o insert (que já grava os 3 prazos) e a confirmação são a
  mesma linha, não há como a linha existir sem os prazos gravados.

## Testes

- `lib/services/payouts.ts`: `classifyPurchasePayoutStatus` com e sem o
  3º argumento (comportamento idêntico ao de hoje quando omitido;
  resultado diferente quando um `retentionDays` diferente de
  `PAYOUT_RETENTION_DAYS` é passado).
- Checkout: `refund_window_days`/`retention_days`/`reserve_window_days`
  gravados corretamente no insert (valores batem com as constantes).
- Sem teste de RPC SQL novo (sem harness de teste de banco neste
  projeto, mesmo padrão já estabelecido nas migrations anteriores desta
  sessão — correção verificada por leitura + review, não por teste
  automatizado de SQL).
