# Vendas e financeiro — Visão geral e Vendas com dados reais (Etapa 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os placeholders das páginas Visão geral e Vendas (Etapa 2, já em produção) por dado financeiro real do parceiro — 6 indicadores agregados e uma tabela paginada de vendas com drill-down.

**Architecture:** 4 RPCs novas (`security definer`, auto-restritas a `partner_id = auth.uid()`) mirrando exatamente a mesma matemática/janelas que `create_partner_payout` já usa (retenção via `retention_days`/`reserve_window_days` snapshot, "coberto por repasse confirmado?" via `partner_payout_items`). Visão geral é Server Component puro (1 RPC, sem interação). Vendas é Server Component (busca lista de apps pro filtro) + Client Component novo (filtro + paginação + linha expansível, chamando as RPCs direto do browser via `createClient()` de `@/lib/supabase`).

**Tech Stack:** Next.js App Router (Server + Client Components), Supabase Postgres (plpgsql RPCs, RLS já cobre leitura própria via `security definer`), `lib/finance.ts` (`formatCurrencyBRL`, `formatDateBR`), `lib/design-tokens.ts`.

## Global Constraints

- Nenhuma tabela nova — só funções SQL novas sobre tabelas já existentes.
- Toda janela de retenção/reserva usa a coluna snapshot da venda
  (`app_purchases.retention_days`/`reserve_window_days`), nunca um
  literal fixo — mesmo padrão que `create_partner_payout` já segue pra
  `app_purchases` (ver `20261001100000_snapshot_prazos_financeiros.sql`).
  `subscription_invoices` não tem snapshot de prazo (não existe a
  coluna) — usa `interval '16 days'` fixo ali, igual ao que
  `create_partner_payout` já faz pra assinatura hoje. Isso não é
  inconsistência do código novo, é reflexo do schema real.
- Todo "líquido de reembolso" usa a fórmula exata já em produção:
  principal = `(partner_amount - reserve_amount) - round(refunded_amount * (partner_amount - reserve_amount) / amount, 2)`;
  reserva = `reserve_amount - round(refunded_amount * reserve_amount / amount, 2)`.
  Nunca reimplementar com arredondamento diferente.
- Toda RPC nova é `security definer`, `set search_path to 'public'`, e
  filtra por `partner_id = auth.uid()` (ou equivalente via join em
  `subscriptions.partner_id`) internamente — nunca recebe um
  `p_partner_id` como parâmetro (diferente de `create_partner_payout`,
  que é chamada pelo líder em nome do parceiro). Isso impede um parceiro
  de consultar dado de outro.
- Reserva de disputa (`reserve_amount`/`reserve_status`) e reembolso
  (`refunded_amount`/`refunded_at`) só existem em `app_purchases` — nunca
  inventar colunas equivalentes pra `subscription_invoices` (não fazem
  parte do escopo, decisão já tomada).
- Identidade do comprador (nome/e-mail) só é lida de dentro de uma RPC
  `security definer` já validada (nunca via policy nova em `profiles` —
  esse projeto já teve 2 bugs de recursão em policies de `profiles`).
- `npx tsc --noEmit` limpo e `npx vitest run` 100% passando antes de
  cada commit (mesma baseline de 398 testes — nenhum teste automatizado
  novo é esperado aqui, mesma lacuna de cobertura já documentada nas
  etapas anteriores pra `app/dashboard/**`).

---

### Task 1: RPCs financeiras do parceiro (migração SQL)

**Files:**
- Create: `supabase/migrations/20261002110000_consultas_financeiro_parceiro.sql`

**Interfaces:**
- Produces 4 RPCs que as Tasks 2 e 3 vão chamar via
  `supabase.rpc('<nome>', {...})`:
  - `get_partner_financeiro_overview()` → 1 linha, 8 colunas (ver spec).
  - `get_partner_sold_apps()` → N linhas `{ application_id, application_name }`.
  - `get_partner_sales(p_application_id uuid default null, p_limit integer default 50, p_offset integer default 0)` → N linhas (ver spec, campos: `sale_id, sale_kind, application_name, plan_name, buyer_name, buyer_email, amount, commission_amount, partner_amount, reserve_amount, reserve_status, refunded_amount, paid_at, payout_status`). `payout_status` é `'retido' | 'elegivel' | 'pago' | 'reembolsado'` — `'reembolsado'` quando `app_purchases.status = 'refunded'` (reembolso total), ampliação sobre o enum de 3 valores do spec original porque sem isso uma venda totalmente revertida mostraria "elegível R$ 0,00", confuso.
  - `get_partner_sales_count(p_application_id uuid default null)` → `integer`, mesmo filtro de `get_partner_sales` sem paginação.

- [ ] **Step 1: Escrever a migração completa**

```sql
-- RPCs de leitura financeira pro próprio parceiro (Etapa 3 do roadmap
-- "Vendas e financeiro" — Visão geral e Vendas com dado real). Toda
-- regra (janela de retenção, "coberto por repasse confirmado?",
-- arredondamento de líquido pós-reembolso) espelha exatamente
-- create_partner_payout (20260930120000_reserva_disputa_parceiro.sql +
-- 20261001100000_snapshot_prazos_financeiros.sql) — nunca uma 3ª
-- implementação divergente da mesma conta.
--
-- Diferença de design em relação a create_partner_payout: essas RPCs
-- são chamadas PELO PRÓPRIO parceiro (não pelo líder em nome dele), por
-- isso usam auth.uid() direto, sem parâmetro p_partner_id — impossível
-- um parceiro consultar dado de outro trocando um argumento.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_partner_financeiro_overview — os 6 indicadores da Visão geral.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_financeiro_overview()
returns table (
  retido_amount         numeric(12,2),
  elegivel_amount       numeric(12,2),
  repassado_amount      numeric(12,2),
  reserva_retida_amount numeric(12,2),
  vendas_mes_count      integer,
  vendas_mes_amount     numeric(12,2),
  reembolsos_mes_count  integer,
  reembolsos_mes_amount numeric(12,2)
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id    uuid := auth.uid();
  v_retido        numeric(12,2) := 0;
  v_elegivel      numeric(12,2) := 0;
  v_repassado     numeric(12,2) := 0;
  v_reserva       numeric(12,2) := 0;
  v_vendas_count  integer := 0;
  v_vendas_amount numeric(12,2) := 0;
  v_reemb_count   integer := 0;
  v_reemb_amount  numeric(12,2) := 0;
  v_month_start   timestamptz := date_trunc('month', now());
  v_tmp_count     integer;
  v_tmp_amount    numeric(12,2);
begin
  -- Retido (app_purchases dentro da janela, não coberta)
  select coalesce(sum(
      (ap.partner_amount - ap.reserve_amount) - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2)
    ), 0)
  into v_retido
  from public.app_purchases ap
  where ap.partner_id = v_partner_id
    and ap.status = 'paid'
    and ap.paid_at is not null
    and ap.paid_at > now() - (ap.retention_days || ' days')::interval
    and not exists (
      select 1 from public.partner_payout_items pi
      join public.partner_payouts po on po.id = pi.payout_id
      where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
    );

  -- + subscription_invoices dentro da janela (16 dias fixos — sem snapshot pra assinatura)
  select coalesce(sum(si.partner_amount), 0)
  into v_tmp_amount
  from public.subscription_invoices si
  join public.subscriptions s on s.id = si.subscription_id
  where s.partner_id = v_partner_id
    and si.paid_at > now() - interval '16 days'
    and not exists (
      select 1 from public.partner_payout_items pi
      join public.partner_payouts po on po.id = pi.payout_id
      where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
    );
  v_retido := v_retido + v_tmp_amount;

  -- Elegível (mesma coisa, fora da janela)
  select coalesce(sum(
      (ap.partner_amount - ap.reserve_amount) - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2)
    ), 0)
  into v_elegivel
  from public.app_purchases ap
  where ap.partner_id = v_partner_id
    and ap.status = 'paid'
    and ap.paid_at is not null
    and ap.paid_at <= now() - (ap.retention_days || ' days')::interval
    and not exists (
      select 1 from public.partner_payout_items pi
      join public.partner_payouts po on po.id = pi.payout_id
      where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
    );

  select coalesce(sum(si.partner_amount), 0)
  into v_tmp_amount
  from public.subscription_invoices si
  join public.subscriptions s on s.id = si.subscription_id
  where s.partner_id = v_partner_id
    and si.paid_at <= now() - interval '16 days'
    and not exists (
      select 1 from public.partner_payout_items pi
      join public.partner_payouts po on po.id = pi.payout_id
      where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
    );
  v_elegivel := v_elegivel + v_tmp_amount;

  -- Repassado (histórico completo de itens confirmados deste parceiro)
  select coalesce(sum(pi.amount), 0)
  into v_repassado
  from public.partner_payout_items pi
  join public.partner_payouts po on po.id = pi.payout_id
  where po.status = 'confirmado'
    and (
      (pi.app_purchase_id is not null and exists (
        select 1 from public.app_purchases ap where ap.id = pi.app_purchase_id and ap.partner_id = v_partner_id
      ))
      or
      (pi.subscription_invoice_id is not null and exists (
        select 1 from public.subscription_invoices si
        join public.subscriptions s on s.id = si.subscription_id
        where si.id = pi.subscription_invoice_id and s.partner_id = v_partner_id
      ))
    );

  -- Reserva de disputa retida (só app_purchases, reserve_status = 'held')
  select coalesce(sum(
      ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2)
    ), 0)
  into v_reserva
  from public.app_purchases ap
  where ap.partner_id = v_partner_id
    and ap.status = 'paid'
    and ap.reserve_status = 'held';

  -- Vendas do mês (app_purchases + subscription_invoices, bruto)
  select count(*), coalesce(sum(ap.amount), 0)
  into v_vendas_count, v_vendas_amount
  from public.app_purchases ap
  where ap.partner_id = v_partner_id
    and ap.status in ('paid', 'refunded')
    and ap.paid_at >= v_month_start;

  select count(*), coalesce(sum(si.amount), 0)
  into v_tmp_count, v_tmp_amount
  from public.subscription_invoices si
  join public.subscriptions s on s.id = si.subscription_id
  where s.partner_id = v_partner_id
    and si.paid_at >= v_month_start;

  v_vendas_count  := v_vendas_count + v_tmp_count;
  v_vendas_amount := v_vendas_amount + v_tmp_amount;

  -- Reembolsos do mês (só app_purchases — sem mecanismo de reembolso pra assinatura)
  select count(*), coalesce(sum(ap.refunded_amount), 0)
  into v_reemb_count, v_reemb_amount
  from public.app_purchases ap
  where ap.partner_id = v_partner_id
    and ap.refunded_amount > 0
    and ap.refunded_at >= v_month_start;

  return query select v_retido, v_elegivel, v_repassado, v_reserva,
                       v_vendas_count, v_vendas_amount, v_reemb_count, v_reemb_amount;
end;
$$;

grant execute on function public.get_partner_financeiro_overview() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_sold_apps — distinct de apps já vendidos, pro filtro da
--    página Vendas. subscription_invoices não guarda nome do app
--    (snapshot só em app_purchases) — precisa do join
--    app_plans → app_drafts → applications pra achar o nome atual.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_sold_apps()
returns table (application_id uuid, application_name text)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  return query
  select distinct on (x.application_id) x.application_id, x.application_name
  from (
    select ap.application_id as application_id, ap.application_name as application_name
    from public.app_purchases ap
    where ap.partner_id = auth.uid() and ap.status in ('paid', 'refunded')

    union all

    select d.application_id, a.name
    from public.subscriptions s
    join public.app_plans p on p.id = s.app_plan_id
    join public.app_drafts d on d.id = p.app_draft_id
    join public.applications a on a.id = d.application_id
    where s.partner_id = auth.uid() and s.product_type = 'app_plan' and d.application_id is not null
  ) x
  order by x.application_id, x.application_name;
end;
$$;

grant execute on function public.get_partner_sold_apps() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) get_partner_sales — lista paginada de vendas (compra única +
--    fatura de assinatura), com comprador e status de repasse por linha.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_sales(
  p_application_id uuid default null,
  p_limit          integer default 50,
  p_offset         integer default 0
)
returns table (
  sale_id           uuid,
  sale_kind         text,
  application_name  text,
  plan_name         text,
  buyer_name        text,
  buyer_email       text,
  amount            numeric(12,2),
  commission_amount numeric(12,2),
  partner_amount    numeric(12,2),
  reserve_amount    numeric(12,2),
  reserve_status    text,
  refunded_amount   numeric(12,2),
  paid_at           timestamptz,
  payout_status     text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  return query
  select combined.* from (
    select
      ap.id                 as sale_id,
      'app_purchase'::text  as sale_kind,
      ap.application_name,
      ap.plan_name,
      coalesce(pr.full_name, '—') as buyer_name,
      coalesce(pr.email, '—')     as buyer_email,
      ap.amount,
      ap.commission_amount,
      ap.partner_amount,
      ap.reserve_amount,
      ap.reserve_status,
      ap.refunded_amount,
      ap.paid_at,
      case
        when ap.status = 'refunded' then 'reembolsado'
        when exists (
          select 1 from public.partner_payout_items pi
          join public.partner_payouts po on po.id = pi.payout_id
          where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
        ) then 'pago'
        when ap.paid_at <= now() - (ap.retention_days || ' days')::interval then 'elegivel'
        else 'retido'
      end as payout_status
    from public.app_purchases ap
    left join public.profiles pr on pr.id = ap.buyer_user_id
    where ap.partner_id = auth.uid()
      and ap.status in ('paid', 'refunded')
      and (p_application_id is null or ap.application_id = p_application_id)

    union all

    select
      si.id                        as sale_id,
      'subscription_invoice'::text as sale_kind,
      a.name                       as application_name,
      s.plan_name,
      coalesce(pr.full_name, '—')  as buyer_name,
      coalesce(pr.email, '—')      as buyer_email,
      si.amount,
      si.commission_amount,
      si.partner_amount,
      0::numeric(12,2) as reserve_amount,
      null::text       as reserve_status,
      0::numeric(12,2) as refunded_amount,
      si.paid_at,
      case
        when exists (
          select 1 from public.partner_payout_items pi
          join public.partner_payouts po on po.id = pi.payout_id
          where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
        ) then 'pago'
        when si.paid_at <= now() - interval '16 days' then 'elegivel'
        else 'retido'
      end as payout_status
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.profiles pr on pr.id = s.user_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where s.partner_id = auth.uid()
      and s.product_type = 'app_plan'
      and (p_application_id is null or d.application_id = p_application_id)
  ) combined
  order by combined.paid_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.get_partner_sales(uuid, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) get_partner_sales_count — mesmo filtro de get_partner_sales, sem
--    paginação, só pra a UI saber o total de páginas.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_sales_count(p_application_id uuid default null)
returns integer
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from (
    select ap.id
    from public.app_purchases ap
    where ap.partner_id = auth.uid()
      and ap.status in ('paid', 'refunded')
      and (p_application_id is null or ap.application_id = p_application_id)

    union all

    select si.id
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    where s.partner_id = auth.uid()
      and s.product_type = 'app_plan'
      and (p_application_id is null or d.application_id = p_application_id)
  ) combined;

  return v_count;
end;
$$;

grant execute on function public.get_partner_sales_count(uuid) to authenticated;
```

- [ ] **Step 2: Comentar as 4 funções (padrão já usado em toda RPC financeira do projeto)**

```sql
comment on function public.get_partner_financeiro_overview() is
  'Os 6 indicadores agregados da Visão geral do parceiro — retido/elegível/repassado/reserva somam app_purchases + subscription_invoices (reserva e reembolso só existem em app_purchases). Mesma matemática de create_partner_payout, nunca uma 3ª implementação divergente.';
comment on function public.get_partner_sold_apps() is
  'Apps distintos que o parceiro já vendeu (compra única ou assinatura) — só pra popular o filtro da página Vendas.';
comment on function public.get_partner_sales(uuid, integer, integer) is
  'Lista paginada de vendas do parceiro (compra única + fatura de assinatura), com comprador e status de repasse por linha. payout_status = reembolsado quando a compra foi totalmente revertida (status=refunded) — valor adicional sobre retido/elegivel/pago.';
comment on function public.get_partner_sales_count(uuid) is
  'Contagem total pro mesmo filtro de get_partner_sales — paginação client-side.';
```

- [ ] **Step 3: Rodar `supabase db push --linked` (confirmar com o usuário antes)**

Não aplicar sem confirmação explícita — mesmo protocolo das migrações
anteriores desta sessão.

- [ ] **Step 4: Verificação manual via SQL**

Logado como `service_role` (ou via `supabase db execute`), com o
parceiro de teste do Task 4 já criado, confirmar que
`select * from get_partner_financeiro_overview()` e
`select * from get_partner_sales(null, 50, 0)` retornam os valores
esperados pra cada venda de teste (ver Task 4 pros dados exatos).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002110000_consultas_financeiro_parceiro.sql
git commit -m "feat: RPCs de leitura financeira do parceiro (Visão geral e Vendas, Etapa 3)"
```

---

### Task 2: Visão geral com dado real

**Files:**
- Modify: `app/dashboard/financeiro/page.tsx` (substituir todo o corpo)

**Interfaces:**
- Consumes: `get_partner_financeiro_overview()` da Task 1.
- Produces: nada consumido por outra task.

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Antes:
```tsx
import type { Metadata } from 'next'
import { colors } from '@/lib/design-tokens'

export const metadata: Metadata = { title: 'Vendas e financeiro | LOBBY', robots: { index: false, follow: false } }

export default function FinanceiroVisaoGeralPage() {
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Visão geral</h2>
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        Em construção — essa área está sendo desenvolvida.
      </p>
    </div>
  )
}
```

Depois:
```tsx
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL } from '@/lib/finance'

export const metadata: Metadata = { title: 'Vendas e financeiro | LOBBY', robots: { index: false, follow: false } }

interface OverviewRow {
  retido_amount:         number
  elegivel_amount:       number
  repassado_amount:      number
  reserva_retida_amount: number
  vendas_mes_count:      number
  vendas_mes_amount:     number
  reembolsos_mes_count:  number
  reembolsos_mes_amount: number
}

const EMPTY_OVERVIEW: OverviewRow = {
  retido_amount: 0, elegivel_amount: 0, repassado_amount: 0, reserva_retida_amount: 0,
  vendas_mes_count: 0, vendas_mes_amount: 0, reembolsos_mes_count: 0, reembolsos_mes_amount: 0,
}

export default async function FinanceiroVisaoGeralPage() {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  const { data } = await supabase.rpc('get_partner_financeiro_overview') as unknown as { data: OverviewRow[] | null }
  const overview = data?.[0] ?? EMPTY_OVERVIEW

  const cards: { label: string; value: number; sub: string; color: string }[] = [
    { label: 'Retido',                      value: overview.retido_amount,         sub: 'Dentro do período de retenção',          color: '#F59E0B' },
    { label: 'Elegível para repasse',       value: overview.elegivel_amount,       sub: 'Fora da retenção, aguardando repasse',    color: colors.primary },
    { label: 'Já repassado',                value: overview.repassado_amount,      sub: 'Histórico de repasses confirmados',       color: '#10B981' },
    { label: 'Reserva de disputa retida',   value: overview.reserva_retida_amount, sub: 'Liberada em até 120 dias sem disputa',    color: '#6D28D9' },
    { label: 'Vendas do mês',               value: overview.vendas_mes_amount,     sub: `${overview.vendas_mes_count} venda${overview.vendas_mes_count === 1 ? '' : 's'}`, color: colors.text },
    { label: 'Reembolsos do mês',           value: overview.reembolsos_mes_amount, sub: `${overview.reembolsos_mes_count} reembolso${overview.reembolsos_mes_count === 1 ? '' : 's'}`, color: '#EF4444' },
  ]

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold" style={{ color: colors.text }}>Visão geral</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
            <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>{c.label}</p>
            <p className="mt-1 text-xl font-bold" style={{ color: c.color }}>{formatCurrencyBRL(c.value)}</p>
            <p className="mt-0.5 text-[11px]" style={{ color: colors.textMuted }}>{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `npx tsc --noEmit`**

Expected: limpo, sem erro novo.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/financeiro/page.tsx
git commit -m "feat: Visão geral com os 6 indicadores reais (Etapa 3)"
```

---

### Task 3: Vendas com tabela real, filtro e drill-down

**Files:**
- Modify: `app/dashboard/financeiro/vendas/page.tsx` (substituir todo o corpo)
- Create: `app/dashboard/financeiro/vendas/VendasClient.tsx`

**Interfaces:**
- Consumes: `get_partner_sold_apps()` (Server Component, Task 1), depois
  `get_partner_sales`/`get_partner_sales_count` (Client Component, via
  `createClient()` de `@/lib/supabase`, Task 1).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Criar `VendasClient.tsx`**

```tsx
'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

const PAGE_SIZE = 50

interface SoldApp {
  application_id:   string
  application_name: string
}

interface SaleRow {
  sale_id:           string
  sale_kind:         'app_purchase' | 'subscription_invoice'
  application_name:  string
  plan_name:         string
  buyer_name:        string
  buyer_email:       string
  amount:            number
  commission_amount: number
  partner_amount:    number
  reserve_amount:    number
  reserve_status:    'held' | 'released' | 'clawed_back' | null
  refunded_amount:   number
  paid_at:           string
  payout_status:     'retido' | 'elegivel' | 'pago' | 'reembolsado'
}

const STATUS_STYLE: Record<SaleRow['payout_status'], { label: string; color: string }> = {
  retido:      { label: 'Retido',      color: '#F59E0B' },
  elegivel:    { label: 'Elegível',    color: colors.primary },
  pago:        { label: 'Pago',        color: '#10B981' },
  reembolsado: { label: 'Reembolsado', color: '#EF4444' },
}

const RESERVE_STATUS_LABEL: Record<string, string> = {
  held:         'Retida',
  released:     'Liberada',
  clawed_back:  'Perdida em disputa',
}

interface Props {
  soldApps: SoldApp[]
}

export default function VendasClient({ soldApps }: Props) {
  const [applicationId, setApplicationId] = useState<string>('')
  const [page, setPage] = useState(0)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const filterId = applicationId || null
    const [{ data: salesData }, { data: countData }] = await Promise.all([
      supabase.rpc('get_partner_sales', { p_application_id: filterId, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }),
      supabase.rpc('get_partner_sales_count', { p_application_id: filterId }),
    ]) as unknown as [{ data: SaleRow[] | null }, { data: number | null }]
    setSales(salesData ?? [])
    setTotal(countData ?? 0)
    setLoading(false)
  }, [applicationId, page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold" style={{ color: colors.text }}>Vendas</h2>
        {soldApps.length > 1 && (
          <select
            value={applicationId}
            onChange={e => { setApplicationId(e.target.value); setPage(0) }}
            className="h-9 rounded-lg border px-3 text-sm"
            style={{ borderColor: colors.border, color: colors.text }}
            aria-label="Filtrar vendas por app"
          >
            <option value="">Todos os apps</option>
            {soldApps.map(a => (
              <option key={a.application_id} value={a.application_id}>{a.application_name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Carregando…</p>
      ) : sales.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhuma venda ainda.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: colors.textSecondary }}>
                  <th className="pb-2 pr-3 font-semibold">App</th>
                  <th className="pb-2 pr-3 font-semibold">Plano</th>
                  <th className="pb-2 pr-3 font-semibold">Comprador</th>
                  <th className="pb-2 pr-3 font-semibold">Data</th>
                  <th className="pb-2 pr-3 font-semibold">Valor</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => {
                  const expanded = expandedId === sale.sale_id
                  const status = STATUS_STYLE[sale.payout_status]
                  return (
                    <Fragment key={sale.sale_id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : sale.sale_id)}
                        className="cursor-pointer border-t"
                        style={{ borderColor: colors.border }}
                      >
                        <td className="py-2 pr-3" style={{ color: colors.text }}>
                          <span className="inline-flex items-center gap-1">
                            {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                            {sale.application_name}
                          </span>
                        </td>
                        <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{sale.plan_name}</td>
                        <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{sale.buyer_name}</td>
                        <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{formatDateBR(sale.paid_at.slice(0, 10))}</td>
                        <td className="py-2 pr-3 font-semibold" style={{ color: colors.text }}>{formatCurrencyBRL(sale.amount)}</td>
                        <td className="py-2">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: status.color, background: `${status.color}1A` }}>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t" style={{ borderColor: colors.border }}>
                          <td colSpan={6} className="py-3" style={{ background: colors.backgroundAlt }}>
                            <div className="grid grid-cols-2 gap-2 px-3 text-xs sm:grid-cols-4" style={{ color: colors.textSecondary }}>
                              <div>Tipo: <strong style={{ color: colors.text }}>{sale.sale_kind === 'app_purchase' ? 'Compra única' : 'Assinatura'}</strong></div>
                              <div>Comissão LOBBY: <strong style={{ color: colors.text }}>{formatCurrencyBRL(sale.commission_amount)}</strong></div>
                              <div>Valor líquido: <strong style={{ color: colors.text }}>{formatCurrencyBRL(sale.partner_amount)}</strong></div>
                              <div>E-mail: <strong style={{ color: colors.text }}>{sale.buyer_email}</strong></div>
                              {sale.reserve_amount > 0 && (
                                <div>Reserva de disputa: <strong style={{ color: colors.text }}>{formatCurrencyBRL(sale.reserve_amount)} ({sale.reserve_status ? RESERVE_STATUS_LABEL[sale.reserve_status] : '—'})</strong></div>
                              )}
                              {sale.refunded_amount > 0 && (
                                <div>Reembolsado: <strong style={{ color: colors.text }}>{formatCurrencyBRL(sale.refunded_amount)}</strong></div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs" style={{ color: colors.textSecondary }}>
            <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Substituir o conteúdo de `page.tsx`**

Antes:
```tsx
import type { Metadata } from 'next'
import { colors } from '@/lib/design-tokens'

export const metadata: Metadata = { title: 'Vendas | LOBBY', robots: { index: false, follow: false } }

export default function FinanceiroVendasPage() {
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Vendas</h2>
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        Em construção — essa área está sendo desenvolvida.
      </p>
    </div>
  )
}
```

Depois:
```tsx
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import VendasClient from './VendasClient'

export const metadata: Metadata = { title: 'Vendas | LOBBY', robots: { index: false, follow: false } }

interface SoldApp {
  application_id:   string
  application_name: string
}

export default async function FinanceiroVendasPage() {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  const { data } = await supabase.rpc('get_partner_sold_apps') as unknown as { data: SoldApp[] | null }

  return <VendasClient soldApps={data ?? []} />
}
```

- [ ] **Step 3: `npx tsc --noEmit`**

Expected: limpo. O `.map` em `VendasClient.tsx` usa `<Fragment key={sale.sale_id}>` (não o shorthand `<>`) porque o shorthand não aceita `key` — isso é um erro de compilação em JSX/TS, não um lint nit, por isso o import explícito de `Fragment` já está no código acima.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/financeiro/vendas/page.tsx app/dashboard/financeiro/vendas/VendasClient.tsx
git commit -m "feat: página Vendas com tabela real, filtro por app e drill-down (Etapa 3)"
```

---

### Task 4: Verificação manual no navegador

**Files:** nenhum arquivo novo — só dados de teste temporários + checagem.

**Interfaces:** nenhuma — task de verificação, não de código.

- [ ] **Step 1: Criar conta de teste (parceiro) + dados financeiros variados**

Mesmo padrão já usado na Etapa 2 (service-role `auth.admin.createUser` +
insert manual em `profiles`, já que não existe trigger que crie o
profile automaticamente). Depois, via `service_role`, inserir em
`app_purchases` linhas cobrindo cada estado de `payout_status`:
- 1 linha `status='paid'`, `paid_at = now() - interval '5 days'` →
  esperado `retido`.
- 1 linha `status='paid'`, `paid_at = now() - interval '20 days'`, sem
  item de repasse confirmado → esperado `elegivel`.
- 1 linha `status='paid'`, `paid_at = now() - interval '30 days'` +
  `partner_payouts`/`partner_payout_items` (`kind='main'`,
  `status='confirmado'`) cobrindo-a → esperado `pago`.
- 1 linha `status='refunded'`, `refunded_amount = amount` → esperado
  `reembolsado`.
- 1 linha `status='paid'`, `reserve_status='held'`, `paid_at = now() -
  interval '5 days'` → aparece na Visão geral em "Reserva de disputa
  retida", e na tabela mostra o valor de reserva no drill-down.
- Opcional, se viável no tempo da verificação: 1 `subscriptions`
  (`product_type='app_plan'`, `partner_id` = parceiro de teste) + 1
  `subscription_invoices` paga, pra confirmar que ela aparece somada nos
  cards e na tabela com `sale_kind='subscription_invoice'`.

- [ ] **Step 2: Login como o parceiro de teste, abrir `/dashboard/financeiro`**

Confirmar: os 6 cards mostram os valores esperados (somar manualmente
as linhas de teste e comparar). Nenhum erro no console.

- [ ] **Step 3: Abrir `/dashboard/financeiro/vendas`**

Confirmar: a tabela mostra todas as vendas de teste, cada uma com o
`payout_status` esperado. Clicar em cada linha expande o detalhe
correto (comissão, líquido, reserva quando houver, reembolso quando
houver). Se mais de um app de teste foi criado, o filtro dropdown
aparece e filtra corretamente. Testar em mobile (375px) também —
tabela deve rolar horizontalmente sem quebrar o layout da página
(`overflow-x-auto` já no `VendasClient`).

- [ ] **Step 4: Limpar os dados de teste**

Apagar as linhas de `app_purchases`/`subscriptions`/`subscription_invoices`/
`partner_payouts`/`partner_payout_items` criadas, e a conta/profile de
teste — mesmo cuidado de não deixar rastro em produção que a Etapa 2 já
seguiu.
