# Snapshot de Prazos Financeiros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `app_purchases` row snapshots the refund window (15d), payout retention (16d), and dispute-reserve window (120d) that were in effect at checkout time, so a future change to those global constants never retroactively changes the rules a past sale is evaluated under.

**Architecture:** One migration adds 3 integer columns to `app_purchases` (with CHECKs and defaults matching today's constants) and rewrites `refund_app_purchase`/`create_partner_payout` (both unchanged signatures — `CREATE OR REPLACE` only, no DROP needed) to read the interval from the row instead of a hardcoded literal. The checkout route sets all 3 explicitly at insert time. A newly-exported `REFUND_WINDOW_DAYS` constant (consolidating two previously-duplicated local consts) and a backward-compatible optional 3rd parameter on `classifyPurchasePayoutStatus` let every TS call site read the per-row value instead of the global constant.

**Spec:** `docs/superpowers/specs/2026-10-01-snapshot-prazos-financeiros-design.md`

## Global Constraints

- Scope: only `app_purchases`. `subscription_invoices` retention stays on the global 16-day literal — never had reserve/refund-window columns, out of scope.
- Production has zero rows in `app_purchases`/`partner_payouts` (confirmed by audit) — no backfill logic needed, column defaults alone cover today's actual data.
- `classifyPurchasePayoutStatus`'s new 3rd parameter is optional with a default of `PAYOUT_RETENTION_DAYS` — every existing call site that doesn't pass it keeps today's exact behavior.
- Both rewritten RPCs keep their existing parameter signatures — `CREATE OR REPLACE` only. Do NOT add a `DROP FUNCTION` (that's only needed when the parameter list itself changes, per the lesson from an earlier plan this session).
- The Postgres pattern for a dynamic interval from an integer column is `(column || ' days')::interval` — use this exact pattern, not string concatenation into a literal `interval '...'`.

---

### Task 1: Migration — schema, both RPCs, `REFUND_WINDOW_DAYS`, `classifyPurchasePayoutStatus`

**Files:**
- Create: `supabase/migrations/20261001100000_snapshot_prazos_financeiros.sql`
- Modify: `lib/services/payouts.ts`
- Modify: `__tests__/payouts.test.ts`

**Interfaces:**
- Produces: `export const REFUND_WINDOW_DAYS = 15` in `lib/services/payouts.ts` — consumed by Task 2 (checkout), Task 3 (admin route + modal).
- Produces: `app_purchases` gains `refund_window_days int`, `retention_days int`, `reserve_window_days int` (all `not null`, defaults 15/16/120, CHECK `> 0`) — consumed by Tasks 2-4.
- Produces: `classifyPurchasePayoutStatus(paidAt, coveredByConfirmedPayout, retentionDays = PAYOUT_RETENTION_DAYS)` — consumed by Task 4.
- Produces: `refund_app_purchase`/`create_partner_payout` RPCs now read `purchase.refund_window_days`/`ap.retention_days`/`ap.reserve_window_days` from the row.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20261001100000_snapshot_prazos_financeiros.sql

-- Snapshot dos prazos financeiros por venda (reembolso/retenção/reserva).
-- Achado na auditoria da área "Vendas e financeiro" do parceiro
-- (2026-10-01): os 3 prazos (15d reembolso, 16d retenção, 120d reserva)
-- eram literais fixos nas RPCs — uma mudança futura na constante valeria
-- retroativamente pra toda venda já existente, não só pras novas. Spec
-- completo em docs/superpowers/specs/2026-10-01-snapshot-prazos-
-- financeiros-design.md. Produção tem zero linhas em app_purchases —
-- sem backfill a decidir.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) app_purchases ganha os 3 prazos como snapshot — mesmo princípio de
--    commission_percent/commission_amount, gravados no checkout, nunca
--    recalculados depois.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.app_purchases
  add column if not exists refund_window_days   integer not null default 15,
  add column if not exists retention_days        integer not null default 16,
  add column if not exists reserve_window_days    integer not null default 120;

alter table public.app_purchases
  add constraint app_purchases_refund_window_days_check check (refund_window_days > 0);
alter table public.app_purchases
  add constraint app_purchases_retention_days_check check (retention_days > 0);
alter table public.app_purchases
  add constraint app_purchases_reserve_window_days_check check (reserve_window_days > 0);

comment on column public.app_purchases.refund_window_days is
  'Janela de reembolso voluntário (dias), snapshot no checkout — nunca recalculada. Fonte de verdade da RPC refund_app_purchase pra esta venda específica.';
comment on column public.app_purchases.retention_days is
  'Retenção da fatia principal de repasse (dias), snapshot no checkout. Fonte de verdade da RPC create_partner_payout pra esta venda específica.';
comment on column public.app_purchases.reserve_window_days is
  'Janela da reserva de disputa (dias), snapshot no checkout. Fonte de verdade da RPC create_partner_payout pra esta venda específica.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) refund_app_purchase — lê refund_window_days da própria venda em vez
--    de interval '15 days' fixo. Assinatura idêntica (3 params) — CREATE
--    OR REPLACE direto, sem DROP.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.refund_app_purchase(
  "p_purchase_id" uuid,
  "p_amount"       numeric,
  "p_reason"       text
)
returns public.app_purchases
language plpgsql security definer
set search_path to 'public'
as $$
declare
  purchase public.app_purchases;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode solicitar reembolso.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Informe o motivo do reembolso.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor de reembolso inválido.';
  end if;

  select * into purchase from public.app_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  if purchase.status <> 'paid' then
    raise exception 'Só é possível reembolsar uma compra paga.';
  end if;
  if purchase.refund_status = 'processing' then
    raise exception 'Já existe um reembolso em andamento para esta compra — aguarde a confirmação antes de pedir outro.';
  end if;
  if purchase.paid_at is null or purchase.paid_at <= now() - (purchase.refund_window_days || ' days')::interval then
    raise exception 'Fora do prazo de reembolso — só é possível solicitar até % dias após o pagamento.', purchase.refund_window_days;
  end if;
  if p_amount > (purchase.amount - purchase.refunded_amount) then
    raise exception 'Valor maior que o saldo ainda reembolsável (R$ %).', (purchase.amount - purchase.refunded_amount);
  end if;

  update public.app_purchases
    set refund_status   = 'processing',
        refunded_amount = purchase.refunded_amount + p_amount,
        refund_reason   = p_reason,
        refunded_by     = auth.uid(),
        updated_at      = now()
    where id = p_purchase_id
    returning * into purchase;

  return purchase;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) create_partner_payout — só a perna de app_purchases passa a ler
--    retention_days/reserve_window_days da venda em vez de interval '16
--    days'/'120 days' fixos. subscription_invoices continua com '16 days'
--    fixo (fora de escopo). Assinatura idêntica (6 params) — CREATE OR
--    REPLACE direto, sem DROP.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.create_partner_payout(
  "p_partner_id"                uuid,
  "p_app_purchase_ids"          uuid[],
  "p_reference"                 text,
  "p_notes"                     text default null,
  "p_subscription_invoice_ids"  uuid[] default null,
  "p_reserve_app_purchase_ids"  uuid[] default null
)
returns public.partner_payouts
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_payout            public.partner_payouts;
  v_total             numeric(12,2) := 0;
  v_app_valid_count   integer := 0;
  v_app_requested     integer := coalesce(array_length(p_app_purchase_ids, 1), 0);
  v_sub_valid_count   integer := 0;
  v_sub_requested     integer := coalesce(array_length(p_subscription_invoice_ids, 1), 0);
  v_reserve_valid_count integer := 0;
  v_reserve_requested   integer := coalesce(array_length(p_reserve_app_purchase_ids, 1), 0);
  v_app_total         numeric(12,2) := 0;
  v_sub_total         numeric(12,2) := 0;
  v_reserve_total      numeric(12,2) := 0;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode registrar repasse.';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'Informe a referência/comprovante do repasse.';
  end if;
  if v_app_requested = 0 and v_sub_requested = 0 and v_reserve_requested = 0 then
    raise exception 'Selecione ao menos uma venda ou fatura de assinatura pra repassar.';
  end if;

  if v_app_requested > 0 then
    perform 1 from public.app_purchases where id = any(p_app_purchase_ids) for update;

    select count(*), coalesce(sum(
        (ap.partner_amount - ap.reserve_amount)
          - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2)
      ), 0)
      into v_app_valid_count, v_app_total
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids)
      and ap.partner_id = p_partner_id
      and ap.status = 'paid'
      and ap.paid_at is not null
      and ap.paid_at <= now() - (ap.retention_days || ' days')::interval
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
      );

    if v_app_valid_count <> v_app_requested then
      raise exception 'Uma ou mais vendas não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção, ou não são deste parceiro).';
    end if;
  end if;

  if v_sub_requested > 0 then
    perform 1 from public.subscription_invoices where id = any(p_subscription_invoice_ids) for update;

    select count(*), coalesce(sum(si.partner_amount), 0)
      into v_sub_valid_count, v_sub_total
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    where si.id = any(p_subscription_invoice_ids)
      and s.partner_id = p_partner_id
      and si.paid_at <= now() - interval '16 days'
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
      );

    if v_sub_valid_count <> v_sub_requested then
      raise exception 'Uma ou mais faturas de assinatura não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção de 16 dias, ou não são deste parceiro).';
    end if;
  end if;

  if v_reserve_requested > 0 then
    perform 1 from public.app_purchases where id = any(p_reserve_app_purchase_ids) for update;

    select count(*), coalesce(sum(
        ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2)
      ), 0)
      into v_reserve_valid_count, v_reserve_total
    from public.app_purchases ap
    where ap.id = any(p_reserve_app_purchase_ids)
      and ap.partner_id = p_partner_id
      and ap.status = 'paid'
      and ap.reserve_status = 'held'
      and ap.paid_at is not null
      and ap.paid_at <= now() - (ap.reserve_window_days || ' days')::interval
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'reserve' and po.status = 'confirmado'
      );

    if v_reserve_valid_count <> v_reserve_requested then
      raise exception 'Uma ou mais reservas não são elegíveis pra liberação agora (já liberadas, ainda dentro da janela, com disputa, ou não são deste parceiro).';
    end if;
  end if;

  v_total := v_app_total + v_sub_total + v_reserve_total;

  insert into public.partner_payouts (partner_id, total_amount, reference, notes, requested_by)
  values (p_partner_id, v_total, trim(p_reference), nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning * into v_payout;

  if v_app_requested > 0 then
    insert into public.partner_payout_items (payout_id, app_purchase_id, amount, kind)
    select v_payout.id, ap.id,
           (ap.partner_amount - ap.reserve_amount) - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2),
           'main'
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids);
  end if;

  if v_sub_requested > 0 then
    insert into public.partner_payout_items (payout_id, subscription_invoice_id, amount)
    select v_payout.id, si.id, si.partner_amount
    from public.subscription_invoices si
    where si.id = any(p_subscription_invoice_ids);
  end if;

  if v_reserve_requested > 0 then
    insert into public.partner_payout_items (payout_id, app_purchase_id, amount, kind)
    select v_payout.id, ap.id,
           ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2),
           'reserve'
    from public.app_purchases ap
    where ap.id = any(p_reserve_app_purchase_ids);

    update public.app_purchases
      set reserve_status = 'released'
      where id = any(p_reserve_app_purchase_ids);
  end if;

  return v_payout;
end;
$$;
```

Note: no new `revoke`/`grant` needed for either function — `CREATE OR
REPLACE` on an unchanged parameter signature preserves existing grants
(unlike the earlier 5→6-param change in this codebase's history, which
genuinely changed the signature and required a DROP+fresh grants; here
the signature is untouched, only the body changed).

- [ ] **Step 2: Update `lib/services/payouts.ts`**

Add near the top, after the existing `DISPUTE_RESERVE_WINDOW_DAYS` export:

```typescript
/**
 * Janela pra pedir reembolso voluntário de app_purchases — RPC
 * refund_app_purchase. Sempre fecha antes de PAYOUT_RETENTION_DAYS
 * (16 dias) ficar elegível, por desenho (spec: 2026-09-30-app-purchase-
 * refund-design.md) — garante que nunca existe venda simultaneamente
 * reembolsável e elegível pra repasse.
 */
export const REFUND_WINDOW_DAYS = 15
```

Change `classifyPurchasePayoutStatus` from:

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

to:

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

- [ ] **Step 3: Write the failing tests**

Add to `__tests__/payouts.test.ts` — merge `REFUND_WINDOW_DAYS` into the
existing import line from `@/lib/services/payouts` at the top of the
file, then add:

```typescript
describe('REFUND_WINDOW_DAYS', () => {
  it('é 15 dias', () => {
    expect(REFUND_WINDOW_DAYS).toBe(15)
  })
})
```

In the existing `describe('classifyPurchasePayoutStatus', ...)` block,
add two new `it`s (don't remove or change the existing ones — they cover
the default-parameter behavior already since they never pass a 3rd
argument):

```typescript
  it('aceita retentionDays customizado — elegível antes dos 16 dias padrão se o prazo da venda for menor', () => {
    const paidAt = new Date(Date.now() - 10 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false, 7)).toBe('elegivel')
  })

  it('aceita retentionDays customizado — ainda retido depois dos 16 dias padrão se o prazo da venda for maior', () => {
    const paidAt = new Date(Date.now() - 20 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false, 30)).toBe('retido')
  })
```

- [ ] **Step 4: Run tests to verify they fail, then pass**

Run: `npx vitest run __tests__/payouts.test.ts`
Before Step 2: FAIL (`REFUND_WINDOW_DAYS` doesn't exist; the two new
`retentionDays`-override tests fail because the function ignores the 3rd
arg).
After Step 2: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001100000_snapshot_prazos_financeiros.sql lib/services/payouts.ts __tests__/payouts.test.ts
git commit -m "feat: snapshot dos prazos financeiros por venda — schema, RPCs e constantes"
```

---

### Task 2: Checkout — grava os 3 prazos na venda

**Files:**
- Modify: `app/api/apps/[appId]/checkout/route.ts`

**Interfaces:**
- Consumes: `REFUND_WINDOW_DAYS`, `PAYOUT_RETENTION_DAYS`, `DISPUTE_RESERVE_WINDOW_DAYS` from Task 1 (`lib/services/payouts.ts`).

- [ ] **Step 1: Implement**

The route already imports `calculateReserveAmountCents` from
`@/lib/services/payouts` (from an earlier plan). Change that import line
from:

```typescript
import { calculateReserveAmountCents } from '@/lib/services/payouts'
```

to:

```typescript
import { calculateReserveAmountCents, REFUND_WINDOW_DAYS, PAYOUT_RETENTION_DAYS, DISPUTE_RESERVE_WINDOW_DAYS } from '@/lib/services/payouts'
```

In the `app_purchases` insert payload, find:

```typescript
      reserve_amount:      reserveCents / 100,
      reserve_status:      partnerId ? 'held' : null,
      status:              'pending',
```

Replace with:

```typescript
      reserve_amount:      reserveCents / 100,
      reserve_status:      partnerId ? 'held' : null,
      refund_window_days:  REFUND_WINDOW_DAYS,
      retention_days:       PAYOUT_RETENTION_DAYS,
      reserve_window_days:   DISPUTE_RESERVE_WINDOW_DAYS,
      status:              'pending',
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — must be clean.

No new test for this route (zero precedent, same scope discipline as the
rest of this route's history in this session — the pure values being
written are already covered by Task 1's constant tests).

- [ ] **Step 3: Commit**

```bash
git add "app/api/apps/[appId]/checkout/route.ts"
git commit -m "feat: checkout grava snapshot dos 3 prazos financeiros na venda"
```

---

### Task 3: Rota admin de reembolso + modal — consolida `REFUND_WINDOW_DAYS`

**Files:**
- Modify: `app/api/admin/app-purchases/[purchaseId]/refund/route.ts`
- Modify: `components/admin/finance/RefundAppPurchaseModal.tsx`
- Modify: `app/admin/financeiro/page.tsx`

**Interfaces:**
- Consumes: `REFUND_WINDOW_DAYS` from Task 1.
- Produces: `PaidAppPurchase` gains `refund_window_days: number` — Task 4 doesn't consume this directly, but keep the field present for any future reader.

- [ ] **Step 1: Admin route — read `refund_window_days` from the row**

In `app/api/admin/app-purchases/[purchaseId]/refund/route.ts`:

Remove the local constant:

```typescript
const REFUND_WINDOW_DAYS = 15
```

Add an import at the top:

```typescript
import { REFUND_WINDOW_DAYS } from '@/lib/services/payouts'
```

(This import is used only as a fallback/consistency check — the real check now reads the row's own column, see below. Keeping the import is optional if nothing else in the file needs the constant after this change; if after Step 1's edit nothing references `REFUND_WINDOW_DAYS` anymore, skip the import entirely rather than adding an unused one.)

Change the select (currently):

```typescript
    .select('id, status, amount, refunded_amount, refund_status, paid_at, stripe_payment_intent_id')
```

to:

```typescript
    .select('id, status, amount, refunded_amount, refund_status, paid_at, stripe_payment_intent_id, refund_window_days')
```

Change the window check (currently):

```typescript
  if (!purchase.paid_at || new Date(purchase.paid_at).getTime() <= Date.now() - REFUND_WINDOW_DAYS * 86400_000) {
```

to:

```typescript
  if (!purchase.paid_at || new Date(purchase.paid_at).getTime() <= Date.now() - purchase.refund_window_days * 86400_000) {
```

Given this removes the only usage of the `REFUND_WINDOW_DAYS` import, **do not add that import at all** — just delete the local `const REFUND_WINDOW_DAYS = 15` line and use `purchase.refund_window_days` directly, as shown above.

- [ ] **Step 2: Modal — read `refund_window_days` from the purchase prop**

In `components/admin/finance/RefundAppPurchaseModal.tsx`:

Add `refund_window_days: number` to the `PaidAppPurchase` interface:

```typescript
export interface PaidAppPurchase {
  id:               string
  application_name: string
  plan_name:        string
  amount:           number
  refunded_amount:  number
  refund_status:    'processing' | 'refunded' | null
  paid_at:          string
  refund_window_days: number
  buyer_name?:      string | null
  buyer_email?:     string | null
}
```

Remove the local constant:

```typescript
const REFUND_WINDOW_DAYS = 15
```

Change every use of `REFUND_WINDOW_DAYS` in this file to `purchase.refund_window_days`:

```typescript
  const withinWindow = daysSincePaid <= purchase.refund_window_days
```

```tsx
            <p className="text-red-400">Fora do prazo de reembolso — passaram mais de {purchase.refund_window_days} dias desde o pagamento.</p>
```

- [ ] **Step 3: `app/admin/financeiro/page.tsx` — select the new column and map it through**

Find the `app_purchases` select for `paidApps` (currently):

```typescript
    .select('id, application_name, plan_name, amount, refunded_amount, refund_status, paid_at, profiles!app_purchases_buyer_user_id_fkey(full_name, email)')
```

Change to:

```typescript
    .select('id, application_name, plan_name, amount, refunded_amount, refund_status, paid_at, refund_window_days, profiles!app_purchases_buyer_user_id_fkey(full_name, email)')
```

Find the manual-cast type and mapping right below that select (the one
building `paidAppPurchases: PaidAppPurchase[]`) and add `refund_window_days`
to both the cast type and the returned object, following the exact same
pattern already used there for the other fields (e.g. `refund_status`).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — must be clean (this will catch it if the
`app/admin/financeiro/page.tsx` mapping is missed, since `PaidAppPurchase`
now requires `refund_window_days`).

No new tests — these are the same untested UI/route files from earlier
plans this session (no precedent, consistent scope discipline).

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/app-purchases/[purchaseId]/refund/route.ts" components/admin/finance/RefundAppPurchaseModal.tsx app/admin/financeiro/page.tsx
git commit -m "fix: reembolso de app lê a janela da própria venda em vez de constante fixa"
```

---

### Task 4: Telas de repasses/contas — leem retenção/reserva da própria venda

**Files:**
- Modify: `app/admin/marketplace/repasses/page.tsx`
- Modify: `app/admin/financeiro/contas/page.tsx`

**Interfaces:**
- Consumes: `classifyPurchasePayoutStatus`'s new 3rd parameter from Task 1.

- [ ] **Step 1: `repasses/page.tsx`**

Change the `app_purchases` select (currently includes
`reserve_amount, reserve_status` from an earlier plan) to also include
`retention_days, reserve_window_days`:

```typescript
      .select('id, partner_id, application_name, plan_name, amount, partner_amount, refunded_amount, paid_at, reserve_amount, reserve_status, retention_days, reserve_window_days')
```

In the main-portion loop, find:

```typescript
    const status = classifyPurchasePayoutStatus(p.paid_at, coveredIds.has(p.id))
```

Change to:

```typescript
    const status = classifyPurchasePayoutStatus(p.paid_at, coveredIds.has(p.id), p.retention_days)
```

In the reserve loop, find:

```typescript
  const RESERVE_WINDOW_MS = DISPUTE_RESERVE_WINDOW_DAYS * 86400_000
  for (const p of purchases ?? []) {
    if (!p.paid_at || p.reserve_status !== 'held' || !p.reserve_amount || p.reserve_amount <= 0) continue
    const reserveEligible = Date.now() - new Date(p.paid_at).getTime() >= RESERVE_WINDOW_MS
```

Change to (move the window calculation inside the loop, per-row, and
drop the now-unused `DISPUTE_RESERVE_WINDOW_DAYS` import if nothing else
in the file uses it — check before removing the import):

```typescript
  for (const p of purchases ?? []) {
    if (!p.paid_at || p.reserve_status !== 'held' || !p.reserve_amount || p.reserve_amount <= 0) continue
    const reserveEligible = Date.now() - new Date(p.paid_at).getTime() >= p.reserve_window_days * 86400_000
```

(The `subscription_invoices` loop further down, which still calls
`classifyPurchasePayoutStatus(si.paid_at, coveredInvoiceIds.has(si.id))`
with 2 arguments, stays exactly as-is — it has no per-row retention
column, by design, out of scope.)

- [ ] **Step 2: `financeiro/contas/page.tsx`**

Change the `app_purchases` select (currently
`'id, amount, partner_amount, reserve_amount, reserve_status, refunded_amount, paid_at'`)
to also include `retention_days`:

```typescript
    supabase.from('app_purchases').select('id, amount, partner_amount, reserve_amount, reserve_status, refunded_amount, paid_at, retention_days').eq('status', 'paid').not('partner_id', 'is', null),
```

Find:

```typescript
    const status = classifyPurchasePayoutStatus(p.paid_at, coveredIds.has(p.id))
```

Change to:

```typescript
    const status = classifyPurchasePayoutStatus(p.paid_at, coveredIds.has(p.id), p.retention_days)
```

(The `subscription_invoices` loop right below, calling
`classifyPurchasePayoutStatus(si.paid_at, coveredInvoiceIds.has(si.id))`
with 2 arguments, stays exactly as-is — same reasoning as Task 4 Step 1.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — must be clean.

No new tests (same untested-admin-screen precedent as every prior UI
task touching these two files this session — the underlying logic
change is already covered by Task 1's `classifyPurchasePayoutStatus`
tests).

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in as a Técnico Líder, visit
`/admin/marketplace/repasses` and `/admin/financeiro/contas`. Confirm
both pages still load without errors (there is no real sales data in
production yet, so this only confirms no crash/regression, not a visible
behavior change — consistent with how this exact pair of pages was
manually verified in an earlier plan this session).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the new ones from Task 1.

- [ ] **Step 6: Commit**

```bash
git add app/admin/marketplace/repasses/page.tsx app/admin/financeiro/contas/page.tsx
git commit -m "fix: repasses/contas leem retenção e janela de reserva da própria venda"
```

---

## Self-Review Notes

**Spec coverage:** schema (Task 1) ✓, both RPCs (Task 1) ✓, `REFUND_WINDOW_DAYS` consolidation (Task 1 + Task 3) ✓, checkout snapshot write (Task 2) ✓, admin refund route + modal reading the row (Task 3) ✓, repasses/contas reading the row (Task 4) ✓. `subscription_invoices` explicitly untouched throughout, as the spec requires.

**Type consistency:** `PaidAppPurchase.refund_window_days` (Task 3) is read by nothing new in this plan but is correctly threaded from `financeiro/page.tsx`'s select through to the modal's type, so a future reader has it. `classifyPurchasePayoutStatus`'s 3rd parameter name (`retentionDays`) and default value match exactly between its definition (Task 1) and both call sites that pass it explicitly (Task 4) — the two call sites that don't pass it (`subscription_invoices` loops) are unaffected by construction (optional parameter).

**Placeholder scan:** none found — every step has runnable code or an exact shell command.
