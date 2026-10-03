# Visão geral de Vendas e financeiro — redesenho Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o card único de 6 indicadores da aba "Visão geral" (`/dashboard/financeiro`) por um painel completo com filtros de período/app, resultados do período, saldos atuais, gráfico de evolução, próximas liberações, últimas vendas, desempenho por app e pendências — sem tocar Vendas/Repasses/Ofertas/Configurações.

**Architecture:** 5 RPCs novas (`security definer`, mesmo padrão de permissão `financeiro_visao_geral`/`role='owner'` das 7 já existentes), paralelas — nenhuma RPC/página em produção é alterada. Um client component orquestrador (`VisaoGeralClient.tsx`, mesmo padrão de `VendasClient.tsx`: fetch via `createClient()` no navegador, RLS como segunda trava) busca tudo e distribui pra sub-componentes de apresentação. `FinanceiroSellerGate.tsx` ganha uma prop `bare` pra Visão geral escapar do card externo compartilhado sem afetar as outras 4 abas. Export novo em `GET /api/financeiro/export`.

**Tech Stack:** Next.js App Router, Supabase Postgres (RPCs `security definer`), Recharts (dependência nova) pro gráfico, Tailwind + design tokens já existentes (`lib/design-tokens.ts`).

## Global Constraints

- Toda RPC nova usa exatamente o mesmo bloco de permissão das 7 já existentes: `v_partner_id uuid := coalesce(p_partner_id, auth.uid())`; se `v_partner_id is distinct from auth.uid()`, exige `tm.role = 'owner' or 'financeiro_visao_geral' = any(tm.permissions)` via join `app_team_members` → `app_drafts`, senão `raise exception`.
- Nenhuma RPC/página/componente já em produção (Vendas, Repasses, Ofertas, Configurações, `get_partner_financeiro_overview`, `get_partner_sales`, `get_partner_payout_queue_main/_reserve`, `get_partner_payout_history`, `get_partner_sold_apps`) é alterada — só leitura/reaproveitamento.
- `app_purchases.commission_amount + partner_amount = amount` (constraint já existe) — nunca subtrair comissão de novo de `partner_amount`.
- `app_purchases.reserve_amount` é uma FATIA de `partner_amount`, não adicional.
- "Reembolsos do período" filtra por `refunded_at` (não `paid_at`) — mesmo critério de `get_partner_financeiro_overview`.
- `app_purchases.retention_days`/`reserve_window_days` são snapshots por linha — nunca usar as constantes de `lib/services/payouts.ts` pra cálculo de data, só pra exibição/fallback de UI.
- "Sua participação" nunca é rotulado "lucro".
- Nenhuma escrita financeira (RPC ou rota) é criada ou chamada por esta página — só leitura.
- `formatCurrencyBRL`/`formatDateBR` de `lib/finance.ts`, `colors`/`shadows` de `lib/design-tokens.ts` — reaproveitados em todo componente novo, nunca reimplementados.
- `npx tsc --noEmit` limpo e `npx vitest run` 100% passando (baseline 398 testes) antes de cada commit.

---

### Task 1: 5 RPCs novas de período

**Files:**
- Create: `supabase/migrations/20261003140000_financeiro_periodo.sql`

**Interfaces:**
- Produces: `get_partner_financeiro_periodo_resumo`, `get_partner_financeiro_periodo_serie`, `get_partner_financeiro_periodo_por_app`, `get_partner_financeiro_periodo_vendas`, `get_partner_financeiro_pendencias` — consumidas por `VisaoGeralClient.tsx` (Tasks 3-6) e pela rota de export (Task 8).

- [ ] **Step 1: Escrever a migração completa**

```sql
-- Vendas e financeiro — redesenho da Visão geral. 5 RPCs novas,
-- paralelas às 7 já existentes de 20261002140000_recebimento_
-- atendimento_equipe.sql — nenhuma delas é alterada. Mesmo padrão de
-- permissão (p_partner_id + financeiro_visao_geral/role=owner em
-- app_team_members.permissions).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_partner_financeiro_periodo_resumo — os 4 cards de "Resultados
--    do período". Reembolsos filtram por refunded_at (não paid_at) —
--    mesmo critério já usado em get_partner_financeiro_overview.
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_financeiro_periodo_resumo(
  p_from           timestamptz,
  p_to             timestamptz,
  p_application_id uuid default null,
  p_partner_id     uuid default null
)
returns table (
  vendas_confirmadas_valor numeric(12,2),
  vendas_confirmadas_qtd   integer,
  comissao_valor           numeric(12,2),
  reembolsos_valor         numeric(12,2),
  reembolsos_qtd           integer,
  participacao_valor       numeric(12,2)
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id         uuid := coalesce(p_partner_id, auth.uid());
  v_vendas_valor       numeric(12,2) := 0;
  v_vendas_qtd         integer := 0;
  v_comissao_valor     numeric(12,2) := 0;
  v_participacao_valor numeric(12,2) := 0;
  v_reembolsos_valor   numeric(12,2) := 0;
  v_reembolsos_qtd     integer := 0;
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_visao_geral' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  select
    count(*), coalesce(sum(combined.amount), 0),
    coalesce(sum(combined.commission_amount), 0), coalesce(sum(combined.partner_amount), 0)
  into v_vendas_qtd, v_vendas_valor, v_comissao_valor, v_participacao_valor
  from (
    select ap.amount, ap.commission_amount, ap.partner_amount
    from public.app_purchases ap
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and ap.paid_at >= p_from and ap.paid_at < p_to
      and (p_application_id is null or ap.application_id = p_application_id)

    union all

    select si.amount, si.commission_amount, si.partner_amount
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and si.paid_at >= p_from and si.paid_at < p_to
      and (p_application_id is null or d.application_id = p_application_id)
  ) combined;

  select count(*), coalesce(sum(ap.refunded_amount), 0)
  into v_reembolsos_qtd, v_reembolsos_valor
  from public.app_purchases ap
  where ap.partner_id = v_partner_id
    and ap.refunded_amount > 0
    and ap.refunded_at >= p_from and ap.refunded_at < p_to
    and (p_application_id is null or ap.application_id = p_application_id);

  return query select v_vendas_valor, v_vendas_qtd, v_comissao_valor, v_reembolsos_valor, v_reembolsos_qtd, v_participacao_valor;
end;
$$;

revoke execute on function public.get_partner_financeiro_periodo_resumo(timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_financeiro_periodo_resumo(timestamptz, timestamptz, uuid, uuid) to authenticated;

comment on function public.get_partner_financeiro_periodo_resumo(timestamptz, timestamptz, uuid, uuid) is
  'Os 4 indicadores de "Resultados do período" da Visão geral. Reembolsos filtram por refunded_at, não paid_at.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_financeiro_periodo_serie — pontos do gráfico de
--    evolução, agrupados por dia ou mês conforme p_granularidade.
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_financeiro_periodo_serie(
  p_from           timestamptz,
  p_to             timestamptz,
  p_granularidade  text default 'day',
  p_application_id uuid default null,
  p_partner_id     uuid default null
)
returns table (
  bucket             date,
  vendas_valor       numeric(12,2),
  participacao_valor numeric(12,2)
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_unit       text := case when p_granularidade = 'month' then 'month' else 'day' end;
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_visao_geral' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  select date_trunc(v_unit, combined.paid_at)::date as bucket,
         coalesce(sum(combined.amount), 0) as vendas_valor,
         coalesce(sum(combined.partner_amount), 0) as participacao_valor
  from (
    select ap.paid_at, ap.amount, ap.partner_amount
    from public.app_purchases ap
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and ap.paid_at >= p_from and ap.paid_at < p_to
      and (p_application_id is null or ap.application_id = p_application_id)

    union all

    select si.paid_at, si.amount, si.partner_amount
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and si.paid_at >= p_from and si.paid_at < p_to
      and (p_application_id is null or d.application_id = p_application_id)
  ) combined
  group by 1
  order by 1;
end;
$$;

revoke execute on function public.get_partner_financeiro_periodo_serie(timestamptz, timestamptz, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_financeiro_periodo_serie(timestamptz, timestamptz, text, uuid, uuid) to authenticated;

comment on function public.get_partner_financeiro_periodo_serie(timestamptz, timestamptz, text, uuid, uuid) is
  'Série temporal (vendas + participação) pro gráfico de evolução, agrupada por dia ou mês.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) get_partner_financeiro_periodo_por_app — "Desempenho por
--    aplicativo", uma linha por app, ordenado por valor vendido.
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_financeiro_periodo_por_app(
  p_from       timestamptz,
  p_to         timestamptz,
  p_partner_id uuid default null
)
returns table (
  application_id           uuid,
  application_name         text,
  vendas_confirmadas_qtd   integer,
  vendas_confirmadas_valor numeric(12,2),
  participacao_valor       numeric(12,2)
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_visao_geral' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  select combined.application_id, combined.application_name,
         count(*)::integer as vendas_confirmadas_qtd,
         coalesce(sum(combined.amount), 0) as vendas_confirmadas_valor,
         coalesce(sum(combined.partner_amount), 0) as participacao_valor
  from (
    select ap.application_id, ap.application_name, ap.amount, ap.partner_amount
    from public.app_purchases ap
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and ap.paid_at >= p_from and ap.paid_at < p_to

    union all

    select d.application_id, a.name as application_name, si.amount, si.partner_amount
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    join public.app_plans p on p.id = s.app_plan_id
    join public.app_drafts d on d.id = p.app_draft_id
    join public.applications a on a.id = d.application_id
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and si.paid_at >= p_from and si.paid_at < p_to
  ) combined
  group by combined.application_id, combined.application_name
  order by vendas_confirmadas_valor desc;
end;
$$;

revoke execute on function public.get_partner_financeiro_periodo_por_app(timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_financeiro_periodo_por_app(timestamptz, timestamptz, uuid) to authenticated;

comment on function public.get_partner_financeiro_periodo_por_app(timestamptz, timestamptz, uuid) is
  'Desempenho por aplicativo no período, ordenado por valor vendido desc.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) get_partner_financeiro_periodo_vendas — "Últimas vendas" (limit 5)
--    e a seção de vendas do export (limit maior). Mesma forma de
--    get_partner_sales, MENOS buyer_name/buyer_email (minimização de
--    PII), MAIS filtro de período.
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_financeiro_periodo_vendas(
  p_from           timestamptz,
  p_to             timestamptz,
  p_application_id uuid default null,
  p_limit          integer default 5,
  p_offset         integer default 0,
  p_partner_id     uuid default null
)
returns table (
  sale_id          uuid,
  sale_kind        text,
  application_name text,
  plan_name        text,
  amount           numeric(12,2),
  partner_amount   numeric(12,2),
  paid_at          timestamptz,
  payout_status    text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_visao_geral' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  select combined.* from (
    select
      ap.id as sale_id,
      'app_purchase'::text as sale_kind,
      ap.application_name,
      ap.plan_name,
      ap.amount,
      ap.partner_amount,
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
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and ap.paid_at >= p_from and ap.paid_at < p_to
      and (p_application_id is null or ap.application_id = p_application_id)

    union all

    select
      si.id as sale_id,
      'subscription_invoice'::text as sale_kind,
      a.name as application_name,
      s.plan_name,
      si.amount,
      si.partner_amount,
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
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and si.paid_at >= p_from and si.paid_at < p_to
      and (p_application_id is null or d.application_id = p_application_id)
  ) combined
  order by combined.paid_at desc, combined.sale_id
  limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.get_partner_financeiro_periodo_vendas(timestamptz, timestamptz, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_financeiro_periodo_vendas(timestamptz, timestamptz, uuid, integer, integer, uuid) to authenticated;

comment on function public.get_partner_financeiro_periodo_vendas(timestamptz, timestamptz, uuid, integer, integer, uuid) is
  'Vendas do período, paginada, sem dados de comprador (diferente de get_partner_sales, que é só da aba Vendas e mostra buyer_name/email).';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) get_partner_financeiro_pendencias — avisos da Visão geral.
--    "Repasse com falha" mapeia pra partner_payouts.status='revertido'
--    recente (não existe estado real de falha de envio). Disputa é só
--    informativo (payment_disputes/app_purchases.status='disputed').
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_financeiro_pendencias(p_partner_id uuid default null)
returns table (
  recebimento_incompleto    boolean,
  repasse_revertido_recente boolean,
  repasse_revertido_motivo  text,
  repasse_revertido_valor   numeric(12,2),
  repasse_revertido_em      timestamptz,
  valor_bloqueado_disputa   numeric(12,2),
  disputas_abertas_qtd      integer
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id             uuid := coalesce(p_partner_id, auth.uid());
  v_recebimento_incompleto boolean;
  v_revertido_recente      boolean;
  v_revertido_motivo       text;
  v_revertido_valor        numeric(12,2);
  v_revertido_em           timestamptz;
  v_bloqueado              numeric(12,2);
  v_disputas_count         integer;
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_visao_geral' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  select pr.payout_pix_key is null into v_recebimento_incompleto
  from public.profiles pr where pr.id = v_partner_id;

  select true, po.revert_reason, po.total_amount, po.reverted_at
  into v_revertido_recente, v_revertido_motivo, v_revertido_valor, v_revertido_em
  from public.partner_payouts po
  where po.partner_id = v_partner_id
    and po.status = 'revertido'
    and po.reverted_at >= now() - interval '30 days'
  order by po.reverted_at desc
  limit 1;
  v_revertido_recente := coalesce(v_revertido_recente, false);

  select coalesce(sum(ap.partner_amount), 0), count(*)
  into v_bloqueado, v_disputas_count
  from public.app_purchases ap
  where ap.partner_id = v_partner_id
    and ap.status = 'disputed';

  return query select
    coalesce(v_recebimento_incompleto, true), v_revertido_recente, v_revertido_motivo,
    v_revertido_valor, v_revertido_em, v_bloqueado, v_disputas_count;
end;
$$;

revoke execute on function public.get_partner_financeiro_pendencias(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_financeiro_pendencias(uuid) to authenticated;

comment on function public.get_partner_financeiro_pendencias(uuid) is
  'Condições reais pra seção Pendências e avisos da Visão geral — nunca um aviso sem dado real por trás.';
```

- [ ] **Step 2: `npx tsc --noEmit`**

Expected: limpo (migração SQL não afeta TypeScript, mas confirma que nada mais quebrou).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261003140000_financeiro_periodo.sql
git commit -m "feat: 5 RPCs de período pra Visão geral de Vendas e financeiro"
```

---

### Task 2: Recharts + `bare` prop + filtros compartilhados

**Files:**
- Modify: `package.json` (via `npm install recharts`)
- Modify: `app/dashboard/financeiro/FinanceiroSellerGate.tsx`
- Create: `lib/services/financeiro-periodo.ts`
- Create: `lib/services/financeiro-periodo.test.ts`
- Create: `app/dashboard/financeiro/FiltrosPeriodo.tsx`

**Interfaces:**
- Produces: `resolvePeriodoRange(preset, customFrom?, customTo?) -> { from: string; to: string }` (ISO, `from` inclusivo/`to` exclusivo), `resolveGranularidade(from, to) -> 'day' | 'month'`, `PeriodoPreset` type, `PERIODO_LABEL` map — consumidos por `VisaoGeralClient.tsx` (Task 3+) e pela rota de export (Task 8).
- Produces: `<FiltrosPeriodo>` componente controlado (preset + app + datas custom), consumido por `VisaoGeralClient.tsx`.
- Produces: `FinanceiroSellerGate`'s nova prop `bare?: boolean`.

- [ ] **Step 1: Instalar Recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Criar `lib/services/financeiro-periodo.ts`**

```typescript
// Resolução de período/granularidade pra Visão geral de Vendas e
// financeiro — lógica pura, sem I/O, reaproveitada pelo client da
// página e pela rota de export (nunca duas implementações divergentes
// do mesmo cálculo de datas).

export type PeriodoPreset = 'este_mes' | 'mes_anterior' | 'ultimos_30_dias' | 'personalizado'

export interface PeriodoRange {
  /** ISO, inclusivo */
  from: string
  /** ISO, exclusivo */
  to: string
}

export const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  este_mes: 'Este mês',
  mes_anterior: 'Mês anterior',
  ultimos_30_dias: 'Últimos 30 dias',
  personalizado: 'Personalizado',
}

/** Início exclusivo do dia seguinte a `date` (meia-noite local) — usado
 *  como limite superior exclusivo em todo período calculado aqui. */
function startOfNextDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
}

export function resolvePeriodoRange(
  preset: PeriodoPreset,
  customFrom?: string | null,
  customTo?: string | null,
): PeriodoRange {
  const now = new Date()

  if (preset === 'personalizado' && customFrom && customTo) {
    const from = new Date(`${customFrom}T00:00:00`)
    const to = startOfNextDay(new Date(`${customTo}T00:00:00`))
    return { from: from.toISOString(), to: to.toISOString() }
  }

  if (preset === 'mes_anterior') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const to = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: from.toISOString(), to: to.toISOString() }
  }

  if (preset === 'ultimos_30_dias') {
    const to = startOfNextDay(now)
    const from = new Date(to.getTime() - 30 * 86400_000)
    return { from: from.toISOString(), to: to.toISOString() }
  }

  // 'este_mes' (default, inclui o caso 'personalizado' sem datas ainda escolhidas)
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** ≤31 dias de período → agrupa por dia; maior → por mês. Mesma regra
 *  usada tanto no gráfico quanto, implicitamente, em qualquer leitor do
 *  período (export inclusive, se um dia precisar de granularidade). */
export function resolveGranularidade(from: string, to: string): 'day' | 'month' {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86400_000
  return days <= 31 ? 'day' : 'month'
}
```

- [ ] **Step 3: Criar `lib/services/financeiro-periodo.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { resolvePeriodoRange, resolveGranularidade } from './financeiro-periodo'

describe('resolvePeriodoRange', () => {
  it('personalizado usa as datas informadas, to exclusivo no dia seguinte', () => {
    const { from, to } = resolvePeriodoRange('personalizado', '2026-01-10', '2026-01-15')
    expect(from).toBe(new Date('2026-01-10T00:00:00').toISOString())
    expect(to).toBe(new Date('2026-01-16T00:00:00').toISOString())
  })

  it('personalizado sem datas cai no comportamento de este_mes', () => {
    const custom = resolvePeriodoRange('personalizado')
    const esteMes = resolvePeriodoRange('este_mes')
    expect(custom).toEqual(esteMes)
  })

  it('mes_anterior cobre do dia 1 do mês passado ao dia 1 deste mês', () => {
    const now = new Date()
    const { from, to } = resolvePeriodoRange('mes_anterior')
    expect(new Date(from).getMonth()).toBe((now.getMonth() + 11) % 12)
    expect(new Date(to).getDate()).toBe(1)
  })

  it('ultimos_30_dias cobre exatamente 30 dias', () => {
    const { from, to } = resolvePeriodoRange('ultimos_30_dias')
    const days = (new Date(to).getTime() - new Date(from).getTime()) / 86400_000
    expect(days).toBe(30)
  })
})

describe('resolveGranularidade', () => {
  it('período de 7 dias agrupa por dia', () => {
    expect(resolveGranularidade('2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z')).toBe('day')
  })

  it('período de exatamente 31 dias ainda agrupa por dia', () => {
    expect(resolveGranularidade('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')).toBe('day')
  })

  it('período maior que 31 dias agrupa por mês', () => {
    expect(resolveGranularidade('2026-01-01T00:00:00Z', '2026-03-05T00:00:00Z')).toBe('month')
  })
})
```

- [ ] **Step 4: Rodar os testes novos**

```bash
npx vitest run lib/services/financeiro-periodo.test.ts
```

Expected: PASS, 7 testes.

- [ ] **Step 5: Fazer `FinanceiroSellerGate.tsx` escapar do card externo só na Visão geral**

`FinanceiroSellerGate` é um Client Component (já usa `usePathname()` internamente, linha 60) — ele mesmo decide quando pular o card externo, computando isso a partir do `pathname` que já lê, sem precisar de prop nova nem de nenhuma mudança no Server Component que o chama (`app/dashboard/financeiro/layout.tsx`, que não é tocado por esta task).

Antes (linhas 175-180):
```typescript
      <div
        className="rounded-2xl border p-6"
        style={{ background: colors.card, borderColor: colors.border, boxShadow: shadows.card }}
      >
        {children}
      </div>
    </div>
  )
}
```

Depois:
```typescript
      {/* Visão geral (Task 3) monta suas próprias seções direto no fundo
          da página — as outras 4 abas continuam exatamente como estão,
          dentro do card externo. */}
      {pathname === '/dashboard/financeiro' ? (
        children
      ) : (
        <div
          className="rounded-2xl border p-6"
          style={{ background: colors.card, borderColor: colors.border, boxShadow: shadows.card }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
```

A interface `Props` e a assinatura de `FinanceiroSellerGate` não mudam — `pathname` já está em escopo (`const pathname = usePathname()`, linha 60, não tocada).

- [ ] **Step 6: Criar `app/dashboard/financeiro/FiltrosPeriodo.tsx`**

```tsx
'use client'

import { colors } from '@/lib/design-tokens'
import { PERIODO_LABEL, type PeriodoPreset } from '@/lib/services/financeiro-periodo'

export interface AppOption {
  application_id:   string
  application_name: string
}

interface Props {
  preset:          PeriodoPreset
  onPresetChange:  (preset: PeriodoPreset) => void
  customFrom:      string
  customTo:        string
  onCustomChange:  (from: string, to: string) => void
  apps:            AppOption[]
  applicationId:   string
  onAppChange:     (id: string) => void
}

const PRESETS: PeriodoPreset[] = ['este_mes', 'mes_anterior', 'ultimos_30_dias', 'personalizado']

export default function FiltrosPeriodo({
  preset, onPresetChange, customFrom, customTo, onCustomChange, apps, applicationId, onAppChange,
}: Props) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
      <div>
        <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Período</label>
        <select
          value={preset}
          onChange={e => onPresetChange(e.target.value as PeriodoPreset)}
          className="h-9 rounded-lg border px-3 text-sm"
          style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
          aria-label="Período"
        >
          {PRESETS.map(p => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
        </select>
      </div>

      {preset === 'personalizado' && (
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>De</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => onCustomChange(e.target.value, customTo)}
              className="h-9 rounded-lg border px-3 text-sm"
              style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
              aria-label="Data inicial"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Até</label>
            <input
              type="date"
              value={customTo}
              onChange={e => onCustomChange(customFrom, e.target.value)}
              className="h-9 rounded-lg border px-3 text-sm"
              style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
              aria-label="Data final"
            />
          </div>
        </div>
      )}

      {apps.length > 1 && (
        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Aplicativo</label>
          <select
            value={applicationId}
            onChange={e => onAppChange(e.target.value)}
            className="h-9 rounded-lg border px-3 text-sm"
            style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
            aria-label="Filtrar por aplicativo"
          >
            <option value="">Todos os apps</option>
            {apps.map(a => (
              <option key={a.application_id} value={a.application_id}>{a.application_name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json app/dashboard/financeiro/FinanceiroSellerGate.tsx lib/services/financeiro-periodo.ts lib/services/financeiro-periodo.test.ts app/dashboard/financeiro/FiltrosPeriodo.tsx
git commit -m "feat: Recharts + prop bare + filtros compartilhados de período/app"
```

---

### Task 3: `page.tsx` + `VisaoGeralClient.tsx` — cabeçalho, Resultados do período, Saldos atuais

**Files:**
- Modify: `app/dashboard/financeiro/page.tsx`
- Create: `app/dashboard/financeiro/VisaoGeralClient.tsx`

**Interfaces:**
- Consumes: `resolvePeriodoRange`/`resolveGranularidade`/`PeriodoPreset` (Task 2), `<FiltrosPeriodo>` (Task 2), `get_partner_sold_apps` (RPC já existente), `get_partner_financeiro_overview` (RPC já existente), `get_partner_financeiro_periodo_resumo` (Task 1).
- Produces: `VisaoGeralClient` com estado de filtro (`preset`, `customFrom/To`, `applicationId`) e dados buscados — consumido/estendido pelas Tasks 4, 5, 6 (cada uma adiciona sua seção e, quando precisar, seu próprio fetch, no MESMO componente — ver notas de cada task).

- [ ] **Step 1: Reescrever `page.tsx`**

Antes (arquivo inteiro — 71 linhas, card único de 6 indicadores):
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

interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroVisaoGeralPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  const { data, error } = await supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }) as unknown as { data: OverviewRow[] | null; error: unknown }

  if (error) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-bold" style={{ color: colors.text }}>Visão geral</h2>
        <p className="text-sm" style={{ color: colors.textSecondary }}>Não foi possível carregar seus indicadores financeiros. Tente novamente em instantes.</p>
      </div>
    )
  }

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

Depois (arquivo inteiro):
```tsx
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import VisaoGeralClient from './VisaoGeralClient'

export const metadata: Metadata = { title: 'Vendas e financeiro | LOBBY', robots: { index: false, follow: false } }

interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroVisaoGeralPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  // Apps pro filtro — mesma RPC já usada pela aba Vendas, lida aqui no
  // servidor só pra montar a lista inicial (o client refaz as próprias
  // buscas financeiras ao trocar período/app, mesmo padrão de
  // VendasClient.tsx).
  const { data: soldApps } = await supabase.rpc('get_partner_sold_apps', { p_partner_id: partnerId }) as unknown as { data: { application_id: string; application_name: string }[] | null }

  return <VisaoGeralClient partnerId={partnerId} apps={soldApps ?? []} userId={user.id} />
}
```

- [ ] **Step 2: Criar `VisaoGeralClient.tsx` (versão desta task — cabeçalho, Resultados do período, Saldos atuais)**

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import { resolvePeriodoRange, type PeriodoPreset } from '@/lib/services/financeiro-periodo'
import FiltrosPeriodo, { type AppOption } from './FiltrosPeriodo'

interface ResumoRow {
  vendas_confirmadas_valor: number
  vendas_confirmadas_qtd:   number
  comissao_valor:           number
  reembolsos_valor:         number
  reembolsos_qtd:           number
  participacao_valor:       number
}

const EMPTY_RESUMO: ResumoRow = {
  vendas_confirmadas_valor: 0, vendas_confirmadas_qtd: 0, comissao_valor: 0,
  reembolsos_valor: 0, reembolsos_qtd: 0, participacao_valor: 0,
}

interface OverviewRow {
  retido_amount:         number
  elegivel_amount:       number
  repassado_amount:      number
  reserva_retida_amount: number
}

const EMPTY_OVERVIEW: OverviewRow = { retido_amount: 0, elegivel_amount: 0, repassado_amount: 0, reserva_retida_amount: 0 }

interface Props {
  partnerId: string | null
  apps:      AppOption[]
  userId:    string
}

export default function VisaoGeralClient({ partnerId, apps, userId: _userId }: Props) {
  const [preset, setPreset] = useState<PeriodoPreset>('este_mes')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [applicationId, setApplicationId] = useState('')

  const [resumo, setResumo] = useState<ResumoRow>(EMPTY_RESUMO)
  const [overview, setOverview] = useState<OverviewRow>(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [resumoError, setResumoError] = useState(false)
  const [overviewError, setOverviewError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const range = useMemo(() => resolvePeriodoRange(preset, customFrom, customTo), [preset, customFrom, customTo])

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [resumoRes, overviewRes] = await Promise.all([
      supabase.rpc('get_partner_financeiro_periodo_resumo', {
        p_from: range.from, p_to: range.to,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
    ]) as unknown as [{ data: ResumoRow[] | null; error: unknown }, { data: OverviewRow[] | null; error: unknown }]

    setResumoError(!!resumoRes.error)
    setResumo(resumoRes.data?.[0] ?? EMPTY_RESUMO)
    setOverviewError(!!overviewRes.error)
    setOverview(overviewRes.data?.[0] ?? EMPTY_OVERVIEW)

    if (!resumoRes.error && !overviewRes.error) setLastUpdated(new Date())
    setLoading(false)
  }, [range, applicationId, partnerId])

  useEffect(() => { load() }, [load])

  const periodoCards = [
    {
      label: 'Vendas confirmadas', value: resumo.vendas_confirmadas_valor,
      sub: `${resumo.vendas_confirmadas_qtd} venda${resumo.vendas_confirmadas_qtd === 1 ? '' : 's'}`,
      explicacao: 'Valor pago, vendas confirmadas no período selecionado.', color: colors.text,
    },
    {
      label: 'Comissão da plataforma', value: resumo.comissao_valor,
      sub: 'Comissão LOBBY sobre as vendas acima.', explicacao: '', color: '#6D28D9',
    },
    {
      label: 'Reembolsos', value: resumo.reembolsos_valor,
      sub: `${resumo.reembolsos_qtd} reembolso${resumo.reembolsos_qtd === 1 ? '' : 's'}`,
      explicacao: 'Reembolsos efetuados no período selecionado.', color: '#EF4444',
    },
    {
      label: 'Sua participação', value: resumo.participacao_valor,
      sub: 'Valor de venda menos a comissão da plataforma.',
      explicacao: 'Não é lucro — ainda não desconta custos próprios do parceiro.', color: colors.primary,
    },
  ]

  return (
    <div style={{ background: colors.backgroundAlt }} className="-m-6 min-h-screen p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: colors.text }}>Visão geral</h2>
          {lastUpdated && (
            <p className="mt-0.5 text-xs" style={{ color: colors.textMuted }}>
              Última atualização: {formatDateBR(lastUpdated.toISOString().slice(0, 10))} {lastUpdated.toTimeString().slice(0, 5)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Atualizar
        </button>
      </div>

      <FiltrosPeriodo
        preset={preset} onPresetChange={setPreset}
        customFrom={customFrom} customTo={customTo}
        onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t) }}
        apps={apps} applicationId={applicationId} onAppChange={setApplicationId}
      />

      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Resultados do período</p>
      {resumoError ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444', color: colors.text }}>
          Não foi possível carregar os resultados do período.
          <button onClick={() => load()} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {periodoCards.map(c => (
            <div key={c.label} className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
              <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>{c.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: c.color }}>{formatCurrencyBRL(c.value)}</p>
              <p className="mt-0.5 text-[11px]" style={{ color: colors.textMuted }}>{c.sub}</p>
              {c.explicacao && <p className="mt-1 text-[11px]" style={{ color: colors.textMuted }}>{c.explicacao}</p>}
            </div>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Saldos atuais</p>
      {overviewError ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444', color: colors.text }}>
          Não foi possível carregar os saldos atuais.
          <button onClick={() => load()} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border-2 p-4" style={{ borderColor: colors.primary, background: `${colors.primary}0D`, boxShadow: shadows.card }}>
            <p className="text-xs font-semibold" style={{ color: colors.primary }}>Disponível para repasse</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: colors.primary }}>{formatCurrencyBRL(overview.elegivel_amount)}</p>
            <Link href={`/dashboard/financeiro/repasses${partnerId ? `?parceiro=${partnerId}` : ''}`} className="mt-1 inline-block text-[11px] font-semibold" style={{ color: colors.primary }}>
              Ver repasses →
            </Link>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
            <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>Em retenção</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: '#F59E0B' }}>{formatCurrencyBRL(overview.retido_amount)}</p>
            <p className="mt-0.5 text-[11px]" style={{ color: colors.textMuted }}>Dentro do período de retenção.</p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
            <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>Reserva de segurança</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: '#6D28D9' }}>{formatCurrencyBRL(overview.reserva_retida_amount)}</p>
            <p className="mt-0.5 text-[11px]" style={{ color: colors.textMuted }}>Liberada em até 120 dias sem disputa.</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Nota de implementação:** o `-m-6 p-6` no container raiz compensa o padding do card externo de `FinanceiroSellerGate.tsx` que esta página não usa mais (ela mesma decide isso internamente via `pathname`, Task 2 Step 5 — nenhuma prop nova, nenhuma mudança em `layout.tsx`) — confirmar visualmente contra o espaçamento real das outras abas (que ficam dentro do card com `p-6`) antes de fechar a task; ajustar o valor se o padding real do gate mudar.

- [ ] **Step 3: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/financeiro/page.tsx app/dashboard/financeiro/VisaoGeralClient.tsx
git commit -m "feat: Visão geral — cabeçalho, filtros, Resultados do período e Saldos atuais"
```

---

### Task 4: Gráfico de evolução + Próximas liberações

**Files:**
- Modify: `app/dashboard/financeiro/VisaoGeralClient.tsx`
- Create: `app/dashboard/financeiro/EvolucaoChart.tsx`
- Create: `app/dashboard/financeiro/ProximasLiberacoes.tsx`

**Interfaces:**
- Consumes: `get_partner_financeiro_periodo_serie` (Task 1), `get_partner_payout_queue_main`/`_reserve` (já existentes), `resolveGranularidade` (Task 2).
- Produces: `<EvolucaoChart>`, `<ProximasLiberacoes>` — consumidos só por `VisaoGeralClient.tsx`.

- [ ] **Step 1: Criar `EvolucaoChart.tsx`**

```tsx
'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface SerieBucket {
  bucket:             string
  vendas_valor:       number
  participacao_valor: number
}

interface Props {
  data:          SerieBucket[]
  granularidade: 'day' | 'month'
  loading:       boolean
  error:         boolean
  onRetry:       () => void
}

function formatBucketLabel(bucket: string, granularidade: 'day' | 'month'): string {
  if (granularidade === 'month') {
    const [year, month] = bucket.split('-')
    return `${month}/${year}`
  }
  return formatDateBR(bucket)
}

export default function EvolucaoChart({ data, granularidade, loading, error, onRetry }: Props) {
  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl" style={{ background: colors.borderLight }} />
  }
  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border text-sm" style={{ borderColor: '#EF4444', color: colors.text }}>
        Não foi possível carregar o gráfico.
        <button onClick={onRetry} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
      </div>
    )
  }
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border text-sm" style={{ borderColor: colors.border, color: colors.textSecondary }}>
        Suas vendas aparecerão aqui.
      </div>
    )
  }

  const chartData = data.map(d => ({ ...d, label: formatBucketLabel(d.bucket, granularidade) }))

  return (
    <div>
      <div style={{ width: '100%', height: 256 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.borderLight} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.textMuted }} />
            <YAxis tick={{ fontSize: 11, fill: colors.textMuted }} tickFormatter={v => formatCurrencyBRL(v)} width={90} />
            <Tooltip
              formatter={(value: number) => formatCurrencyBRL(value)}
              labelStyle={{ color: colors.text }}
              contentStyle={{ borderRadius: 8, borderColor: colors.border }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="vendas_valor" name="Vendas confirmadas" stroke={colors.text} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="participacao_valor" name="Sua participação" stroke={colors.primary} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold" style={{ color: colors.textSecondary }}>Ver dados em tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: colors.textSecondary }}>
                <th className="pb-1 pr-3 font-semibold">Data</th>
                <th className="pb-1 pr-3 font-semibold">Vendas</th>
                <th className="pb-1 font-semibold">Sua participação</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map(d => (
                <tr key={d.bucket} className="border-t" style={{ borderColor: colors.borderLight }}>
                  <td className="py-1 pr-3" style={{ color: colors.text }}>{d.label}</td>
                  <td className="py-1 pr-3 tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(d.vendas_valor)}</td>
                  <td className="py-1 tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(d.participacao_valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
```

- [ ] **Step 2: Criar `ProximasLiberacoes.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface LiberacaoRow {
  sale_id:          string
  application_name: string
  plan_name:        string
  net_amount:       number
  release_date:     string
  days_remaining:   number
  tipo:             'retencao' | 'reserva'
}

interface Props {
  rows:      LiberacaoRow[]
  loading:   boolean
  error:     boolean
  onRetry:   () => void
  partnerId: string | null
}

export default function ProximasLiberacoes({ rows, loading, error, onRetry, partnerId }: Props) {
  const top = rows.slice(0, 5)

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
      <p className="mb-3 text-sm font-bold" style={{ color: colors.text }}>Próximas liberações</p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: colors.text }}>
          Não foi possível carregar.
          <button onClick={onRetry} className="rounded-lg border px-2 py-1 font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : top.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhuma liberação prevista.</p>
      ) : (
        <div className="space-y-2">
          {top.map(r => (
            <div key={`${r.sale_id}-${r.tipo}`} className="rounded-lg border p-2.5" style={{ borderColor: colors.borderLight }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold" style={{ color: colors.text }}>{r.application_name} — {r.plan_name}</p>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: r.tipo === 'reserva' ? '#6D28D9' : '#F59E0B', background: r.tipo === 'reserva' ? '#6D28D91A' : '#F59E0B1A' }}>
                  {r.tipo === 'reserva' ? 'Reserva' : 'Retenção'}
                </span>
              </div>
              <p className="mt-0.5 text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                {formatCurrencyBRL(r.net_amount)} · {r.days_remaining <= 0 ? 'Disponível agora' : `Disponível em ${r.days_remaining} dia${r.days_remaining === 1 ? '' : 's'}`}
              </p>
              <p className="text-[11px]" style={{ color: colors.textMuted }}>Previsão de liberação: {formatDateBR(r.release_date.slice(0, 10))}</p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px]" style={{ color: colors.textMuted }}>
        Liberado do saldo — o repasse em si é feito pelo time LOBBY.
      </p>
      <Link href={`/dashboard/financeiro/repasses${partnerId ? `?parceiro=${partnerId}` : ''}`} className="mt-1 inline-block text-xs font-semibold" style={{ color: colors.primary }}>
        Ver todas as liberações →
      </Link>
    </div>
  )
}
```

- [ ] **Step 3: Estender `VisaoGeralClient.tsx` — importar os 2 componentes, buscar os dados, renderizar lado a lado**

Adicionar aos imports do topo:
```typescript
import EvolucaoChart, { type SerieBucket } from './EvolucaoChart'
import ProximasLiberacoes, { type LiberacaoRow } from './ProximasLiberacoes'
import { resolveGranularidade } from '@/lib/services/financeiro-periodo'
```

Adicionar estado (junto aos outros `useState` já existentes):
```typescript
  const [serie, setSerie] = useState<SerieBucket[]>([])
  const [serieError, setSerieError] = useState(false)
  const [liberacoes, setLiberacoes] = useState<LiberacaoRow[]>([])
  const [liberacoesError, setLiberacoesError] = useState(false)
```

No `load` (dentro do `Promise.all`, adicionando as 2 novas chamadas às 2 já existentes — a função inteira fica assim):

Antes:
```typescript
  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [resumoRes, overviewRes] = await Promise.all([
      supabase.rpc('get_partner_financeiro_periodo_resumo', {
        p_from: range.from, p_to: range.to,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
    ]) as unknown as [{ data: ResumoRow[] | null; error: unknown }, { data: OverviewRow[] | null; error: unknown }]

    setResumoError(!!resumoRes.error)
    setResumo(resumoRes.data?.[0] ?? EMPTY_RESUMO)
    setOverviewError(!!overviewRes.error)
    setOverview(overviewRes.data?.[0] ?? EMPTY_OVERVIEW)

    if (!resumoRes.error && !overviewRes.error) setLastUpdated(new Date())
    setLoading(false)
  }, [range, applicationId, partnerId])
```

Depois:
```typescript
  const granularidade = useMemo(() => resolveGranularidade(range.from, range.to), [range])

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [resumoRes, overviewRes, serieRes, queueMainRes, queueReserveRes] = await Promise.all([
      supabase.rpc('get_partner_financeiro_periodo_resumo', {
        p_from: range.from, p_to: range.to,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_serie', {
        p_from: range.from, p_to: range.to, p_granularidade: granularidade,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_payout_queue_main', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_queue_reserve', { p_partner_id: partnerId }),
    ]) as unknown as [
      { data: ResumoRow[] | null; error: unknown },
      { data: OverviewRow[] | null; error: unknown },
      { data: SerieBucket[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
    ]

    setResumoError(!!resumoRes.error)
    setResumo(resumoRes.data?.[0] ?? EMPTY_RESUMO)
    setOverviewError(!!overviewRes.error)
    setOverview(overviewRes.data?.[0] ?? EMPTY_OVERVIEW)
    setSerieError(!!serieRes.error)
    setSerie(serieRes.data ?? [])

    setLiberacoesError(!!queueMainRes.error || !!queueReserveRes.error)
    const nameFilter = applicationId ? apps.find(a => a.application_id === applicationId)?.application_name : null
    const main: LiberacaoRow[] = (queueMainRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'retencao' as const }))
    const reserve: LiberacaoRow[] = (queueReserveRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'reserva' as const }))
    setLiberacoes([...main, ...reserve].sort((a, b) => a.days_remaining - b.days_remaining))

    if (!resumoRes.error && !overviewRes.error && !serieRes.error && !queueMainRes.error && !queueReserveRes.error) setLastUpdated(new Date())
    setLoading(false)
  }, [range, applicationId, partnerId, granularidade, apps])
```

**Nota de implementação:** o filtro de app em Saldos atuais/Próximas liberações é por correspondência de `application_name` (decisão #9 do spec) — confirmar que `apps` (prop recebida de `get_partner_sold_apps`) usa exatamente a mesma grafia de `application_name` que `get_partner_payout_queue_main/_reserve` retornam (ambas derivam de `ap.application_name`/join com `applications.name`, mesma fonte) antes de fechar a task.

Adicionar a seção no JSX, depois do bloco "Saldos atuais" já existente:
```tsx
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
          <p className="mb-3 text-sm font-bold" style={{ color: colors.text }}>Evolução das vendas</p>
          <EvolucaoChart data={serie} granularidade={granularidade} loading={loading} error={serieError} onRetry={load} />
        </div>
        <ProximasLiberacoes rows={liberacoes} loading={loading} error={liberacoesError} onRetry={load} partnerId={partnerId} />
      </div>
```

- [ ] **Step 4: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/financeiro/VisaoGeralClient.tsx app/dashboard/financeiro/EvolucaoChart.tsx app/dashboard/financeiro/ProximasLiberacoes.tsx
git commit -m "feat: Visão geral — gráfico de evolução e próximas liberações"
```

---

### Task 5: Últimas vendas + Desempenho por aplicativo

**Files:**
- Modify: `app/dashboard/financeiro/VisaoGeralClient.tsx`
- Create: `app/dashboard/financeiro/UltimasVendas.tsx`
- Create: `app/dashboard/financeiro/DesempenhoPorApp.tsx`

**Interfaces:**
- Consumes: `get_partner_financeiro_periodo_vendas`, `get_partner_financeiro_periodo_por_app` (Task 1).
- Produces: `<UltimasVendas>`, `<DesempenhoPorApp>` — consumidos só por `VisaoGeralClient.tsx`.

- [ ] **Step 1: Criar `UltimasVendas.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface VendaRow {
  sale_id:          string
  sale_kind:        'app_purchase' | 'subscription_invoice'
  application_name: string
  plan_name:        string
  amount:           number
  partner_amount:   number
  paid_at:          string
  payout_status:    'retido' | 'elegivel' | 'pago' | 'reembolsado'
}

const STATUS_STYLE: Record<VendaRow['payout_status'], { label: string; color: string }> = {
  retido:      { label: 'Retido',      color: '#F59E0B' },
  elegivel:    { label: 'Elegível',    color: colors.primary },
  pago:        { label: 'Pago',        color: '#10B981' },
  reembolsado: { label: 'Reembolsado', color: '#EF4444' },
}

interface Props {
  rows:      VendaRow[]
  loading:   boolean
  error:     boolean
  onRetry:   () => void
  partnerId: string | null
}

export default function UltimasVendas({ rows, loading, error, onRetry, partnerId }: Props) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: colors.text }}>Últimas vendas</p>
        <Link href={`/dashboard/financeiro/vendas${partnerId ? `?parceiro=${partnerId}` : ''}`} className="text-xs font-semibold" style={{ color: colors.primary }}>
          Ver todas as vendas →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: colors.text }}>
          Não foi possível carregar as vendas.
          <button onClick={onRetry} className="rounded-lg border px-2 py-1 font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Você ainda não tem vendas neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: colors.textSecondary }}>
                <th className="pb-2 pr-3 font-semibold">App / Plano</th>
                <th className="pb-2 pr-3 font-semibold">Data</th>
                <th className="pb-2 pr-3 font-semibold">Valor pago</th>
                <th className="pb-2 pr-3 font-semibold">Sua participação</th>
                <th className="pb-2 pr-3 font-semibold">Status</th>
                <th className="pb-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const status = STATUS_STYLE[r.payout_status]
                return (
                  <tr key={r.sale_id} className="border-t" style={{ borderColor: colors.borderLight }}>
                    <td className="py-2 pr-3" style={{ color: colors.text }}>{r.application_name} — {r.plan_name}</td>
                    <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{formatDateBR(r.paid_at.slice(0, 10))}</td>
                    <td className="py-2 pr-3 tabular-nums font-semibold" style={{ color: colors.text }}>{formatCurrencyBRL(r.amount)}</td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(r.partner_amount)}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: status.color, background: `${status.color}1A` }}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-2">
                      <Link href={`/dashboard/financeiro/vendas?venda=${r.sale_id}${partnerId ? `&parceiro=${partnerId}` : ''}`} className="text-[11px] font-semibold" style={{ color: colors.primary }}>
                        Ver detalhes
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Criar `DesempenhoPorApp.tsx`**

```tsx
'use client'

import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL } from '@/lib/finance'

export interface DesempenhoRow {
  application_id:           string
  application_name:         string
  vendas_confirmadas_qtd:   number
  vendas_confirmadas_valor: number
  participacao_valor:       number
}

interface Props {
  rows:          DesempenhoRow[]
  loading:       boolean
  error:         boolean
  onRetry:       () => void
  /** Oculta a seção quando só há 1 app ou um filtro de app já está
   *  ativo — o número já está visível nos cards de Resultados do
   *  período, um ranking de 1 item só repetiria essa mesma informação. */
  hidden:        boolean
}

export default function DesempenhoPorApp({ rows, loading, error, onRetry, hidden }: Props) {
  if (hidden) return null

  return (
    <div className="mb-6 rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
      <p className="mb-3 text-sm font-bold" style={{ color: colors.text }}>Desempenho por aplicativo</p>
      <p className="mb-3 text-[11px]" style={{ color: colors.textMuted }}>Ordenado por valor vendido no período.</p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: colors.text }}>
          Não foi possível carregar.
          <button onClick={onRetry} className="rounded-lg border px-2 py-1 font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhuma venda neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: colors.textSecondary }}>
                <th className="pb-2 pr-3 font-semibold">Aplicativo</th>
                <th className="pb-2 pr-3 font-semibold">Vendas</th>
                <th className="pb-2 pr-3 font-semibold">Valor vendido</th>
                <th className="pb-2 font-semibold">Sua participação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.application_id} className="border-t" style={{ borderColor: colors.borderLight }}>
                  <td className="py-2 pr-3" style={{ color: colors.text }}>{r.application_name}</td>
                  <td className="py-2 pr-3 tabular-nums" style={{ color: colors.textSecondary }}>{r.vendas_confirmadas_qtd}</td>
                  <td className="py-2 pr-3 tabular-nums font-semibold" style={{ color: colors.text }}>{formatCurrencyBRL(r.vendas_confirmadas_valor)}</td>
                  <td className="py-2 tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(r.participacao_valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Estender `VisaoGeralClient.tsx`**

Adicionar aos imports:
```typescript
import UltimasVendas, { type VendaRow } from './UltimasVendas'
import DesempenhoPorApp, { type DesempenhoRow } from './DesempenhoPorApp'
```

Adicionar estado:
```typescript
  const [vendas, setVendas] = useState<VendaRow[]>([])
  const [vendasError, setVendasError] = useState(false)
  const [desempenho, setDesempenho] = useState<DesempenhoRow[]>([])
  const [desempenhoError, setDesempenhoError] = useState(false)
```

Substituir o `load` inteiro (o da Task 4, com 5 chamadas) por esta versão com 7:

Antes (`load` como ficou ao final da Task 4):
```typescript
  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [resumoRes, overviewRes, serieRes, queueMainRes, queueReserveRes] = await Promise.all([
      supabase.rpc('get_partner_financeiro_periodo_resumo', {
        p_from: range.from, p_to: range.to,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_serie', {
        p_from: range.from, p_to: range.to, p_granularidade: granularidade,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_payout_queue_main', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_queue_reserve', { p_partner_id: partnerId }),
    ]) as unknown as [
      { data: ResumoRow[] | null; error: unknown },
      { data: OverviewRow[] | null; error: unknown },
      { data: SerieBucket[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
    ]

    setResumoError(!!resumoRes.error)
    setResumo(resumoRes.data?.[0] ?? EMPTY_RESUMO)
    setOverviewError(!!overviewRes.error)
    setOverview(overviewRes.data?.[0] ?? EMPTY_OVERVIEW)
    setSerieError(!!serieRes.error)
    setSerie(serieRes.data ?? [])

    setLiberacoesError(!!queueMainRes.error || !!queueReserveRes.error)
    const nameFilter = applicationId ? apps.find(a => a.application_id === applicationId)?.application_name : null
    const main: LiberacaoRow[] = (queueMainRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'retencao' as const }))
    const reserve: LiberacaoRow[] = (queueReserveRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'reserva' as const }))
    setLiberacoes([...main, ...reserve].sort((a, b) => a.days_remaining - b.days_remaining))

    if (!resumoRes.error && !overviewRes.error && !serieRes.error && !queueMainRes.error && !queueReserveRes.error) setLastUpdated(new Date())
    setLoading(false)
  }, [range, applicationId, partnerId, granularidade, apps])
```

Depois:
```typescript
  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [resumoRes, overviewRes, serieRes, queueMainRes, queueReserveRes, vendasRes, desempenhoRes] = await Promise.all([
      supabase.rpc('get_partner_financeiro_periodo_resumo', {
        p_from: range.from, p_to: range.to,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_serie', {
        p_from: range.from, p_to: range.to, p_granularidade: granularidade,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_payout_queue_main', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_queue_reserve', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_vendas', {
        p_from: range.from, p_to: range.to, p_application_id: applicationId || null,
        p_limit: 5, p_offset: 0, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_periodo_por_app', {
        p_from: range.from, p_to: range.to, p_partner_id: partnerId,
      }),
    ]) as unknown as [
      { data: ResumoRow[] | null; error: unknown },
      { data: OverviewRow[] | null; error: unknown },
      { data: SerieBucket[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: VendaRow[] | null; error: unknown },
      { data: DesempenhoRow[] | null; error: unknown },
    ]

    setResumoError(!!resumoRes.error)
    setResumo(resumoRes.data?.[0] ?? EMPTY_RESUMO)
    setOverviewError(!!overviewRes.error)
    setOverview(overviewRes.data?.[0] ?? EMPTY_OVERVIEW)
    setSerieError(!!serieRes.error)
    setSerie(serieRes.data ?? [])

    setLiberacoesError(!!queueMainRes.error || !!queueReserveRes.error)
    const nameFilter = applicationId ? apps.find(a => a.application_id === applicationId)?.application_name : null
    const main: LiberacaoRow[] = (queueMainRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'retencao' as const }))
    const reserve: LiberacaoRow[] = (queueReserveRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'reserva' as const }))
    setLiberacoes([...main, ...reserve].sort((a, b) => a.days_remaining - b.days_remaining))

    setVendasError(!!vendasRes.error)
    setVendas(vendasRes.data ?? [])
    setDesempenhoError(!!desempenhoRes.error)
    setDesempenho(desempenhoRes.data ?? [])

    if (!resumoRes.error && !overviewRes.error && !serieRes.error && !queueMainRes.error && !queueReserveRes.error && !vendasRes.error && !desempenhoRes.error) {
      setLastUpdated(new Date())
    }
    setLoading(false)
  }, [range, applicationId, partnerId, granularidade, apps])
```

Adicionar ao JSX, depois do bloco gráfico+liberações:
```tsx
      <div className="mb-6">
        <UltimasVendas rows={vendas} loading={loading} error={vendasError} onRetry={load} partnerId={partnerId} />
      </div>

      <DesempenhoPorApp
        rows={desempenho} loading={loading} error={desempenhoError} onRetry={load}
        hidden={apps.length <= 1 || !!applicationId}
      />
```

- [ ] **Step 4: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/financeiro/VisaoGeralClient.tsx app/dashboard/financeiro/UltimasVendas.tsx app/dashboard/financeiro/DesempenhoPorApp.tsx
git commit -m "feat: Visão geral — últimas vendas e desempenho por aplicativo"
```

---

### Task 6: Pendências e avisos

**Files:**
- Modify: `app/dashboard/financeiro/VisaoGeralClient.tsx`
- Create: `app/dashboard/financeiro/PendenciasAvisos.tsx`

**Interfaces:**
- Consumes: `get_partner_financeiro_pendencias` (Task 1).
- Produces: `<PendenciasAvisos>` — consumido só por `VisaoGeralClient.tsx`.

- [ ] **Step 1: Criar `PendenciasAvisos.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface PendenciasRow {
  recebimento_incompleto:    boolean
  repasse_revertido_recente: boolean
  repasse_revertido_motivo:  string | null
  repasse_revertido_valor:   number | null
  repasse_revertido_em:      string | null
  valor_bloqueado_disputa:   number
  disputas_abertas_qtd:      number
}

interface Aviso {
  titulo:  string
  impacto: string
  acao:    string
  href:    string
}

function buildAvisos(p: PendenciasRow, partnerId: string | null): Aviso[] {
  const avisos: Aviso[] = []
  const parceiroQuery = partnerId ? `?parceiro=${partnerId}` : ''

  if (p.recebimento_incompleto) {
    avisos.push({
      titulo: 'Configuração de recebimento incompleta',
      impacto: 'Sem uma chave PIX cadastrada, seus repasses não podem ser enviados quando ficarem disponíveis.',
      acao: 'Completar cadastro',
      href: `/dashboard/financeiro/configuracoes${parceiroQuery}`,
    })
  }

  if (p.repasse_revertido_recente) {
    const quando = p.repasse_revertido_em ? ` em ${formatDateBR(p.repasse_revertido_em.slice(0, 10))}` : ''
    const valor = p.repasse_revertido_valor != null ? `${formatCurrencyBRL(p.repasse_revertido_valor)} — ` : ''
    avisos.push({
      titulo: `Um repasse seu foi revertido${quando}`,
      impacto: p.repasse_revertido_motivo ? `${valor}motivo: ${p.repasse_revertido_motivo}` : 'Um repasse já confirmado foi desfeito.',
      acao: 'Ver repasses e extrato',
      href: `/dashboard/financeiro/repasses${parceiroQuery}`,
    })
  }

  if (p.disputas_abertas_qtd > 0) {
    avisos.push({
      titulo: `${formatCurrencyBRL(p.valor_bloqueado_disputa)} bloqueado${p.disputas_abertas_qtd > 1 ? 's' : ''} por disputa`,
      impacto: `${p.disputas_abertas_qtd} compra${p.disputas_abertas_qtd > 1 ? 's' : ''} em disputa — o valor fica retido até a resolução, fora das filas normais de repasse.`,
      acao: 'Falar com o suporte',
      href: '/dashboard/suporte',
    })
  }

  return avisos
}

interface Props {
  data:    PendenciasRow | null
  loading: boolean
  error:   boolean
  onRetry: () => void
  partnerId: string | null
}

export default function PendenciasAvisos({ data, loading, error, onRetry, partnerId }: Props) {
  if (loading) return null

  if (error) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border p-3 text-xs" style={{ borderColor: '#EF4444', color: colors.text }}>
        <AlertTriangle size={14} style={{ color: '#EF4444' }} aria-hidden="true" />
        Dados financeiros temporariamente indisponíveis pra pendências.
        <button onClick={onRetry} className="rounded-lg border px-2 py-1 font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
      </div>
    )
  }

  if (!data) return null
  const avisos = buildAvisos(data, partnerId)
  if (avisos.length === 0) return null

  return (
    <div className="mb-6 space-y-2">
      {avisos.map(a => (
        <div key={a.titulo} className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: '#F59E0B', background: '#F59E0B0D' }}>
          <AlertTriangle size={16} style={{ color: '#F59E0B', marginTop: 2 }} aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: colors.text }}>{a.titulo}</p>
            <p className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>{a.impacto}</p>
            <Link href={a.href} className="mt-1 inline-block text-xs font-semibold" style={{ color: colors.primary }}>
              {a.acao} →
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Estender `VisaoGeralClient.tsx`**

Adicionar import:
```typescript
import PendenciasAvisos, { type PendenciasRow } from './PendenciasAvisos'
```

Adicionar estado:
```typescript
  const [pendencias, setPendencias] = useState<PendenciasRow | null>(null)
  const [pendenciasError, setPendenciasError] = useState(false)
```

Substituir o `load` inteiro (o da Task 5, com 7 chamadas) por esta versão com 8 — só o `Promise.all`/desestruturação/tipo mudam, o resto do corpo (os `set*` de `resumo` até `desempenho`) fica idêntico ao da Task 5:

Antes (assinatura do `Promise.all` e seu tipo, como ficaram ao final da Task 5):
```typescript
    const [resumoRes, overviewRes, serieRes, queueMainRes, queueReserveRes, vendasRes, desempenhoRes] = await Promise.all([
      supabase.rpc('get_partner_financeiro_periodo_resumo', {
        p_from: range.from, p_to: range.to,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_serie', {
        p_from: range.from, p_to: range.to, p_granularidade: granularidade,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_payout_queue_main', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_queue_reserve', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_vendas', {
        p_from: range.from, p_to: range.to, p_application_id: applicationId || null,
        p_limit: 5, p_offset: 0, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_periodo_por_app', {
        p_from: range.from, p_to: range.to, p_partner_id: partnerId,
      }),
    ]) as unknown as [
      { data: ResumoRow[] | null; error: unknown },
      { data: OverviewRow[] | null; error: unknown },
      { data: SerieBucket[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: VendaRow[] | null; error: unknown },
      { data: DesempenhoRow[] | null; error: unknown },
    ]
```

Depois:
```typescript
    const [resumoRes, overviewRes, serieRes, queueMainRes, queueReserveRes, vendasRes, desempenhoRes, pendenciasRes] = await Promise.all([
      supabase.rpc('get_partner_financeiro_periodo_resumo', {
        p_from: range.from, p_to: range.to,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_serie', {
        p_from: range.from, p_to: range.to, p_granularidade: granularidade,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_payout_queue_main', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_queue_reserve', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_vendas', {
        p_from: range.from, p_to: range.to, p_application_id: applicationId || null,
        p_limit: 5, p_offset: 0, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_periodo_por_app', {
        p_from: range.from, p_to: range.to, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_pendencias', { p_partner_id: partnerId }),
    ]) as unknown as [
      { data: ResumoRow[] | null; error: unknown },
      { data: OverviewRow[] | null; error: unknown },
      { data: SerieBucket[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: VendaRow[] | null; error: unknown },
      { data: DesempenhoRow[] | null; error: unknown },
      { data: PendenciasRow[] | null; error: unknown },
    ]
```

E, logo após o bloco `setDesempenho(desempenhoRes.data ?? [])` já existente (antes do `if (!resumoRes.error ...)` final), adicionar:
```typescript
    setPendenciasError(!!pendenciasRes.error)
    setPendencias(pendenciasRes.data?.[0] ?? null)
```

E estender a condição final de `setLastUpdated` pra incluir `!pendenciasRes.error`:

Antes:
```typescript
    if (!resumoRes.error && !overviewRes.error && !serieRes.error && !queueMainRes.error && !queueReserveRes.error && !vendasRes.error && !desempenhoRes.error) {
      setLastUpdated(new Date())
    }
```

Depois:
```typescript
    if (!resumoRes.error && !overviewRes.error && !serieRes.error && !queueMainRes.error && !queueReserveRes.error && !vendasRes.error && !desempenhoRes.error && !pendenciasRes.error) {
      setLastUpdated(new Date())
    }
```

Adicionar ao JSX, logo abaixo do cabeçalho/filtros e ANTES de "Resultados do período" (pendências aparecem primeiro, pra chamar atenção antes dos números):
```tsx
      <PendenciasAvisos data={pendencias} loading={loading} error={pendenciasError} onRetry={load} partnerId={partnerId} />
```

- [ ] **Step 3: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/financeiro/VisaoGeralClient.tsx app/dashboard/financeiro/PendenciasAvisos.tsx
git commit -m "feat: Visão geral — pendências e avisos"
```

---

### Task 7: Estados vazio/loading/erro finais + CTA adaptada

**Files:**
- Create: `app/dashboard/financeiro/loading.tsx`
- Modify: `app/dashboard/financeiro/page.tsx`
- Modify: `app/dashboard/financeiro/VisaoGeralClient.tsx`

**Interfaces:**
- Consumes: `app_drafts` (status/created_by, já usado em outras partes do dashboard pra decidir a CTA).
- Produces: nada consumido por outra task — fecha a Visão geral.

- [ ] **Step 1: Criar `app/dashboard/financeiro/loading.tsx`**

```tsx
export default function FinanceiroLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div>
        <div className="mb-1 h-6 w-40 rounded bg-[#E3E7F0]" />
        <div className="h-3 w-56 rounded bg-[#E3E7F0]" />
      </div>
      <div className="h-14 rounded-xl bg-[#E3E7F0]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-[#E3E7F0]" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-[#E3E7F0]" />)}
      </div>
      <div className="h-64 rounded-xl bg-[#E3E7F0]" />
    </div>
  )
}
```

- [ ] **Step 2: Estender `page.tsx` — determinar a CTA de estado vazio no servidor**

Adicionar, antes do `return` final:
```typescript
  // CTA adaptada pro estado "sem vendas" (seção 11 do pedido) — mesma
  // lógica de app_drafts por created_by/status já usada em
  // app/dashboard/meus-app/MeusAppsClient.tsx pra decidir "Continuar
  // cadastro" vs "Ver meus aplicativos".
  const { data: drafts } = await supabase
    .from('app_drafts')
    .select('id, status')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const latestDraft = drafts?.[0] ?? null
  const emptyStateCta = !latestDraft
    ? { label: 'Cadastrar meu aplicativo', href: '/dashboard/meus-app/novo' }
    : latestDraft.status !== 'published'
      ? { label: 'Continuar cadastro', href: `/dashboard/meus-app/novo/${latestDraft.id}/editar` }
      : { label: 'Ver meus aplicativos', href: '/dashboard/meus-app' }
```

E passar pro client:
```typescript
  return <VisaoGeralClient partnerId={partnerId} apps={soldApps ?? []} userId={user.id} emptyStateCta={emptyStateCta} />
```

- [ ] **Step 3: Estender `VisaoGeralClient.tsx` — prop + CTA de estado vazio real**

Adicionar à interface `Props`:
```typescript
  emptyStateCta: { label: string; href: string }
```

Adicionar à desestruturação dos parâmetros da função.

No JSX, depois do bloco "Resultados do período" (ou em qualquer ponto conveniente antes de "Últimas vendas"), adicionar a checagem de estado vazio real — vendas zeradas E sem erro E filtro não-personalizado (pra distinguir "sem vendas de verdade" de "filtro específico sem resultado", que usa "Limpar filtros" em vez da CTA de cadastro):

```tsx
      {!loading && !resumoError && resumo.vendas_confirmadas_qtd === 0 && (
        <div className="mb-6 rounded-xl border p-4 text-center" style={{ borderColor: colors.border, background: colors.card }}>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            {applicationId || preset === 'personalizado'
              ? 'Nenhuma venda encontrada com esse filtro.'
              : 'Você ainda não tem vendas registradas.'}
          </p>
          {applicationId || preset === 'personalizado' ? (
            <button
              onClick={() => { setApplicationId(''); setPreset('este_mes') }}
              className="mt-2 text-sm font-semibold"
              style={{ color: colors.primary }}
            >
              Limpar filtros
            </button>
          ) : (
            <Link href={emptyStateCta.href} className="mt-2 inline-block text-sm font-semibold" style={{ color: colors.primary }}>
              {emptyStateCta.label} →
            </Link>
          )}
        </div>
      )}
```

Confirmar que `resumo.vendas_confirmadas_qtd === 0` nunca é mostrado quando `resumoError` é `true` (checagem já inclui `!resumoError` explicitamente) — erro de consulta nunca vira R$ 0,00/estado vazio, conforme a seção 12 do pedido original.

- [ ] **Step 4: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/financeiro/loading.tsx app/dashboard/financeiro/page.tsx app/dashboard/financeiro/VisaoGeralClient.tsx
git commit -m "feat: Visão geral — loading.tsx e CTA de estado vazio adaptada"
```

---

### Task 8: Export CSV

**Files:**
- Create: `app/api/financeiro/export/route.ts`

**Interfaces:**
- Consumes: `csvSafe` (`lib/services/offers.ts`), `resolvePeriodoRange` (Task 2), as 5 RPCs novas (Task 1) + `get_partner_financeiro_overview` (já existente).
- Produces: nada consumido por outra task — é o fim da cadeia de dados.

- [ ] **Step 1: Criar a rota**

```typescript
// app/api/financeiro/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { csvSafe } from '@/lib/services/offers'
import { resolvePeriodoRange, PERIODO_LABEL, type PeriodoPreset } from '@/lib/services/financeiro-periodo'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

/**
 * Export da Visão geral — mesmo padrão csvSafe + Content-Disposition já
 * usado nos exports admin (ex: app/api/admin/offers/export/route.ts).
 * Reaproveita as mesmas RPCs que alimentam a tela — nenhum cálculo
 * exclusivo do arquivo.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()

  const sp = req.nextUrl.searchParams
  const preset = (sp.get('preset') as PeriodoPreset) || 'este_mes'
  const customFrom = sp.get('from')
  const customTo = sp.get('to')
  const applicationId = sp.get('application_id') || null
  const partnerId = sp.get('parceiro') || null
  const range = resolvePeriodoRange(preset, customFrom, customTo)

  const [resumoRes, overviewRes, vendasRes, appsRes] = await Promise.all([
    supabase.rpc('get_partner_financeiro_periodo_resumo', { p_from: range.from, p_to: range.to, p_application_id: applicationId, p_partner_id: partnerId }),
    supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
    supabase.rpc('get_partner_financeiro_periodo_vendas', { p_from: range.from, p_to: range.to, p_application_id: applicationId, p_limit: 1000, p_offset: 0, p_partner_id: partnerId }),
    applicationId ? supabase.rpc('get_partner_sold_apps', { p_partner_id: partnerId }) : Promise.resolve({ data: null, error: null }),
  ]) as unknown as [
    { data: { vendas_confirmadas_valor: number; vendas_confirmadas_qtd: number; comissao_valor: number; reembolsos_valor: number; reembolsos_qtd: number; participacao_valor: number }[] | null; error: unknown },
    { data: { retido_amount: number; elegivel_amount: number; repassado_amount: number; reserva_retida_amount: number }[] | null; error: unknown },
    { data: { sale_id: string; sale_kind: string; application_name: string; plan_name: string; amount: number; partner_amount: number; paid_at: string; payout_status: string }[] | null; error: unknown },
    { data: { application_id: string; application_name: string }[] | null; error: unknown },
  ]

  if (resumoRes.error || overviewRes.error || vendasRes.error) {
    return NextResponse.json({ error: 'Não foi possível gerar o relatório. Tente novamente.' }, { status: 500 })
  }

  const resumo = resumoRes.data?.[0]
  const overview = overviewRes.data?.[0]
  const vendas = vendasRes.data ?? []
  const appName = applicationId ? appsRes.data?.find(a => a.application_id === applicationId)?.application_name ?? applicationId : 'Todos'
  const now = new Date()

  const lines: string[] = []
  lines.push('# Relatório Vendas e financeiro — LOBBY')
  lines.push(`# Parceiro: ${csvSafe(profile?.full_name || profile?.email || user.id)}`)
  lines.push(`# Período: ${formatDateBR(range.from.slice(0, 10))} a ${formatDateBR(new Date(new Date(range.to).getTime() - 86400_000).toISOString().slice(0, 10))} (${PERIODO_LABEL[preset]})`)
  lines.push(`# Aplicativo: ${csvSafe(appName)}`)
  lines.push(`# Gerado em: ${formatDateBR(now.toISOString().slice(0, 10))} ${now.toTimeString().slice(0, 5)}`)
  lines.push('# Saldos atuais referem-se à data de geração, não ao período acima.')
  lines.push('')
  lines.push('RESULTADOS DO PERÍODO')
  lines.push('Indicador,Valor')
  lines.push(`Vendas confirmadas,${formatCurrencyBRL(resumo?.vendas_confirmadas_valor ?? 0)} (${resumo?.vendas_confirmadas_qtd ?? 0} vendas)`)
  lines.push(`Comissão da plataforma,${formatCurrencyBRL(resumo?.comissao_valor ?? 0)}`)
  lines.push(`Reembolsos,${formatCurrencyBRL(resumo?.reembolsos_valor ?? 0)} (${resumo?.reembolsos_qtd ?? 0})`)
  lines.push(`Sua participação,${formatCurrencyBRL(resumo?.participacao_valor ?? 0)}`)
  lines.push('')
  lines.push(`SALDOS ATUAIS (em ${formatDateBR(now.toISOString().slice(0, 10))})`)
  lines.push('Indicador,Valor')
  lines.push(`Disponível para repasse,${formatCurrencyBRL(overview?.elegivel_amount ?? 0)}`)
  lines.push(`Em retenção,${formatCurrencyBRL(overview?.retido_amount ?? 0)}`)
  lines.push(`Reserva de segurança,${formatCurrencyBRL(overview?.reserva_retida_amount ?? 0)}`)
  lines.push('')
  lines.push('VENDAS DO PERÍODO')
  lines.push(['App', 'Plano', 'Data', 'Valor pago', 'Sua participação', 'Status'].map(csvSafe).join(','))
  for (const v of vendas) {
    lines.push([
      v.application_name, v.plan_name, formatDateBR(v.paid_at.slice(0, 10)),
      formatCurrencyBRL(v.amount), formatCurrencyBRL(v.partner_amount), v.payout_status,
    ].map(csvSafe).join(','))
  }

  const csv = lines.join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendas-financeiro-${now.toISOString().slice(0, 10)}.csv"`,
    },
  })
}
```

- [ ] **Step 2: Ligar o botão "Exportar relatório" em `VisaoGeralClient.tsx`**

Adicionar, junto ao botão "Atualizar" já existente no cabeçalho:
```tsx
        <a
          href={`/api/financeiro/export?preset=${preset}${preset === 'personalizado' ? `&from=${customFrom}&to=${customTo}` : ''}${applicationId ? `&application_id=${applicationId}` : ''}${partnerId ? `&parceiro=${partnerId}` : ''}`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
          style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
        >
          Exportar relatório
        </a>
```

(Colocar ao lado do botão "Atualizar", dentro do mesmo `div` flex do cabeçalho — ajustar o `className` do container pra `gap-2` se precisar de espaço entre os dois botões.)

- [ ] **Step 3: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add app/api/financeiro/export/route.ts app/dashboard/financeiro/VisaoGeralClient.tsx
git commit -m "feat: export CSV da Visão geral de Vendas e financeiro"
```

---

### Task 9: `?venda=` em Vendas + verificação manual completa

**Files:**
- Modify: `app/dashboard/financeiro/vendas/page.tsx`
- Modify: `app/dashboard/financeiro/vendas/VendasClient.tsx`

**Interfaces:**
- Nenhuma produzida/consumida por outra task — fecha o fluxo "Ver detalhes" (decisão #5 do spec).

- [ ] **Step 1: Passar `?venda=` pro client**

Em `app/dashboard/financeiro/vendas/page.tsx`, ler o `searchParams` (já deve aceitar `parceiro`; adicionar `venda`) e passar como nova prop `focusSaleId` pro `VendasClient`.

Antes (trecho relevante — confirmar a forma exata lendo o arquivo real antes de editar, ele não foi lido nesta plan):
```typescript
interface SearchParams {
  parceiro?: string
}
```

Depois:
```typescript
interface SearchParams {
  parceiro?: string
  venda?:    string
}
```

E repassar `sp.venda ?? null` como prop `focusSaleId` pro `<VendasClient>`.

- [ ] **Step 2: `VendasClient.tsx` — auto-expandir a venda em foco**

Adicionar à interface `Props`:
```typescript
  focusSaleId?: string | null
```

Adicionar um `useEffect` que expande a linha quando `focusSaleId` está presente e a venda já foi carregada:
```typescript
  useEffect(() => {
    if (focusSaleId && sales.some(s => s.sale_id === focusSaleId)) {
      setExpandedId(focusSaleId)
    }
  }, [focusSaleId, sales])
```

**Nota de implementação:** se a venda em foco não estiver na página atual (ex: está numa página de paginação diferente, ou foi filtrada por app), ela simplesmente não expande — não é um erro, é um limite aceitável do padrão de paginação já existente (mesma limitação que "Ver todas as vendas" já tem hoje, não initroduzida por este deeplink). Não adicionar lógica de busca automática de página — fora de escopo.

- [ ] **Step 3: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/financeiro/vendas/page.tsx app/dashboard/financeiro/vendas/VendasClient.tsx
git commit -m "feat: Vendas aceita ?venda= pra abrir já expandida (link de 'Ver detalhes')"
```

- [ ] **Step 5: Verificação manual completa (navegador, contas de teste via service-role)**

Criar: parceiro com app publicado + plano; inserir via service-role linhas reais em `app_purchases` (e opcionalmente `subscription_invoices`/`subscriptions`) cobrindo: paga recente (retida), paga há mais de 16 dias (elegível), já coberta por um `partner_payout_items`+`partner_payouts.status='confirmado'` (paga), parcialmente reembolsada (`refunded_amount>0`, `refunded_at` dentro do período), `status='disputed'`, `reserve_status='held'`; um `partner_payouts` com `status='revertido'` recente; `profiles.payout_pix_key` nulo numa conta e preenchido noutra.

Checar: os 4 cards de Resultados do período batem com os dados inseridos pro período escolhido (trocar presets e conferir recálculo); Saldos atuais mostra os valores certos e não duplica nada; gráfico mostra os pontos certos, troca de granularidade ao escolher um período maior que 31 dias, estado vazio sem dado fictício; Próximas liberações lista retenção e reserva separadas com dias corretos; Últimas vendas + "Ver detalhes" abre a aba Vendas com a linha certa expandida; Desempenho por app aparece só com 2+ apps e sem filtro ativo; Pendências aparecem só quando reais (testar cada uma: pix nulo, revertido recente, disputa) e somem quando resolvidas; export CSV abre com as 3 seções rotuladas e os números batendo com a tela; delegação de equipe (`financeiro_visao_geral`, mesmo padrão da Etapa 8) funciona e nega corretamente sem a permissão; responsivo mobile/tablet/desktop; nenhuma escrita financeira disparada só por abrir a página ou clicar em "Atualizar"; `loading.tsx` aparece na primeira navegação; erro de RPC (simular revogando a permissão temporariamente ou um `p_partner_id` inválido) mostra "Tentar novamente" por seção, nunca vira R$ 0,00 silenciosamente.

Limpar todos os dados de teste ao final (purchases, invoices, subscriptions, payouts, drafts, plans, applications, profiles, auth users) — mesmo cuidado de toda etapa anterior.
