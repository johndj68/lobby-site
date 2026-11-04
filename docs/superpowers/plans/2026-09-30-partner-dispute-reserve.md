# Partner Dispute Reserve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retain 10% of each partner's `partner_amount` on `app_purchases` in a separate reserve, released only after 120 days without a dispute, and surface exactly how much a líder needs to manually collect from a partner when money already paid out gets clawed back by a lost Stripe dispute.

**Architecture:** A new migration adds `reserve_amount`/`reserve_status` to `app_purchases`, a `kind` discriminator to `partner_payout_items` (so the same sale can be paid in two separate events — main at day 16, reserve at day 120 — without the existing "already covered" check blocking the second one), and `partner_clawback_amount` to `payment_disputes`. `create_partner_payout` gains a 6th parameter for reserve release. The checkout route computes the reserve snapshot at sale time. The webhook's existing lost-dispute handler (which already writes down `financial_transactions`) gains a second concern: auto-absorb the reserve if it hasn't been released yet, and compute+surface the amount already paid out if it has. Two existing admin screens (`/admin/marketplace/repasses`, `/admin/disputas`) get additive UI changes to show the new numbers.

**Spec:** `docs/superpowers/specs/2026-09-30-partner-dispute-reserve-design.md`

## Global Constraints

- Scope: only `app_purchases`. `subscription_invoices` has no reserve in this plan.
- Reserve is **10%** of `partner_amount` (`RESERVE_PERCENT`), snapshotted at checkout — never recalculated later, same principle as `commission_amount`/`partner_amount`.
- Reserve window is **120 days** (`DISPUTE_RESERVE_WINDOW_DAYS`) from `paid_at`, independent of the existing 16-day main-portion retention.
- `partner_amount`'s meaning and the existing CHECK `commission_amount + partner_amount = amount` do not change — the reserve is a slice *within* `partner_amount`, not an addition to it.
- The main portion and the reserve portion each compute their own refund-proportional deduction independently (`round(refunded_amount * portion / amount, 2)`), never by splitting one combined deduction — they can be paid months apart and must each be correct on their own.
- No automated bank debit exists anywhere in this system — when money already paid to a partner needs to be clawed back (lost dispute after a payout), the system computes and surfaces the exact amount; collecting it stays 100% manual, same as the rest of the payout flow.
- The migration is written and committed but is NOT pushed to the live database by any task — `supabase db push --linked` is a separate, human-confirmed step after the final review passes (same deferral pattern as the prior refund plan).

---

### Task 1: Migration — schema, `create_partner_payout` rewrite, JS constants

**Files:**
- Create: `supabase/migrations/20260930120000_reserva_disputa_parceiro.sql`
- Modify: `lib/services/payouts.ts`
- Modify: `__tests__/payouts.test.ts`

**Interfaces:**
- Produces: `RESERVE_PERCENT = 10`, `DISPUTE_RESERVE_WINDOW_DAYS = 120`, `calculateReserveAmountCents(partnerAmountCents: number): number` in `lib/services/payouts.ts` — consumed by Task 2 (checkout route).
- Produces: `create_partner_payout` (now 6 params: adds `p_reserve_app_purchase_ids uuid[] default null`) — consumed by Task 4 (RepassesClient).
- Produces: `app_purchases.reserve_amount`/`.reserve_status`, `partner_payout_items.kind`, `payment_disputes.partner_clawback_amount` columns — consumed by Tasks 2, 3, 4, 5.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260930120000_reserva_disputa_parceiro.sql

-- Reserva de disputa do parceiro: 10% do partner_amount retido até 120
-- dias sem disputa (janela de chargeback das bandeiras é bem maior que a
-- retenção de repasse de 16 dias). Decisão do usuário 2026-09-30. Spec
-- completo em docs/superpowers/specs/2026-09-30-partner-dispute-reserve-
-- design.md. Escopo: só app_purchases, subscription_invoices fica fora.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) app_purchases ganha reserve_amount/reserve_status — snapshot no
--    checkout (Task 2), nunca recalculado depois. reserve_amount é uma
--    fatia DENTRO de partner_amount, não um valor adicional — o CHECK
--    commission_amount+partner_amount=amount continua intacto sem mudança.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.app_purchases
  add column if not exists reserve_amount numeric(12,2) not null default 0,
  add column if not exists reserve_status text;

alter table public.app_purchases
  add constraint app_purchases_reserve_status_check
  check (reserve_status is null or reserve_status = any (array['held', 'released', 'clawed_back']));

alter table public.app_purchases
  add constraint app_purchases_reserve_amount_check
  check (reserve_amount >= 0 and reserve_amount <= partner_amount);

comment on column public.app_purchases.reserve_amount is
  '10% de partner_amount, snapshot no checkout. Só > 0 quando partner_id is not null (app da LOBBY nunca reserva nada, sem parceiro pra reter).';
comment on column public.app_purchases.reserve_status is
  'null = sem reserva (app da LOBBY). held = retida. released = liberada após 120 dias sem disputa, já paga. clawed_back = disputa perdida antes de liberar, LOBBY absorve, nunca paga.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) partner_payout_items ganha kind — a mesma venda agora pode ser paga
--    em dois momentos (principal no dia 16, reserva no dia 120). Sem isso,
--    a checagem de "já coberto por repasse confirmado" (por app_purchase_id
--    só) bloquearia a reserva pra sempre assim que a fatia principal fosse
--    paga. Linhas existentes recebem 'main' pelo default — correto, são
--    todas repasses da fatia principal (reserva nunca existiu antes desta
--    migração).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.partner_payout_items
  add column if not exists kind text not null default 'main';

alter table public.partner_payout_items
  add constraint partner_payout_items_kind_check
  check (kind = any (array['main', 'reserve']));

-- ─────────────────────────────────────────────────────────────────────────
-- 3) payment_disputes ganha partner_clawback_amount — quanto já foi pago
--    ao parceiro ANTES da disputa chegar (soma de partner_payout_items
--    confirmados daquela venda, de qualquer kind). null/0 = nada a cobrar.
--    Gravado pelo webhook (Task 3), nunca calculado no client.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.payment_disputes
  add column if not exists partner_clawback_amount numeric(12,2);

comment on column public.payment_disputes.partner_clawback_amount is
  'Quanto já tinha sido pago ao parceiro (repasse confirmado) antes desta disputa perdida chegar — sem API de débito bancário no sistema, cobrança continua manual. null/0 = nada a cobrar (reserva absorveu tudo, ou nada tinha sido pago ainda).';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) create_partner_payout — ganha p_reserve_app_purchase_ids (6º
--    parâmetro). Postgres NÃO substitui uma função por outra com lista de
--    parâmetros diferente via CREATE OR REPLACE — mesmo motivo que já
--    forçou o DROP na migração anterior (4→5 parâmetros,
--    20260927240000_repasse_assinatura.sql). Sem o DROP abaixo, a versão
--    de 5 parâmetros continuaria existindo como um overload separado ao
--    lado da nova, e chamadas via supabase.rpc (que resolve por nome +
--    quantidade de argumentos informados) poderiam ficar ambíguas ou
--    continuar batendo na versão antiga sem a reserva. Fatia principal
--    agora paga partner_amount MENOS a reserva (a reserva nunca foi
--    elegível aqui); reserva só entra pela lista nova, com sua própria
--    janela de 120 dias e seu próprio desconto por reembolso
--    (independente do desconto da fatia principal — ver Global
--    Constraints do plano).
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.create_partner_payout(uuid, uuid[], text, text, uuid[]);

create function public.create_partner_payout(
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
      and ap.paid_at <= now() - interval '16 days'
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
      );

    if v_app_valid_count <> v_app_requested then
      raise exception 'Uma ou mais vendas não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção de 16 dias, ou não são deste parceiro).';
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
      and ap.paid_at <= now() - interval '120 days'
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'reserve' and po.status = 'confirmado'
      );

    if v_reserve_valid_count <> v_reserve_requested then
      raise exception 'Uma ou mais reservas não são elegíveis pra liberação agora (já liberadas, ainda dentro dos 120 dias, com disputa, ou não são deste parceiro).';
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

After the function body above, append (this is required — the `drop function` above removes the 5-param version's grants along with it, so the new 6-param signature needs its own, same as every prior drop+recreate in this codebase's migrations):

```sql
revoke execute on function public.create_partner_payout(uuid, uuid[], text, text, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.create_partner_payout(uuid, uuid[], text, text, uuid[], uuid[]) to authenticated;
```

Callers (`supabase.rpc('create_partner_payout', {...})`) pass arguments as named JSON keys, not positionally — Task 4's existing call site (which still only passes 5 keys) keeps working unmodified against the new 6-param signature because `p_reserve_app_purchase_ids` defaults to `null`; Task 4 itself adds the 6th key explicitly.

- [ ] **Step 2: Update `lib/services/payouts.ts`**

Add after the existing `PAYOUT_RETENTION_DAYS` export (keep everything else in the file unchanged):

```typescript
/**
 * Reserva de disputa do parceiro: 10% do partner_amount fica retido até
 * 120 dias sem disputa (janela de chargeback das bandeiras é bem maior
 * que os 16 dias de retenção da fatia principal). Snapshot no checkout,
 * nunca recalculado depois — mesmo princípio de PAYOUT_RETENTION_DAYS.
 */
export const RESERVE_PERCENT = 10
export const DISPUTE_RESERVE_WINDOW_DAYS = 120

/** Calcula a reserva em centavos — arredonda pro centavo mais próximo,
 *  nunca trunca (mesmo padrão de arredondamento já usado em todo o
 *  resto do fluxo financeiro). */
export function calculateReserveAmountCents(partnerAmountCents: number): number {
  return Math.round(partnerAmountCents * RESERVE_PERCENT / 100)
}
```

- [ ] **Step 3: Write the failing tests**

Add to `__tests__/payouts.test.ts` (keep the existing `describe` blocks intact, add a new one):

```typescript
import { RESERVE_PERCENT, DISPUTE_RESERVE_WINDOW_DAYS, calculateReserveAmountCents } from '@/lib/services/payouts'

describe('calculateReserveAmountCents', () => {
  it('é 10% do valor do parceiro', () => {
    expect(RESERVE_PERCENT).toBe(10)
    expect(calculateReserveAmountCents(10000)).toBe(1000) // R$100,00 de partner_amount → R$10,00 de reserva
  })

  it('arredonda pro centavo mais próximo', () => {
    expect(calculateReserveAmountCents(9999)).toBe(1000) // 999.9 arredonda pra 1000
    expect(calculateReserveAmountCents(10001)).toBe(1000) // 1000.1 arredonda pra 1000
  })

  it('zero fica zero (app sem parceiro)', () => {
    expect(calculateReserveAmountCents(0)).toBe(0)
  })
})

describe('DISPUTE_RESERVE_WINDOW_DAYS', () => {
  it('é 120 dias', () => {
    expect(DISPUTE_RESERVE_WINDOW_DAYS).toBe(120)
  })
})
```

(Update the existing `import` line at the top of the file to include the new names alongside `PAYOUT_RETENTION_DAYS` and `classifyPurchasePayoutStatus` — don't add a second separate `import` statement.)

- [ ] **Step 4: Run tests to verify they fail, then pass**

Run: `npx vitest run __tests__/payouts.test.ts`
Before Step 2: FAIL (`calculateReserveAmountCents` doesn't exist).
After Step 2: PASS (7 tests total — 3 existing + 4 new... actually the existing file has `PAYOUT_RETENTION_DAYS`/`classifyPurchasePayoutStatus` describe blocks already, this adds 2 more describe blocks with 4 new `it`s on top).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930120000_reserva_disputa_parceiro.sql lib/services/payouts.ts __tests__/payouts.test.ts
git commit -m "feat: reserva de disputa do parceiro — schema, create_partner_payout e constantes"
```

---

### Task 2: Checkout — snapshot da reserva na venda

**Files:**
- Modify: `app/api/apps/[appId]/checkout/route.ts`

**Interfaces:**
- Consumes: `calculateReserveAmountCents` from Task 1 (`lib/services/payouts.ts`).

- [ ] **Step 1: Implement**

In `app/api/apps/[appId]/checkout/route.ts`, add the import at the top (alongside the existing imports):

```typescript
import { calculateReserveAmountCents } from '@/lib/services/payouts'
```

Find this existing block:

```typescript
  const partnerCents = amountCents - commissionCents

  const { data: purchase, error: insertError } = await admin
    .from('app_purchases')
    .insert({
      application_id:      application.id,
      plan_id:             plan.id,
      application_name:    application.name,
      plan_name:           plan.name,
      buyer_user_id:       user.id,
      partner_id:          partnerId,
      amount:              amountCents / 100,
      currency:            plan.currency ?? 'BRL',
      commission_percent:  commissionPercent,
      commission_amount:   commissionCents / 100,
      partner_amount:      partnerCents / 100,
      status:              'pending',
    })
    .select('id')
    .single()
```

Replace with:

```typescript
  const partnerCents = amountCents - commissionCents
  // Reserva de disputa (10% do partner_amount, retida até 120 dias sem
  // disputa — spec: 2026-09-30-partner-dispute-reserve-design.md). App da
  // LOBBY (partnerId null) nunca reserva nada, sem parceiro pra reter.
  const reserveCents = partnerId ? calculateReserveAmountCents(partnerCents) : 0

  const { data: purchase, error: insertError } = await admin
    .from('app_purchases')
    .insert({
      application_id:      application.id,
      plan_id:             plan.id,
      application_name:    application.name,
      plan_name:           plan.name,
      buyer_user_id:       user.id,
      partner_id:          partnerId,
      amount:              amountCents / 100,
      currency:            plan.currency ?? 'BRL',
      commission_percent:  commissionPercent,
      commission_amount:   commissionCents / 100,
      partner_amount:      partnerCents / 100,
      reserve_amount:      reserveCents / 100,
      reserve_status:      partnerId ? 'held' : null,
      status:              'pending',
    })
    .select('id')
    .single()
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — must be clean.

There is no existing test file for this route (zero test coverage predates this plan — the pure reserve-calculation math is already covered by Task 1's `calculateReserveAmountCents` tests, which is why that calculation was extracted into a testable function rather than inlined here). Do not add a new test harness for the whole route in this task — out of scope.

- [ ] **Step 3: Commit**

```bash
git add "app/api/apps/[appId]/checkout/route.ts"
git commit -m "feat: snapshot da reserva de disputa no checkout de app"
```

---

### Task 3: Webhook — disputa perdida aciona a reserva

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`
- Modify: `__tests__/stripe-webhook.test.ts`

**Interfaces:**
- Consumes: `app_purchases.reserve_amount`/`.reserve_status`, `payment_disputes.partner_clawback_amount` from Task 1.

- [ ] **Step 1: Write the failing tests**

In `__tests__/stripe-webhook.test.ts`, inside the `describe('disputa Stripe (congelamento automático)', ...)` block, extend the `makeDisputeAdmin` helper (added in a prior plan) to also model `partner_payout_items` sums and `app_purchases` reserve fields. Find the existing helper's `opts` type and `from` mock — add:

```typescript
    const makeDisputeAdmin = (opts: {
      matchTable?: 'campaign_purchases' | 'credit_purchases' | 'app_purchases' | 'subscription_invoices' | null
      matchId?: string
      existingDispute?: unknown
      freezeResult?: { data?: unknown; error?: unknown }
      disputeRecord?: unknown
      financialTx?: { amount: number; status: string } | null
      appPurchaseRow?: { reserve_status: string | null } | null
      paidPartnerAmountSum?: number | null
    } = {}) => {
```

(add `appPurchaseRow` and `paidPartnerAmountSum` to the existing options type from the prior plan — don't remove `financialTx`, it's still used by the lost-dispute ledger-writedown tests already in this block).

In the same helper's `from` callback, the `app_purchases` table's `.select(...).eq(...).single()` (not `.maybeSingle()`) needs to resolve `opts.appPurchaseRow` when queried for `reserve_status`, and a new aggregate-style query against `partner_payout_items` needs to resolve to a list whose amounts sum to `opts.paidPartnerAmountSum`. Rather than modeling a real SQL `sum()` in the mock, have the route compute the sum in JS from the rows the query returns — so the mock just needs an `.eq()` chain ending in a thenable/array resolution. Add this branch to the helper's `chain` object (alongside the existing `maybeSingle`/`single` definitions):

```typescript
          chain.then = (resolve: (v: { data: unknown; error: null }) => void) => {
            if (table === 'partner_payout_items') {
              const amount = opts.paidPartnerAmountSum ?? 0
              // Mesmo formato de embed que o código real lê (partner_payouts
              // como objeto embutido com .status) — já vem pré-filtrado como
              // 'confirmado' aqui porque o teste só precisa verificar a SOMA
              // final, não a lógica de filtro em si (essa já é exercida
              // implicitamente por sempre vir com status='confirmado').
              resolve({ data: amount > 0 ? [{ amount, partner_payouts: { status: 'confirmado' } }] : [], error: null })
            } else {
              resolve({ data: [], error: null })
            }
          }
```

And make `single()` also resolve `app_purchases` reserve data when relevant:

```typescript
      chain.single = vi.fn().mockResolvedValue({
        data: table === 'payment_disputes'
          ? (opts.disputeRecord ?? null)
          : table === 'campaign_purchases'
            ? { campaign_id: 'campaign-1' }
            : table === 'subscription_invoices'
              ? { subscription_id: 'sub-row-1' }
              : table === 'app_purchases'
                ? (opts.appPurchaseRow ?? null)
                : null,
        error: null,
      })
```

(Merge this into the existing `chain.single` definition in the helper — don't duplicate the whole function, just add the `app_purchases` branch to its existing ternary chain.)

Now add 4 new tests, right after the existing `'dispute.closed com status lost de campanha não mexe em financial_transactions (sem ledger pra campanha)'` test (inside the same `describe` block, before `'redelivery de dispute.closed já processada não roda de novo'`):

```typescript
    it('dispute.closed com status lost absorve a reserva ainda não liberada (clawed_back automático)', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({
        disputeRecord: { id: 'dispute-row-1', source_type: 'app_purchases', source_id: 'app-purchase-1', held_amount: null, closed_at: null },
        appPurchaseRow: { reserve_status: 'held' },
        paidPartnerAmountSum: 0,
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.closed', { status: 'lost' }) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      const reserveUpdate = admin.updated['app_purchases']?.find(u => (u.payload as Record<string, unknown>).reserve_status === 'clawed_back')
      expect(reserveUpdate).toBeDefined()
    })

    it('dispute.closed com status lost calcula partner_clawback_amount quando já foi pago antes da disputa', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({
        disputeRecord: { id: 'dispute-row-1', source_type: 'app_purchases', source_id: 'app-purchase-1', held_amount: null, closed_at: null },
        appPurchaseRow: { reserve_status: 'released' },
        paidPartnerAmountSum: 90,
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.closed', { status: 'lost' }) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      const disputeUpdate = admin.updated['payment_disputes']?.find(u => (u.payload as Record<string, unknown>).partner_clawback_amount !== undefined)
      expect((disputeUpdate?.payload as Record<string, unknown>).partner_clawback_amount).toBe(90)
    })

    it('dispute.closed com status lost não grava partner_clawback_amount quando nada foi pago ainda', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({
        disputeRecord: { id: 'dispute-row-1', source_type: 'app_purchases', source_id: 'app-purchase-1', held_amount: null, closed_at: null },
        appPurchaseRow: { reserve_status: 'held' },
        paidPartnerAmountSum: 0,
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.closed', { status: 'lost' }) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      const disputeUpdate = admin.updated['payment_disputes']?.find(u => (u.payload as Record<string, unknown>).partner_clawback_amount !== undefined)
      expect(disputeUpdate).toBeUndefined()
    })

    it('dispute.closed com status lost de crédito (sem partner_id) não toca em reserva nem clawback', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({
        disputeRecord: { id: 'dispute-row-1', source_type: 'credit_purchases', source_id: 'credit-purchase-1', held_amount: 50, closed_at: null },
        financialTx: { amount: 20, status: 'pago' },
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.closed', { status: 'lost' }) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      const reserveUpdate = admin.updated['app_purchases']?.find(u => (u.payload as Record<string, unknown>).reserve_status !== undefined)
      expect(reserveUpdate).toBeUndefined()
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/stripe-webhook.test.ts -t "lost"`
Expected: FAIL — the webhook doesn't touch `reserve_status`/`partner_clawback_amount` yet.

- [ ] **Step 3: Implement**

In `app/api/stripe/webhook/route.ts`, find the `handleDisputeClosed` function's `dispute.status !== 'won'` branch (it currently ends right after the `financial_transactions` write-down block added in a prior plan, just before `return` — look for the comment `'Disputa perdida é chargeback definitivo'`). After that existing `if (tx && tx.status === 'pago') { ... } else if (!tx) { ... }` block, and still inside the `if ((record.source_type === 'credit_purchases' || record.source_type === 'app_purchases') && record.source_id)` block, add the reserve/clawback logic — but ONLY for `app_purchases` (credit_purchases has no reserve concept):

```typescript
    if ((record.source_type === 'credit_purchases' || record.source_type === 'app_purchases') && record.source_id) {
      const { data: tx, error: txSelectError } = await admin
        .from('financial_transactions')
        .select('amount, status')
        .eq('source_type', record.source_type)
        .eq('source_id', record.source_id)
        .maybeSingle()
      if (txSelectError) {
        throw new Error(`[stripe/webhook] failed to look up financial_transactions for lost dispute: ${txSelectError.message}`)
      }
      if (tx && tx.status === 'pago') {
        const { error: txUpdateError } = await admin
          .from('financial_transactions')
          .update({ refunded_amount: tx.amount, status: 'reembolsado', updated_at: new Date().toISOString() })
          .eq('source_type', record.source_type)
          .eq('source_id', record.source_id)
        if (txUpdateError) {
          throw new Error(`[stripe/webhook] failed to write down financial_transactions for lost dispute: ${txUpdateError.message}`)
        }
        console.info('[stripe/webhook] Lost dispute wrote down financial_transactions ledger:', record.source_type, record.source_id)
      } else if (!tx) {
        console.warn('[stripe/webhook] lost dispute confirmed but no matching financial_transactions row found:', record.source_type, record.source_id)
      }

      // Reserva de disputa (só app_purchases — spec: 2026-09-30-partner-
      // dispute-reserve-design.md). Reserva ainda não liberada é absorvida
      // automaticamente (parceiro nunca recebe essa fatia). O que já foi
      // pago ANTES da disputa chegar (fatia principal e/ou reserva, se já
      // tinha passado dos 120 dias) não tem como ser recuperado
      // automaticamente — sem API de débito bancário no sistema — só fica
      // sinalizado pro líder cobrar manualmente.
      if (record.source_type === 'app_purchases') {
        const { data: appPurchase, error: appPurchaseSelectError } = await admin
          .from('app_purchases')
          .select('reserve_status')
          .eq('id', record.source_id)
          .single()
        if (appPurchaseSelectError) {
          throw new Error(`[stripe/webhook] failed to look up app_purchases reserve for lost dispute: ${appPurchaseSelectError.message}`)
        }

        if (appPurchase?.reserve_status === 'held') {
          const { error: reserveUpdateError } = await admin
            .from('app_purchases')
            .update({ reserve_status: 'clawed_back' })
            .eq('id', record.source_id)
            .eq('reserve_status', 'held')
          if (reserveUpdateError) {
            throw new Error(`[stripe/webhook] failed to claw back reserve for lost dispute: ${reserveUpdateError.message}`)
          }
          console.info('[stripe/webhook] Lost dispute clawed back unreleased reserve:', record.source_id)
        }

        // Embed simples + filtro em JS — mesmo padrão já usado em
        // app/admin/marketplace/repasses/page.tsx pra achar itens cobertos
        // por repasse confirmado (nunca .eq() direto numa coluna da tabela
        // aninhada, isso não é filtro suportado pelo supabase-js aqui).
        const { data: paidItems, error: paidItemsError } = await admin
          .from('partner_payout_items')
          .select('amount, partner_payouts(status)')
          .eq('app_purchase_id', record.source_id)
        if (paidItemsError) {
          throw new Error(`[stripe/webhook] failed to sum paid partner_payout_items for lost dispute: ${paidItemsError.message}`)
        }

        const alreadyPaidTotal = (paidItems ?? []).reduce((sum: number, row: { amount: number; partner_payouts: { status: string } | { status: string }[] | null }) => {
          const po = Array.isArray(row.partner_payouts) ? row.partner_payouts[0] : row.partner_payouts
          return po?.status === 'confirmado' ? sum + Number(row.amount) : sum
        }, 0)
        if (alreadyPaidTotal > 0) {
          const { error: clawbackUpdateError } = await admin
            .from('payment_disputes')
            .update({ partner_clawback_amount: alreadyPaidTotal })
            .eq('id', record.id)
          if (clawbackUpdateError) {
            throw new Error(`[stripe/webhook] failed to record partner_clawback_amount: ${clawbackUpdateError.message}`)
          }
          console.warn('[stripe/webhook] Lost dispute requires manual partner clawback:', record.source_id, alreadyPaidTotal)
        }
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/stripe-webhook.test.ts`
Expected: PASS — all existing tests plus the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe/webhook/route.ts __tests__/stripe-webhook.test.ts
git commit -m "feat: disputa perdida aciona reserva e sinaliza cobrança ao parceiro"
```

---

### Task 4: Tela de repasses — fila de reserva

**Files:**
- Modify: `app/admin/marketplace/repasses/page.tsx`
- Modify: `app/admin/marketplace/repasses/RepassesClient.tsx`

**Interfaces:**
- Consumes: `app_purchases.reserve_amount`/`.reserve_status` from Task 1, `create_partner_payout`'s new `p_reserve_app_purchase_ids` param from Task 1.

- [ ] **Step 1: Fetch reserve data and compute reserve-eligible rows in `page.tsx`**

In `app/admin/marketplace/repasses/page.tsx`, change the `app_purchases` select (currently `.select('id, partner_id, application_name, plan_name, amount, partner_amount, refunded_amount, paid_at')`) to also pull the reserve columns:

```typescript
      .select('id, partner_id, application_name, plan_name, amount, partner_amount, refunded_amount, paid_at, reserve_amount, reserve_status')
```

After the existing `app_purchases` loop (the one computing `netPartnerAmount` for the main portion — ends with `if (status === 'retido') g.retidoTotal += netPartnerAmount; else { g.elegivelTotal += netPartnerAmount; g.eligiblePurchases.push(row) }`), add a second loop over the SAME `purchases` array for the reserve portion:

```typescript
  // Reserva de disputa: mesma fila do parceiro, mas com sua própria
  // janela de 120 dias e seu próprio kind — entra separada da fatia
  // principal porque pode virar elegível bem depois (spec: 2026-09-30-
  // partner-dispute-reserve-design.md).
  const RESERVE_WINDOW_MS = 120 * 86400_000
  for (const p of purchases ?? []) {
    if (!p.paid_at || p.reserve_status !== 'held' || !p.reserve_amount || p.reserve_amount <= 0) continue
    const reserveEligible = Date.now() - new Date(p.paid_at).getTime() >= RESERVE_WINDOW_MS
    if (!reserveEligible) continue // ainda dentro dos 120 dias — não aparece na fila nem como "retido" (reserva não tem indicador visual de retido nesta leva, só aparece quando fica elegível)

    const refundedShare = Math.round(Number(p.refunded_amount ?? 0) * p.reserve_amount / p.amount * 100) / 100
    const netReserveAmount = p.reserve_amount - refundedShare

    const g = getGroup(p.partner_id as string)
    const row: EligiblePurchaseRow = {
      // ':reserve' no id: a fatia principal da MESMA venda pode continuar
      // elegível/retida ao mesmo tempo (16 dias vs 120 dias são janelas
      // independentes) — sem o sufixo, as duas linhas compartilhariam
      // app_purchase.id, colidindo como chave React e fundindo a seleção
      // do checkbox (selecionar uma sempre selecionaria a outra também).
      // RepassesClient remove o sufixo antes de mandar pra RPC.
      id: `${p.id}:reserve`, kind: 'app_purchase_reserve',
      applicationName: p.application_name,
      planName: `${p.plan_name} (reserva)`,
      amount: p.amount,
      partnerAmount: netReserveAmount,
      paidAt: p.paid_at,
      status: 'elegivel',
    }
    g.elegivelTotal += netReserveAmount
    g.eligiblePurchases.push(row)
  }
```

(This reuses the existing `getGroup` helper and `partnerGroups` filter below — no changes needed there, a partner with only reserve-eligible rows and zero `retidoTotal` already passes the `g.retidoTotal > 0 || g.eligiblePurchases.length > 0` filter.)

- [ ] **Step 2: Add the new `kind` to the shared type in `RepassesClient.tsx`**

Change the `EligiblePurchaseRow['kind']` union (currently `'app_purchase' | 'subscription_invoice'`):

```typescript
  kind:            'app_purchase' | 'subscription_invoice' | 'app_purchase_reserve'
```

Update the doc comment above it to mention the third kind:

```typescript
  /** app_purchase = venda avulsa de app (fatia principal); subscription_invoice
   *  = ciclo de cobrança de assinatura (peça 5); app_purchase_reserve =
   *  reserva de disputa de 10% da mesma venda de app, liberada só depois
   *  de 120 dias — mesma fila, fontes/parâmetros diferentes na hora de
   *  chamar create_partner_payout. */
```

- [ ] **Step 3: Split the reserve ids into the RPC call in `handleRegisterPayout`**

Find:

```typescript
      const selectedRows = payingPartner.eligiblePurchases.filter(p => selected.has(p.id))
      const appPurchaseIds = selectedRows.filter(p => p.kind === 'app_purchase').map(p => p.id)
      const subscriptionInvoiceIds = selectedRows.filter(p => p.kind === 'subscription_invoice').map(p => p.id)
      const { error: err } = await supabase.rpc('create_partner_payout', {
        p_partner_id: payingPartner.partnerId,
        p_app_purchase_ids: appPurchaseIds,
        p_reference: reference.trim(),
        p_notes: notes.trim() || null,
        p_subscription_invoice_ids: subscriptionInvoiceIds,
      })
```

Replace with:

```typescript
      const selectedRows = payingPartner.eligiblePurchases.filter(p => selected.has(p.id))
      const appPurchaseIds = selectedRows.filter(p => p.kind === 'app_purchase').map(p => p.id)
      const subscriptionInvoiceIds = selectedRows.filter(p => p.kind === 'subscription_invoice').map(p => p.id)
      // Remove o sufixo ':reserve' (existe só pra desambiguar a chave da
      // fatia principal da mesma venda — ver comentário em page.tsx) antes
      // de mandar o uuid de verdade pra RPC.
      const reserveAppPurchaseIds = selectedRows.filter(p => p.kind === 'app_purchase_reserve').map(p => p.id.replace(/:reserve$/, ''))
      const { error: err } = await supabase.rpc('create_partner_payout', {
        p_partner_id: payingPartner.partnerId,
        p_app_purchase_ids: appPurchaseIds,
        p_reference: reference.trim(),
        p_notes: notes.trim() || null,
        p_subscription_invoice_ids: subscriptionInvoiceIds,
        p_reserve_app_purchase_ids: reserveAppPurchaseIds,
      })
```

- [ ] **Step 4: Label the reserve row visually in the selection modal**

In the modal's row list (find `{payingPartner.eligiblePurchases.map(p => (`), the row already renders `{p.applicationName} — {p.planName}` — since Task 1's `page.tsx` change already appends `" (reserva)"` to `planName` for reserve rows, no further template change is needed here. Leave this file's JSX for that row as-is.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — must be clean.

No existing test file covers `page.tsx` or `RepassesClient.tsx` (zero precedent, same as the sibling `financeiro`/`disputas` admin screens) — do not add a new test harness for this task, consistent with established scope discipline in this codebase's admin screens.

- [ ] **Step 6: Commit**

```bash
git add app/admin/marketplace/repasses/page.tsx app/admin/marketplace/repasses/RepassesClient.tsx
git commit -m "feat: fila de reserva de disputa na tela de repasses"
```

---

### Task 5: Tela de disputas — valor a cobrar do parceiro

**Files:**
- Modify: `app/admin/disputas/DisputasClient.tsx`

**Interfaces:**
- Consumes: `payment_disputes.partner_clawback_amount` from Task 1 (the page's existing `.select('*')` in `app/admin/disputas/page.tsx` already pulls it — no change needed there).

- [ ] **Step 1: Implement**

In `app/admin/disputas/DisputasClient.tsx`, add the field to the `DisputeRow` interface:

```typescript
export interface DisputeRow {
  id:                        string
  stripe_dispute_id:         string
  source_type:               string | null
  source_id:                 string | null
  amount:                    number
  currency:                  string
  reason:                    string | null
  status:                    string
  held_amount:               number | null
  partner_clawback_amount:   number | null
  opened_at:                 string
  closed_at:                 string | null
}
```

Add a new column header, after `<th className="px-4 py-3">Congelado</th>`:

```tsx
                  <th className="px-4 py-3">Cobrar do parceiro</th>
```

Add a new cell in the row, after the existing "Congelado" `<td>`:

```tsx
                      <td className="px-4 py-3">
                        {d.partner_clawback_amount && d.partner_clawback_amount > 0 ? (
                          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: '#DC2626', background: 'rgba(220,38,38,0.1)' }}>
                            {formatCurrencyBRL(d.partner_clawback_amount)}
                          </span>
                        ) : '—'}
                      </td>
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — must be clean.

No existing test file for this component (zero precedent, same as the sibling screens touched by prior tasks) — no new test harness added here.

- [ ] **Step 3: Commit**

```bash
git add app/admin/disputas/DisputasClient.tsx
git commit -m "feat: tela de disputas mostra valor a cobrar do parceiro"
```

---

## Self-Review Notes

**Spec coverage:** schema (Task 1) ✓, checkout snapshot (Task 2) ✓, webhook clawback + ledger integration with prior dispute feature (Task 3) ✓, `create_partner_payout` reserve branch (Task 1) ✓, repasses UI reserve queue (Task 4) ✓, disputas UI clawback surfacing (Task 5) ✓. `subscription_invoices` explicitly untouched throughout.

**Type consistency:** `EligiblePurchaseRow.kind` gains `'app_purchase_reserve'` in Task 4, used identically in `page.tsx`'s new loop and `RepassesClient.tsx`'s filter — same string literal in both places. `create_partner_payout`'s new `p_reserve_app_purchase_ids` parameter name matches between the SQL (Task 1) and the RPC call (Task 4). `app_purchases.reserve_status` values (`'held'|'released'|'clawed_back'`) match between the CHECK constraint (Task 1), the webhook's comparisons (Task 3), and `page.tsx`'s filter (Task 4).

**Placeholder scan:** none found — every step has runnable code or an exact shell command.
