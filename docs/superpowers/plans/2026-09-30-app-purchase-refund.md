# App Purchase Refund Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Técnico Líder a complete, Stripe-backed refund flow for `app_purchases` (partial or total), with a 15-day refund window and a payout retention bump (14→16 days) that guarantees the refund window and the payout-eligibility window never overlap.

**Architecture:** New Postgres migration adds refund-tracking columns to `app_purchases`, a `refund_app_purchase` RPC, and an updated `create_partner_payout` (retention 16 days, refund-aware eligibility sum). The existing Stripe webhook (`app/api/stripe/webhook/route.ts`) gains a third branch in `handleChargeRefunded` for `app_purchases`, following the exact idempotent pattern already used for `credit_purchases`. A new admin API route calls Stripe first, then the RPC, mirroring `app/api/admin/credit-purchases/[purchaseId]/refund/route.ts`. A new UI modal and a "Apps vendidos" section in `/admin/financeiro` give the líder the entry point, and the existing generic refund button is hidden for `type='app'` rows (it only touches the LOBBY's commission ledger, never Stripe, never access, never payout).

**Tech Stack:** Next.js App Router API routes, Supabase Postgres (plpgsql RPCs, RLS), Stripe Node SDK, Vitest for tests, React client components (no new UI test — no existing modal in this codebase has one).

**Spec:** `docs/superpowers/specs/2026-09-30-app-purchase-refund-design.md`

## Global Constraints

- Refund can only be requested within **15 days** of `app_purchases.paid_at`.
- Payout retention (`PAYOUT_RETENTION_DAYS`, `create_partner_payout`) is **16 days** — always one day after the refund window closes, so a purchase is never simultaneously refundable and payout-eligible (no clawback needed).
- `commission_amount` and `partner_amount` on `app_purchases` are immutable snapshots of the sale — never mutated by a refund. The CHECK `commission_amount + partner_amount = amount` must keep holding.
- The Stripe-reported `charge.amount_refunded` is always the source of truth for how much was refunded — never calculated or trusted from local state.
- Only a Técnico Líder (`profiles.role = 'technician' and profiles.is_leader = true`) can request a refund.
- The webhook handler must stay idempotent: check `refund_status` before acting, exactly like the existing `credit_purchases` branch.
- Only `app_purchases` is in scope. `subscription_invoices` refunds are explicitly out of scope for this plan.

---

### Task 1: Migration — refund columns, `refund_app_purchase` RPC, retention bump

**Files:**
- Create: `supabase/migrations/20260930110000_reembolso_app_purchase.sql`
- Modify: `lib/services/payouts.ts:6` (constant + doc comment)
- Test: `__tests__/payouts.test.ts` (new file)

**Interfaces:**
- Produces: RPC `refund_app_purchase(p_purchase_id uuid, p_amount numeric, p_reason text) returns app_purchases` — callable by `authenticated` only.
- Produces: `app_purchases` gains columns `refund_status text`, `refunded_amount numeric(12,2)`, `refund_reason text`, `refunded_at timestamptz`, `refunded_by uuid`.
- Produces: `create_partner_payout` (same 5-param signature as today) now uses `interval '16 days'` and a refund-aware sum for the `app_purchases` branch.
- Produces (JS mirror): `PAYOUT_RETENTION_DAYS = 16` in `lib/services/payouts.ts`.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260930110000_reembolso_app_purchase.sql

-- Reembolso de compra de app via Stripe, automatizado + retenção de
-- repasse sobe de 14 pra 16 dias (decisão do usuário 2026-09-30): janela
-- de reembolso é de 15 dias, repasse só fica elegível a partir do dia 16
-- — por construção as duas janelas nunca se sobrepõem, elimina qualquer
-- necessidade de "clawback" de parceiro que já recebeu (esse caso nunca
-- acontece). Spec completo em
-- docs/superpowers/specs/2026-09-30-app-purchase-refund-design.md.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) app_purchases ganha rastreio de reembolso — mesmo padrão já usado em
--    credit_purchases (20260927170000_reembolso_parcial.sql).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.app_purchases
  add column if not exists refund_status   text,
  add column if not exists refunded_amount numeric(12,2) not null default 0,
  add column if not exists refund_reason   text,
  add column if not exists refunded_at     timestamptz,
  add column if not exists refunded_by     uuid references auth.users(id);

alter table public.app_purchases
  add constraint app_purchases_refund_status_check
  check (refund_status is null or refund_status = any (array['processing', 'refunded']));

alter table public.app_purchases
  add constraint app_purchases_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= amount);

comment on column public.app_purchases.refund_status is
  'null = nunca reembolsada. processing = pedido em voo, aguardando confirmação do webhook Stripe (trava novo pedido concorrente). refunded = totalmente reembolsada (terminal). Depois de uma confirmação PARCIAL, volta a null — permite outro reembolso parcial depois.';
comment on column public.app_purchases.refunded_amount is
  'Soma cumulativa já reembolsada, confirmada pelo Stripe via charge.amount_refunded — nunca calculada localmente. Nunca excede amount.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) refund_app_purchase — pedido de reembolso (parcial ou total). Só
--    líder, só dentro da janela de 15 dias após o pagamento. Estado
--    otimista ('processing') até o webhook confirmar com o valor real do
--    Stripe — mesmo padrão de refund_credit_purchase.
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
  if purchase.paid_at is null or purchase.paid_at <= now() - interval '15 days' then
    raise exception 'Fora do prazo de reembolso — só é possível solicitar até 15 dias após o pagamento.';
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

revoke execute on function public.refund_app_purchase(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.refund_app_purchase(uuid, numeric, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) create_partner_payout — retenção 14→16 dias (app + assinatura) e
--    elegibilidade de app_purchases agora desconta a fatia de reembolso já
--    confirmada, proporcional ao partner_amount original. Mesma assinatura
--    de parâmetros de 20260927240000_repasse_assinatura.sql — CREATE OR
--    REPLACE direto, sem precisar dropar (lista de parâmetros não muda).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.create_partner_payout(
  "p_partner_id"                uuid,
  "p_app_purchase_ids"          uuid[],
  "p_reference"                 text,
  "p_notes"                     text default null,
  "p_subscription_invoice_ids"  uuid[] default null
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
  v_app_total         numeric(12,2) := 0;
  v_sub_total         numeric(12,2) := 0;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode registrar repasse.';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'Informe a referência/comprovante do repasse.';
  end if;
  if v_app_requested = 0 and v_sub_requested = 0 then
    raise exception 'Selecione ao menos uma venda ou fatura de assinatura pra repassar.';
  end if;

  if v_app_requested > 0 then
    perform 1 from public.app_purchases where id = any(p_app_purchase_ids) for update;

    select count(*), coalesce(sum(
        ap.partner_amount - round(ap.refunded_amount * ap.partner_amount / ap.amount)
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
        where pi.app_purchase_id = ap.id and po.status = 'confirmado'
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

  v_total := v_app_total + v_sub_total;

  insert into public.partner_payouts (partner_id, total_amount, reference, notes, requested_by)
  values (p_partner_id, v_total, trim(p_reference), nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning * into v_payout;

  if v_app_requested > 0 then
    insert into public.partner_payout_items (payout_id, app_purchase_id, amount)
    select v_payout.id, ap.id, ap.partner_amount - round(ap.refunded_amount * ap.partner_amount / ap.amount)
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids);
  end if;

  if v_sub_requested > 0 then
    insert into public.partner_payout_items (payout_id, subscription_invoice_id, amount)
    select v_payout.id, si.id, si.partner_amount
    from public.subscription_invoices si
    where si.id = any(p_subscription_invoice_ids);
  end if;

  return v_payout;
end;
$$;
```

- [ ] **Step 2: Update `lib/services/payouts.ts` — retention constant + doc comment**

Modify `lib/services/payouts.ts:1-7`:

```typescript
/**
 * Repasse manual ao parceiro. A regra de verdade (16 dias de retenção,
 * elegibilidade, soma) vive na RPC create_partner_payout — este arquivo só
 * espelha a constante pra exibição/filtro no client.
 *
 * 16 dias, não 14: a janela de reembolso de app_purchases é de 15 dias
 * (refund_app_purchase) — a retenção de repasse fica sempre 1 dia depois
 * pra garantir que as duas janelas nunca se sobrepõem (sem isso, existiria
 * um caso de "já repassado mas ainda reembolsável" que exigiria clawback).
 */
export const PAYOUT_RETENTION_DAYS = 16
```

Leave the rest of the file (`PartnerPayoutStatus`, `PartnerPayout`, `PartnerPayoutItem`, `classifyPurchasePayoutStatus`) unchanged — they already reference the constant, not the literal `14`.

- [ ] **Step 3: Write the failing test for the retention boundary**

Create `__tests__/payouts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { PAYOUT_RETENTION_DAYS, classifyPurchasePayoutStatus } from '@/lib/services/payouts'

describe('PAYOUT_RETENTION_DAYS', () => {
  it('é 16 dias — um dia depois do fim da janela de reembolso de 15 dias', () => {
    expect(PAYOUT_RETENTION_DAYS).toBe(16)
  })
})

describe('classifyPurchasePayoutStatus', () => {
  it('classifica como retido dentro dos 16 dias', () => {
    const paidAt = new Date(Date.now() - 10 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false)).toBe('retido')
  })

  it('classifica como elegível a partir do dia 16', () => {
    const paidAt = new Date(Date.now() - 17 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false)).toBe('elegivel')
  })

  it('classifica como pago quando já coberto por repasse confirmado, mesmo dentro da retenção', () => {
    const paidAt = new Date(Date.now() - 1 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, true)).toBe('pago')
  })
})
```

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `npx vitest run __tests__/payouts.test.ts`
Expected before Step 2: FAIL (`PAYOUT_RETENTION_DAYS` is `14`, not `16`).
After Step 2: PASS.

- [ ] **Step 5: Apply the migration to the linked Supabase project**

Run: `supabase db push --linked`

This is a schema change to the live database — confirm the diff it prints before accepting. It adds columns/constraints (additive, safe) and replaces two functions (`refund_app_purchase` new, `create_partner_payout` same signature — existing grants on `create_partner_payout` survive a `CREATE OR REPLACE`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260930110000_reembolso_app_purchase.sql lib/services/payouts.ts __tests__/payouts.test.ts
git commit -m "feat: reembolso de app_purchases via Stripe — schema, RPC e retenção 16d"
```

---

### Task 2: Webhook — `charge.refunded` handles `app_purchases`

**Files:**
- Modify: `app/api/stripe/webhook/route.ts:426-475` (`handleChargeRefunded`)
- Test: `__tests__/stripe-webhook.test.ts` (extend existing file)

**Interfaces:**
- Consumes: RPC/columns from Task 1 (`app_purchases.refund_status`, `.refunded_amount`, `.commission_amount`, `.amount`).
- Consumes: `financial_transactions` generic `refunded_amount`/`status` columns (already exist, from `20260927170000_reembolso_parcial.sql`).
- Produces: nothing new consumed by later tasks — this is a leaf handler.

- [ ] **Step 1: Write the failing tests**

Add this describe block to `__tests__/stripe-webhook.test.ts`, right after the `'disputa Stripe (congelamento automático)'` block (before the closing `})` of the outer `describe('POST /api/stripe/webhook', ...)` at line 897):

```typescript
  // ── charge.refunded de compra de app (reembolso automatizado) ─────────────

  describe('charge.refunded de compra de app', () => {

    const makeRefundEvent = (amountRefundedCents: number, overrides: Record<string, unknown> = {}) => ({
      type: 'charge.refunded',
      id:   'evt_refund_test',
      data: {
        object: {
          id:              'ch_test_123',
          object:          'charge',
          amount_refunded: amountRefundedCents,
          payment_intent:  'pi_app_refund_test',
          ...overrides,
        },
      },
    })

    const makeAppPurchaseRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'app-purchase-refund-1', amount: 100, commission_amount: 20,
      refunded_amount: 0, refund_status: null, ...overrides,
    })

    // Mock flexível: campaign_purchases/credit_purchases sempre vazios
    // (não é o caso testado aqui), app_purchases responde com a linha
    // configurada, financial_transactions responde com o lançamento de
    // comissão correspondente.
    const makeRefundAdmin = (opts: {
      appPurchase?: Record<string, unknown> | null
      financialTx?: Record<string, unknown> | null
    } = {}) => {
      const updated: Record<string, unknown[]> = {}
      return {
        updated,
        from: vi.fn((table: string) => {
          const chain: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
          chain.select = () => chain
          chain.eq     = () => chain
          chain.update = (payload: unknown) => { updated[table] = updated[table] ?? []; updated[table].push(payload); return chain }
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: table === 'app_purchases'      ? (opts.appPurchase !== undefined ? opts.appPurchase : makeAppPurchaseRow())
                : table === 'financial_transactions' ? (opts.financialTx !== undefined ? opts.financialTx : { amount: 20 })
                : null,
            error: null,
          })
          return chain
        }),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }

    it('reembolso parcial: atualiza refunded_amount, mantém status paid e desconta comissão proporcional', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeRefundAdmin()
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeRefundEvent(3000) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      const appUpdate = admin.updated['app_purchases']?.[0] as Record<string, unknown>
      expect(appUpdate.refunded_amount).toBe(30)
      expect(appUpdate.refund_status).toBeNull()
      expect(appUpdate.status).toBeUndefined() // não mexe em status quando parcial

      const txUpdate = admin.updated['financial_transactions']?.[0] as Record<string, unknown>
      expect(txUpdate.refunded_amount).toBe(6) // 30 * (20/100)
      expect(txUpdate.status).toBe('pago') // não cobre o total da linha (20) ainda
    })

    it('reembolso total: marca status refunded (revoga acesso) e refund_status refunded', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeRefundAdmin()
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeRefundEvent(10000) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      const appUpdate = admin.updated['app_purchases']?.[0] as Record<string, unknown>
      expect(appUpdate.refunded_amount).toBe(100)
      expect(appUpdate.refund_status).toBe('refunded')
      expect(appUpdate.status).toBe('refunded')

      const txUpdate = admin.updated['financial_transactions']?.[0] as Record<string, unknown>
      expect(txUpdate.refunded_amount).toBe(20)
      expect(txUpdate.status).toBe('reembolsado')
    })

    it('redelivery de reembolso já total não processa de novo', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeRefundAdmin({ appPurchase: makeAppPurchaseRow({ refund_status: 'refunded', refunded_amount: 100 }) })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeRefundEvent(10000) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      expect(admin.updated['app_purchases']).toBeUndefined()
    })

    it('sem app_purchases correspondente (é crédito/campanha) não faz nada nesse branch', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeRefundAdmin({ appPurchase: null })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeRefundEvent(10000) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      expect(admin.updated['app_purchases']).toBeUndefined()
    })

  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/stripe-webhook.test.ts -t "charge.refunded de compra de app"`
Expected: FAIL — `handleChargeRefunded` doesn't look at `app_purchases` yet, so `admin.updated['app_purchases']` stays `undefined` in all cases (including the ones that expect it populated).

- [ ] **Step 3: Implement — extend `handleChargeRefunded`**

In `app/api/stripe/webhook/route.ts`, the `handleChargeRefunded` function currently ends like this (lines ~447-475):

```typescript
  const { data: creditPurchase } = await admin
    .from('credit_purchases')
    .select('id, amount_paid, refund_status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (creditPurchase) {
    if (creditPurchase.refund_status === 'refunded') return // redelivery do reembolso total — já processado

    // charge.amount_refunded é o TOTAL cumulativo já reembolsado dessa
    // cobrança segundo o próprio Stripe (nunca o valor calculado
    // localmente — seção 20). Só vira estado terminal 'refunded' quando
    // cobre o valor pago; parcial confirmado volta refund_status pra null
    // (destrava novos pedidos de reembolso parcial pra essa mesma compra).
    const amountRefundedTotal = charge.amount_refunded / 100
    const fullyRefunded = amountRefundedTotal >= Number(creditPurchase.amount_paid)

    await admin
      .from('credit_purchases')
      .update({
        refunded_amount: amountRefundedTotal,
        refund_status: fullyRefunded ? 'refunded' : null,
        refunded_at: fullyRefunded ? new Date().toISOString() : null,
        ...(fullyRefunded ? { status: 'refunded' } : {}),
      })
      .eq('id', creditPurchase.id)

    console.info('[stripe/webhook] Credit purchase refund confirmed:', creditPurchase.id, fullyRefunded ? 'total' : 'parcial')
  }
}
```

Replace it with (adds an early `return` after the credit-purchase branch, then a new `app_purchases` branch before the function's closing brace):

```typescript
  const { data: creditPurchase } = await admin
    .from('credit_purchases')
    .select('id, amount_paid, refund_status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (creditPurchase) {
    if (creditPurchase.refund_status === 'refunded') return // redelivery do reembolso total — já processado

    // charge.amount_refunded é o TOTAL cumulativo já reembolsado dessa
    // cobrança segundo o próprio Stripe (nunca o valor calculado
    // localmente — seção 20). Só vira estado terminal 'refunded' quando
    // cobre o valor pago; parcial confirmado volta refund_status pra null
    // (destrava novos pedidos de reembolso parcial pra essa mesma compra).
    const amountRefundedTotal = charge.amount_refunded / 100
    const fullyRefunded = amountRefundedTotal >= Number(creditPurchase.amount_paid)

    await admin
      .from('credit_purchases')
      .update({
        refunded_amount: amountRefundedTotal,
        refund_status: fullyRefunded ? 'refunded' : null,
        refunded_at: fullyRefunded ? new Date().toISOString() : null,
        ...(fullyRefunded ? { status: 'refunded' } : {}),
      })
      .eq('id', creditPurchase.id)

    console.info('[stripe/webhook] Credit purchase refund confirmed:', creditPurchase.id, fullyRefunded ? 'total' : 'parcial')
    return
  }

  // Reembolso de compra de app — mesmo padrão idempotente de
  // credit_purchases acima. Janela de 15 dias (refund_app_purchase) e
  // retenção de repasse de 16 dias garantem que isso nunca acontece
  // depois de um repasse já confirmado (spec: 2026-09-30-app-purchase-
  // refund-design.md) — sem necessidade de clawback.
  const { data: appPurchase } = await admin
    .from('app_purchases')
    .select('id, amount, commission_amount, refunded_amount, refund_status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (appPurchase) {
    if (appPurchase.refund_status === 'refunded') return // redelivery — já processado

    const amountRefundedTotal = charge.amount_refunded / 100
    const fullyRefunded = amountRefundedTotal >= Number(appPurchase.amount)

    await admin
      .from('app_purchases')
      .update({
        refunded_amount: amountRefundedTotal,
        refund_status: fullyRefunded ? 'refunded' : null,
        refunded_at: fullyRefunded ? new Date().toISOString() : null,
        ...(fullyRefunded ? { status: 'refunded' } : {}),
      })
      .eq('id', appPurchase.id)

    // financial_transactions guarda só a fatia de comissão da LOBBY (nunca
    // o valor bruto — mesmo princípio de app_purchases/checkout). O
    // reembolso é descontado na mesma proporção do valor bruto devolvido
    // ao cliente, reaproveitando a coluna genérica refunded_amount já
    // criada em 20260927170000_reembolso_parcial.sql.
    const commissionRefunded = Math.round(
      amountRefundedTotal * (Number(appPurchase.commission_amount) / Number(appPurchase.amount)) * 100
    ) / 100

    const { data: tx } = await admin
      .from('financial_transactions')
      .select('amount')
      .eq('source_type', 'app_purchases')
      .eq('source_id', appPurchase.id)
      .maybeSingle()

    if (tx) {
      await admin
        .from('financial_transactions')
        .update({
          refunded_amount: commissionRefunded,
          status: commissionRefunded >= Number(tx.amount) ? 'reembolsado' : 'pago',
          updated_at: new Date().toISOString(),
        })
        .eq('source_type', 'app_purchases')
        .eq('source_id', appPurchase.id)
    }

    console.info('[stripe/webhook] App purchase refund confirmed:', appPurchase.id, fullyRefunded ? 'total' : 'parcial')
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/stripe-webhook.test.ts`
Expected: PASS — all existing tests in the file still pass (nothing else in `handleChargeRefunded` changed behavior) plus the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe/webhook/route.ts __tests__/stripe-webhook.test.ts
git commit -m "feat: webhook confirma reembolso de app_purchases (parcial/total)"
```

---

### Task 3: Admin API route — `POST /api/admin/app-purchases/[purchaseId]/refund`

**Files:**
- Create: `app/api/admin/app-purchases/[purchaseId]/refund/route.ts`
- Test: `__tests__/app-purchase-refund-route.test.ts` (new file)

**Interfaces:**
- Consumes: RPC `refund_app_purchase` from Task 1 (exact params: `p_purchase_id`, `p_amount`, `p_reason`).
- Produces: `POST` handler returning `{ ok: true, purchase: <app_purchases row> }` on success, `{ error: string }` with appropriate status otherwise. Consumed by the UI modal in Task 4 via `fetch('/api/admin/app-purchases/{id}/refund', { method: 'POST', body: { amount, reason } })`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/app-purchase-refund-route.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))
vi.mock('@/lib/stripe', () => ({
  stripe: { refunds: { create: vi.fn() } },
}))

afterEach(() => {
  vi.clearAllMocks()
})

type Row = Record<string, unknown>

function makeSupabase({ profile = { role: 'technician', is_leader: true }, rpcResult }: {
  profile?: Row | null
  rpcResult?: { data?: unknown; error?: { message: string } | null }
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'leader-1' } } }) },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: profile, error: null }) }) }),
    })),
    rpc: vi.fn().mockResolvedValue(rpcResult ?? { data: { id: 'app-purchase-1', refund_status: 'processing' }, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

function makeAdmin(purchase: Row | null) {
  return {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: purchase, error: null }) }) }),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const makeReq = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })

const basePurchase = (overrides: Row = {}): Row => ({
  id: 'app-purchase-1', status: 'paid', amount: 100, refunded_amount: 0,
  refund_status: null, paid_at: new Date().toISOString(),
  stripe_payment_intent_id: 'pi_test', ...overrides,
})

describe('POST /api/admin/app-purchases/[purchaseId]/refund', () => {
  it('400 sem motivo', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase())
    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50 }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })
    expect(res.status).toBe(400)
  })

  it('403 quando não é líder', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase({ profile: { role: 'technician', is_leader: false } }))
    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'motivo' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })
    expect(res.status).toBe(403)
  })

  it('400 quando fora da janela de 15 dias', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase())
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(basePurchase({ paid_at: new Date(Date.now() - 16 * 86400_000).toISOString() })))
    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'motivo' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/prazo/)
  })

  it('chama stripe.refunds.create e depois a RPC refund_app_purchase', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const { stripe } = await import('@/lib/stripe')
    const supabase = makeSupabase()
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase)
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(basePurchase()))
    vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_test' } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'Cliente desistiu' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })

    expect(res.status).toBe(200)
    expect(vi.mocked(stripe.refunds.create)).toHaveBeenCalledWith({ payment_intent: 'pi_test', amount: 5000 })
    expect(supabase.rpc).toHaveBeenCalledWith('refund_app_purchase', { p_purchase_id: 'app-purchase-1', p_amount: 50, p_reason: 'Cliente desistiu' })
  })

  it('não chama a RPC se o Stripe recusar o reembolso', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const { stripe } = await import('@/lib/stripe')
    const supabase = makeSupabase()
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase)
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(basePurchase()))
    vi.mocked(stripe.refunds.create).mockRejectedValue(new Error('card_declined'))

    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'motivo' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })

    expect(res.status).toBe(502)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('400 quando valor excede saldo reembolsável', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase())
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(basePurchase({ refunded_amount: 80 })))
    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'motivo' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/app-purchase-refund-route.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/admin/app-purchases/[purchaseId]/refund/route'`.

- [ ] **Step 3: Implement the route**

Create `app/api/admin/app-purchases/[purchaseId]/refund/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'

const REFUND_WINDOW_DAYS = 15

/**
 * Reembolso parcial ou total de compra de app via Stripe — só técnico
 * líder. Mesma ordem de app/api/admin/credit-purchases/[purchaseId]/refund/
 * route.ts: chama o Stripe PRIMEIRO, só grava estado local depois do
 * provedor aceitar o pedido. A janela de 15 dias é checada aqui também
 * (feedback mais rápido, sem round-trip ao Stripe) e de novo dentro da
 * RPC refund_app_purchase (fonte de verdade).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
) {
  const { purchaseId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Reembolso só pode ser solicitado por um técnico líder.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { amount, reason } = body as { amount?: number; reason?: string }

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo do reembolso.' }, { status: 400 })
  }
  if (typeof amount !== 'number' || !(amount > 0)) {
    return NextResponse.json({ error: 'Informe um valor de reembolso válido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: purchase } = await admin
    .from('app_purchases')
    .select('id, status, amount, refunded_amount, refund_status, paid_at, stripe_payment_intent_id')
    .eq('id', purchaseId)
    .single()

  if (!purchase) return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 })
  if (purchase.status !== 'paid') {
    return NextResponse.json({ error: 'Só é possível reembolsar uma compra paga.' }, { status: 400 })
  }
  if (!purchase.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'Esta compra não foi processada via Stripe — reembolso precisa de procedimento manual próprio.' }, { status: 400 })
  }
  if (purchase.refund_status === 'processing') {
    return NextResponse.json({ error: 'Já existe um reembolso em andamento para esta compra.' }, { status: 409 })
  }
  if (!purchase.paid_at || new Date(purchase.paid_at).getTime() <= Date.now() - REFUND_WINDOW_DAYS * 86400_000) {
    return NextResponse.json({ error: 'Fora do prazo de reembolso — só é possível solicitar até 15 dias após o pagamento.' }, { status: 400 })
  }
  const remaining = Number(purchase.amount) - Number(purchase.refunded_amount)
  if (amount > remaining) {
    return NextResponse.json({ error: `Valor maior que o saldo ainda reembolsável (R$ ${remaining.toFixed(2)}).` }, { status: 400 })
  }

  try {
    await stripe.refunds.create({
      payment_intent: purchase.stripe_payment_intent_id,
      amount: Math.round(amount * 100),
    })
  } catch (err) {
    console.error('[app-purchases/refund] stripe error', err)
    return NextResponse.json({ error: 'Falha ao solicitar o reembolso no provedor de pagamento.' }, { status: 502 })
  }

  const { data: result, error: rpcError } = await supabase.rpc('refund_app_purchase', {
    p_purchase_id: purchaseId,
    p_amount: amount,
    p_reason: reason.trim(),
  })

  if (rpcError) {
    // Stripe já aceitou o reembolso mas o registro local falhou — o webhook
    // charge.refunded ainda vai chegar depois e corrigir o estado local.
    console.error('[app-purchases/refund] rpc error after stripe accepted refund', rpcError)
    return NextResponse.json({
      error: `Reembolso aceito no Stripe, mas não foi possível atualizar o registro local: ${rpcError.message}. Confira manualmente.`,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, purchase: result })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/app-purchase-refund-route.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/app-purchases/[purchaseId]/refund/route.ts" __tests__/app-purchase-refund-route.test.ts
git commit -m "feat: rota admin de reembolso de app_purchases (Stripe + RPC)"
```

---

### Task 4: UI — `RefundAppPurchaseModal` + hide generic refund for `type='app'`

**Files:**
- Create: `components/admin/finance/RefundAppPurchaseModal.tsx`
- Modify: `components/admin/finance/FinanceTransactionTable.tsx:88-93`

**Interfaces:**
- Produces: `export interface PaidAppPurchase { id: string; application_name: string; plan_name: string; amount: number; refunded_amount: number; refund_status: 'processing' | 'refunded' | null; paid_at: string; buyer_name?: string | null; buyer_email?: string | null }` — consumed by Task 5's `page.tsx` and `FinanceiroClient.tsx`.
- Produces: `export default function RefundAppPurchaseModal({ purchase, onClose, onRefunded }: { purchase: PaidAppPurchase | null; onClose: () => void; onRefunded: (purchase: PaidAppPurchase) => void })`.
- Consumes: `POST /api/admin/app-purchases/{id}/refund` from Task 3 (body `{ amount, reason }`, response `{ ok: true, purchase }` or `{ error }`).

- [ ] **Step 1: Create the modal component**

Create `components/admin/finance/RefundAppPurchaseModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { X, Loader2, Undo2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatCurrencyBRL } from '@/lib/finance'

export interface PaidAppPurchase {
  id:               string
  application_name: string
  plan_name:        string
  amount:           number
  refunded_amount:  number
  refund_status:    'processing' | 'refunded' | null
  paid_at:          string
  buyer_name?:      string | null
  buyer_email?:     string | null
}

interface Props {
  purchase:   PaidAppPurchase | null
  onClose:    () => void
  onRefunded: (purchase: PaidAppPurchase) => void
}

const REFUND_WINDOW_DAYS = 15

/**
 * Reembolso de compra de app — parcial ou total, via Stripe. Chama a rota
 * admin (que chama o Stripe primeiro, depois a RPC refund_app_purchase).
 * O estado final (refunded_amount/status) só fica definitivo quando o
 * webhook charge.refunded confirmar — esta tela reflete o estado
 * 'processing' otimista devolvido pela rota.
 */
export default function RefundAppPurchaseModal({ purchase, onClose, onRefunded }: Props) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  if (!purchase) return null

  const remaining = purchase.amount - purchase.refunded_amount
  const daysSincePaid = (Date.now() - new Date(purchase.paid_at).getTime()) / 86400_000
  const withinWindow = daysSincePaid <= REFUND_WINDOW_DAYS

  const reset = () => { setAmount(''); setReason(''); setError('') }
  const handleClose = () => { if (saving) return; reset(); onClose() }

  const handleSubmit = async () => {
    const amountNum = Number(amount.replace(',', '.'))
    if (!amount || isNaN(amountNum) || amountNum <= 0) { setError('Informe um valor válido, maior que zero.'); return }
    if (amountNum > remaining) { setError(`Valor maior que o saldo ainda reembolsável (${formatCurrencyBRL(remaining)}).`); return }
    if (!reason.trim()) { setError('Informe o motivo do reembolso.'); return }

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/app-purchases/${purchase.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Não foi possível processar o reembolso.')
      onRefunded(data.purchase as PaidAppPurchase)
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível processar o reembolso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!purchase} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-md rounded-2xl border border-white/[0.09] bg-[#0D1428] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.50)]">
        <div className="mb-4 flex items-center justify-between">
          <DialogTitle className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Reembolsar compra de app
          </DialogTitle>
          <button type="button" onClick={handleClose} disabled={saving} className="text-white/40 hover:text-white transition-colors" aria-label="Fechar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 space-y-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-white/60">
          <p className="truncate text-sm font-semibold text-white">{purchase.application_name} — {purchase.plan_name}</p>
          <p>{purchase.buyer_name || purchase.buyer_email || 'Comprador desconhecido'}</p>
          <p>Pago: <span className="font-semibold text-white">{formatCurrencyBRL(purchase.amount)}</span></p>
          {purchase.refunded_amount > 0 && (
            <p>Já reembolsado: <span className="font-semibold text-[#FBBF24]">{formatCurrencyBRL(purchase.refunded_amount)}</span></p>
          )}
          <p>Ainda reembolsável: <span className="font-semibold text-white">{formatCurrencyBRL(remaining)}</span></p>
          {!withinWindow && (
            <p className="text-red-400">Fora do prazo de reembolso — passaram mais de {REFUND_WINDOW_DAYS} dias desde o pagamento.</p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="app-refund-amount">
              Valor a reembolsar (R$) <span className="text-[#FBBF24]">*</span>
            </label>
            <input id="app-refund-amount" type="text" inputMode="decimal" placeholder="0,00" value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9,.]/g, ''))} disabled={saving || !withinWindow}
              className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="app-refund-reason">
              Motivo <span className="text-[#FBBF24]">*</span>
            </label>
            <textarea id="app-refund-reason" rows={3} placeholder="Ex: Cliente desistiu da compra."
              value={reason} onChange={e => setReason(e.target.value)} disabled={saving || !withinWindow}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
          </div>

          {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose} disabled={saving}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-sm font-semibold text-white/60 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
              Cancelar
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving || !withinWindow}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/12 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Undo2 size={14} aria-hidden="true" />}
              {saving ? 'Processando...' : 'Confirmar reembolso'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Hide the generic refund button for `type='app'` rows**

Modify `components/admin/finance/FinanceTransactionTable.tsx:88-93` — change:

```typescript
              {t.status === 'pago' && t.refunded_amount < t.amount && (
                <button type="button" onClick={() => onRefund(t)} aria-label="Reembolsar"
                  className="rounded-lg bg-red-500/10 p-2 text-red-400 transition-all hover:bg-red-500/20">
                  <Undo2 size={14} aria-hidden="true" />
                </button>
              )}
```

to:

```typescript
              {/* type='app' tem fluxo de reembolso dedicado (Stripe real +
                  acesso + repasse) na seção "Apps vendidos" — o botão
                  genérico aqui só mexeria no lançamento de comissão,
                  nunca no Stripe nem no acesso do comprador. */}
              {t.status === 'pago' && t.refunded_amount < t.amount && t.type !== 'app' && (
                <button type="button" onClick={() => onRefund(t)} aria-label="Reembolsar"
                  className="rounded-lg bg-red-500/10 p-2 text-red-400 transition-all hover:bg-red-500/20">
                  <Undo2 size={14} aria-hidden="true" />
                </button>
              )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by these two files.

- [ ] **Step 4: Commit**

```bash
git add components/admin/finance/RefundAppPurchaseModal.tsx components/admin/finance/FinanceTransactionTable.tsx
git commit -m "feat: modal de reembolso de app_purchases, esconde botão genérico incompleto"
```

---

### Task 5: Wire into `/admin/financeiro` — fetch, section, state

**Files:**
- Modify: `app/admin/financeiro/page.tsx`
- Modify: `app/admin/financeiro/FinanceiroClient.tsx`

**Interfaces:**
- Consumes: `PaidAppPurchase` type and `RefundAppPurchaseModal` component from Task 4.

- [ ] **Step 1: Fetch paid app purchases in `page.tsx`**

Modify `app/admin/financeiro/page.tsx` — add the import and the query, then pass the new prop.

Add to the imports at the top:

```typescript
import type { PaidAppPurchase } from '@/components/admin/finance/RefundAppPurchaseModal'
```

Add after the existing `paidEbookPurchases` block (after line 66, before the `return`):

```typescript
  // Apps vendidos (status='paid') — mostrados pra permitir reembolso via
  // Stripe. Inclui apps da própria LOBBY e de parceiro (partner_id nulo
  // ou não) — o reembolso funciona pros dois casos.
  const { data: paidApps } = await supabase
    .from('app_purchases')
    .select('id, application_name, plan_name, amount, refunded_amount, refund_status, paid_at, profiles!app_purchases_buyer_user_id_fkey(full_name, email)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(200)

  const paidAppPurchases: PaidAppPurchase[] = (paidApps ?? []).map((p) => {
    const row = p as unknown as {
      id: string; application_name: string; plan_name: string; amount: number
      refunded_amount: number; refund_status: 'processing' | 'refunded' | null; paid_at: string
      profiles: { full_name: string | null; email: string | null } | null
    }
    return {
      id: row.id, application_name: row.application_name, plan_name: row.plan_name,
      amount: row.amount, refunded_amount: row.refunded_amount, refund_status: row.refund_status,
      paid_at: row.paid_at,
      buyer_name:  row.profiles?.full_name ?? null,
      buyer_email: row.profiles?.email ?? null,
    }
  })
```

Update the returned JSX to pass the new prop:

```typescript
  return (
    <FinanceiroClient
      user={user}
      profile={profile}
      initialTransactions={(transactions ?? []) as FinancialTransaction[]}
      initialPendingPurchases={pendingPurchases}
      initialPaidEbookPurchases={paidEbookPurchases}
      initialPaidAppPurchases={paidAppPurchases}
    />
  )
```

**Note on the FK hint:** `app_purchases.buyer_user_id` references `public.profiles(id)` — confirm the actual foreign key constraint name before running this. If the embedded-select FK hint name differs from `app_purchases_buyer_user_id_fkey` in the live schema, Supabase returns a clear `PGRST` error naming the actual constraint; adjust the hint string to match (or drop the hint and use `profiles(full_name, email)` plain if there's only one FK from `app_purchases` to `profiles` — there are two, `buyer_user_id` and `partner_id`, so the hint is required to disambiguate).

- [ ] **Step 2: Wire state and the "Apps vendidos" section in `FinanceiroClient.tsx`**

Add imports near the other modal imports (after line 39):

```typescript
import RefundAppPurchaseModal, { type PaidAppPurchase } from '@/components/admin/finance/RefundAppPurchaseModal'
```

Add to the `Props` interface (after `initialPaidEbookPurchases`):

```typescript
  initialPaidAppPurchases: PaidAppPurchase[]        // Apps já pagos — ação de reembolso
```

Update the function signature to destructure the new prop:

```typescript
export default function FinanceiroClient({ user, profile, initialTransactions, initialPendingPurchases, initialPaidEbookPurchases, initialPaidAppPurchases }: Props) {
```

Add state near `refundingEbook` (after line 73):

```typescript
  // Apps já pagos — lista pra ação de reembolso
  const [paidAppPurchases, setPaidAppPurchases] = useState<PaidAppPurchase[]>(initialPaidAppPurchases)
  // App selecionado para reembolsar via modal (null = fechado)
  const [refundingApp, setRefundingApp] = useState<PaidAppPurchase | null>(null)
```

Add the handler near `handleEbookRefunded` (after line 222):

```typescript
  /* Chamado pelo modal de reembolso de app depois que a rota confirmou o
     Stripe + a RPC — reflete refunded_amount/refund_status atualizados
     (estado 'processing' até o webhook confirmar de vez). */
  const handleAppRefunded = (updated: PaidAppPurchase) => {
    setPaidAppPurchases(prev => prev.map(p => p.id === updated.id ? updated : p))
    toast.success('Reembolso solicitado — aguardando confirmação do Stripe.')
  }
```

Add the section right after the "E-BOOKS VENDIDOS" section closes (after line 331, before the metric cards grid on line 333):

```tsx
        {/* ── APPS VENDIDOS: lista compacta pra reembolso via Stripe (parcial ou total) ── */}
        {paidAppPurchases.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
            className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5"
            aria-label="Apps vendidos"
          >
            <h2 className="mb-3 text-sm font-bold text-white/70">
              Apps vendidos ({paidAppPurchases.length})
            </h2>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {paidAppPurchases.filter(p => p.refunded_amount < p.amount).map(p => (
                <div key={p.id} className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{p.application_name} — {p.plan_name}</p>
                    <p className="truncate text-xs text-white/40">
                      {p.buyer_name || p.buyer_email || 'Comprador desconhecido'} · {formatCurrencyBRL(p.amount)}
                      {p.refunded_amount > 0 && <> · reembolsado: {formatCurrencyBRL(p.refunded_amount)}</>}
                    </p>
                  </div>
                  <button type="button" onClick={() => setRefundingApp(p)} disabled={p.refund_status === 'processing'}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-40">
                    {p.refund_status === 'processing' ? 'Reembolso em andamento' : 'Reembolsar'}
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        )}

```

Add the modal render near the other refund modals (after the `RefundEbookPurchaseModal` block, around line 474):

```tsx
      {/* ── MODAL: reembolso de app (Stripe, parcial ou total) ── */}
      <RefundAppPurchaseModal
        purchase={refundingApp}
        onClose={() => setRefundingApp(null)}
        onRefunded={handleAppRefunded}
      />
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`

Navigate to `/admin/financeiro` logged in as a Técnico Líder. Confirm:
1. If there's at least one paid app purchase, the "Apps vendidos" section renders with the buyer, app/plan name, and amount.
2. Clicking "Reembolsar" opens the modal with the correct purchase details.
3. On a row `type='app'` in the main transactions table, the generic red refund icon button no longer appears (only view/edit/mark-paid/cancel/delete).
4. Submitting a refund amount greater than the remaining balance shows the client-side error without hitting the network.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the new ones from Tasks 1-3.

- [ ] **Step 5: Commit**

```bash
git add app/admin/financeiro/page.tsx app/admin/financeiro/FinanceiroClient.tsx
git commit -m "feat: seção 'Apps vendidos' em /admin/financeiro com reembolso via Stripe"
```

---

## Self-Review Notes

**Spec coverage:** Schema (Task 1) ✓, RPC (Task 1) ✓, retention bump (Task 1) ✓, admin route (Task 3) ✓, webhook branch + proportional commission refund (Task 2) ✓, payout eligibility formula (Task 1) ✓, UI modal + entry point (Tasks 4-5) ✓, generic-refund-button hiding for `type='app'` (Task 4) ✓. `subscription_invoices` refund explicitly out of scope, not touched anywhere.

**Type consistency:** `PaidAppPurchase` defined once in Task 4 (`RefundAppPurchaseModal.tsx`), imported identically in Task 5's `page.tsx` and `FinanceiroClient.tsx` — same field names throughout (`refund_status: 'processing' | 'refunded' | null`, matches the DB CHECK constraint from Task 1). RPC name `refund_app_purchase` and its 3 params (`p_purchase_id`, `p_amount`, `p_reason`) match exactly between the SQL (Task 1), the route (Task 3), and its test.

**Placeholder scan:** none found — every step has runnable code or an exact shell command.
