# Vendas e financeiro — Recebimento e atendimento (Etapa 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a lacuna de permissões de equipe no financeiro (5 capacidades granulares) — as 7 RPCs já em produção (Etapas 3-4) ganham um parâmetro opcional `p_partner_id` validado contra `app_team_members.permissions`, um seletor de "de quem estou vendo o financeiro" aparece quando relevante, e a sub-página Configurações de recebimento ganha dado real (leitura de PIX + link pra Conta + suporte).

**Architecture:** Migração única com `drop function` + `create function` nas 7 RPCs (assinatura muda, não dá pra `create or replace`) + 1 RPC nova (`get_financeiro_viewable_partners`). `TeamClient.tsx` ganha 5 checkboxes novos no array `PERMISSIONS` já existente. `FinanceiroSellerGate.tsx` (Etapa 2) ganha o seletor, lendo/escrevendo `?parceiro=<uuid>` via query param. As 3 páginas com RPC real (Visão geral, Vendas, Repasses) leem esse mesmo param e passam como `p_partner_id`.

**Tech Stack:** Next.js App Router (`searchParams: Promise<{...}>`, padrão já usado em `app/dashboard/meus-app/page.tsx`), Supabase Postgres, `lib/design-tokens.ts`, `lib/finance.ts`.

## Global Constraints

- Nenhuma RPC muda sua matemática/janela/arredondamento — só ganha o
  parâmetro `p_partner_id` e a checagem de autorização antes do corpo
  já existente, que fica **idêntico**, trocando toda referência direta
  a `auth.uid()` usada como filtro de dono por uma variável local
  (`v_partner_id`, já existia em `get_partner_financeiro_overview`,
  precisa ser adicionada nas outras 6).
- Assinatura muda (novo parâmetro) → **sempre `drop function` antes do
  `create function`** — `create or replace function` não aceita mudar
  a lista de parâmetros, mesma regra já seguida quando
  `create_partner_payout` ganhou parâmetros novos em migrações
  anteriores. Nunca usar `create or replace` nesta migração.
- Toda RPC redefinida recebe `revoke execute on function
  public.<nome>(<assinatura nova>) from public, anon, authenticated;`
  seguido do `grant ... to authenticated;` — mesmo padrão já
  estabelecido, com a assinatura nova (o `uuid` extra no final).
- A checagem de autorização é sempre a mesma forma: se
  `v_partner_id <> auth.uid()`, exige existir uma linha em
  `app_team_members` (join `app_drafts`) onde `tm.user_id = auth.uid()`,
  `d.created_by = v_partner_id`, e (`tm.role = 'owner'` OU a capacidade
  específica da RPC em `tm.permissions`) — senão `raise exception`. Cada
  RPC usa a capacidade do mapeamento abaixo, nunca uma genérica.
- `manage_finance`/`edit_app`/`respond_qa` (checkboxes já existentes em
  `TeamClient.tsx`) não são tocados, removidos nem reaproveitados pras
  5 capacidades novas — ficam exatamente como estão.
- `financeiro_ofertas`/`financeiro_configuracoes` são criadas como
  valores selecionáveis no convite, mas **não são checadas em RPC
  nenhuma** — reservadas pra quando essas 2 sub-páginas tiverem dado
  real.
- A sub-página Configurações de recebimento nunca lê `?parceiro=` —
  sempre mostra o PIX do próprio usuário logado.
- `npx tsc --noEmit` limpo e `npx vitest run` 100% passando (baseline
  398 testes) antes de cada commit.

---

### Task 1: RPCs com `p_partner_id` + RPC de parceiros visualizáveis (migração SQL)

**Files:**
- Create: `supabase/migrations/20261002140000_recebimento_atendimento_equipe.sql`

**Interfaces:**
- Produces: as 7 RPCs já existentes ganham um parâmetro final
  `p_partner_id uuid default null` (assinaturas antigas deixam de
  existir — ver tabela de `drop function` abaixo). Produces também
  `get_financeiro_viewable_partners()` → N linhas `{ partner_id,
  partner_label }`.
- Mapeamento RPC → capacidade exigida (usado no corpo da checagem):

| RPC | Assinatura antiga (pro `drop function`) | Capacidade |
|---|---|---|
| `get_partner_financeiro_overview` | `()` | `financeiro_visao_geral` |
| `get_partner_sold_apps` | `()` | `financeiro_vendas` |
| `get_partner_sales` | `(uuid, integer, integer)` | `financeiro_vendas` |
| `get_partner_sales_count` | `(uuid)` | `financeiro_vendas` |
| `get_partner_payout_queue_main` | `()` | `financeiro_repasses` |
| `get_partner_payout_queue_reserve` | `()` | `financeiro_repasses` |
| `get_partner_payout_history` | `()` | `financeiro_repasses` |

- [ ] **Step 1: Escrever a migração completa**

```sql
-- Etapa 5 do roadmap "Vendas e financeiro" — Recebimento e atendimento.
-- Fecha a lacuna documentada desde a Etapa 2 (FinanceiroSellerGate.tsx):
-- um membro de equipe nunca tinha como ver o financeiro do DONO do app
-- — as 7 RPCs das Etapas 3-4 não aceitavam nenhum parâmetro, de
-- propósito, pra impedir um parceiro consultar o de outro. Agora
-- aceitam p_partner_id (default null = o próprio usuário, comportamento
-- idêntico a antes), validado contra app_team_members.permissions antes
-- de liberar o dado de outra pessoa.
--
-- Toda assinatura muda (parâmetro novo) — create or replace function
-- NÃO aceita isso, precisa de drop function antes. Corpo de cada RPC
-- abaixo é idêntico ao já em produção, só com (a) a checagem de
-- autorização no início e (b) toda referência a auth.uid() usada como
-- filtro de dono trocada por v_partner_id.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_partner_financeiro_overview
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_financeiro_overview();

create function public.get_partner_financeiro_overview(p_partner_id uuid default null)
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
  v_partner_id    uuid := coalesce(p_partner_id, auth.uid());
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
  if v_partner_id <> auth.uid() then
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

  select coalesce(sum(si.partner_amount), 0)
  into v_tmp_amount
  from public.subscription_invoices si
  join public.subscriptions s on s.id = si.subscription_id
  where s.partner_id = v_partner_id
    and s.product_type = 'app_plan'
    and si.paid_at > now() - interval '16 days'
    and not exists (
      select 1 from public.partner_payout_items pi
      join public.partner_payouts po on po.id = pi.payout_id
      where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
    );
  v_retido := v_retido + v_tmp_amount;

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
    and s.product_type = 'app_plan'
    and si.paid_at <= now() - interval '16 days'
    and not exists (
      select 1 from public.partner_payout_items pi
      join public.partner_payouts po on po.id = pi.payout_id
      where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
    );
  v_elegivel := v_elegivel + v_tmp_amount;

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

  select coalesce(sum(
      ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2)
    ), 0)
  into v_reserva
  from public.app_purchases ap
  where ap.partner_id = v_partner_id
    and ap.status = 'paid'
    and ap.reserve_status = 'held';

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
    and s.product_type = 'app_plan'
    and si.paid_at >= v_month_start;

  v_vendas_count  := v_vendas_count + v_tmp_count;
  v_vendas_amount := v_vendas_amount + v_tmp_amount;

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

revoke execute on function public.get_partner_financeiro_overview(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_financeiro_overview(uuid) to authenticated;

comment on function public.get_partner_financeiro_overview(uuid) is
  'Os 6 indicadores agregados da Visão geral. p_partner_id default null = o próprio usuário; um valor diferente exige ser team member com role=owner ou financeiro_visao_geral em permissions, senão lança exceção.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_sold_apps
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_sold_apps();

create function public.get_partner_sold_apps(p_partner_id uuid default null)
returns table (application_id uuid, application_name text)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id <> auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_vendas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  select distinct on (x.application_id) x.application_id, x.application_name
  from (
    select ap.application_id as application_id, ap.application_name as application_name
    from public.app_purchases ap
    where ap.partner_id = v_partner_id and ap.status in ('paid', 'refunded')

    union all

    select d.application_id, a.name
    from public.subscriptions s
    join public.app_plans p on p.id = s.app_plan_id
    join public.app_drafts d on d.id = p.app_draft_id
    join public.applications a on a.id = d.application_id
    where s.partner_id = v_partner_id and s.product_type = 'app_plan' and d.application_id is not null
  ) x
  order by x.application_id, x.application_name;
end;
$$;

revoke execute on function public.get_partner_sold_apps(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_sold_apps(uuid) to authenticated;

comment on function public.get_partner_sold_apps(uuid) is
  'Apps distintos já vendidos. p_partner_id default null = o próprio usuário; mesma checagem de financeiro_vendas que get_partner_sales.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) get_partner_sales
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_sales(uuid, integer, integer);

create function public.get_partner_sales(
  p_application_id uuid default null,
  p_limit          integer default 50,
  p_offset         integer default 0,
  p_partner_id     uuid default null
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
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id <> auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_vendas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

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
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and ap.paid_at is not null
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
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and (p_application_id is null or d.application_id = p_application_id)
  ) combined
  order by combined.paid_at desc, combined.sale_id
  limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.get_partner_sales(uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_sales(uuid, integer, integer, uuid) to authenticated;

comment on function public.get_partner_sales(uuid, integer, integer, uuid) is
  'Lista paginada de vendas. p_partner_id default null = o próprio usuário; mesma checagem de financeiro_vendas que get_partner_sold_apps.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) get_partner_sales_count
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_sales_count(uuid);

create function public.get_partner_sales_count(p_application_id uuid default null, p_partner_id uuid default null)
returns integer
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_count integer;
begin
  if v_partner_id <> auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_vendas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  select count(*) into v_count
  from (
    select ap.id
    from public.app_purchases ap
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and (p_application_id is null or ap.application_id = p_application_id)

    union all

    select si.id
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and (p_application_id is null or d.application_id = p_application_id)
  ) combined;

  return v_count;
end;
$$;

revoke execute on function public.get_partner_sales_count(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_sales_count(uuid, uuid) to authenticated;

comment on function public.get_partner_sales_count(uuid, uuid) is
  'Contagem total pro mesmo filtro de get_partner_sales. p_partner_id default null = o próprio usuário.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) get_partner_payout_queue_main
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_payout_queue_main();

create function public.get_partner_payout_queue_main(p_partner_id uuid default null)
returns table (
  sale_id          uuid,
  sale_kind        text,
  application_name text,
  plan_name        text,
  net_amount       numeric(12,2),
  paid_at          timestamptz,
  release_date     timestamptz,
  days_remaining   integer,
  status           text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id <> auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_repasses' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  select
    combined.sale_id,
    combined.sale_kind,
    combined.application_name,
    combined.plan_name,
    combined.net_amount,
    combined.paid_at,
    combined.release_date,
    greatest(0, ceil(extract(epoch from (combined.release_date - now())) / 86400.0))::integer as days_remaining,
    case when combined.release_date <= now() then 'elegivel' else 'retido' end as status
  from (
    select
      ap.id as sale_id,
      'app_purchase'::text as sale_kind,
      ap.application_name,
      ap.plan_name,
      (ap.partner_amount - ap.reserve_amount) - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2) as net_amount,
      ap.paid_at,
      ap.paid_at + (ap.retention_days || ' days')::interval as release_date
    from public.app_purchases ap
    where ap.partner_id = v_partner_id
      and ap.status = 'paid'
      and ap.paid_at is not null
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
      )

    union all

    select
      si.id as sale_id,
      'subscription_invoice'::text as sale_kind,
      a.name as application_name,
      s.plan_name,
      si.partner_amount as net_amount,
      si.paid_at,
      si.paid_at + interval '16 days' as release_date
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and si.paid_at is not null
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
      )
  ) combined
  order by combined.release_date asc, combined.sale_id;
end;
$$;

revoke execute on function public.get_partner_payout_queue_main(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_payout_queue_main(uuid) to authenticated;

comment on function public.get_partner_payout_queue_main(uuid) is
  'Fila de repasse principal. p_partner_id default null = o próprio usuário; exige financeiro_repasses pra ver o de outro.';

-- ─────────────────────────────────────────────────────────────────────────
-- 6) get_partner_payout_queue_reserve
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_payout_queue_reserve();

create function public.get_partner_payout_queue_reserve(p_partner_id uuid default null)
returns table (
  sale_id          uuid,
  application_name text,
  plan_name        text,
  net_amount       numeric(12,2),
  paid_at          timestamptz,
  release_date     timestamptz,
  days_remaining   integer,
  status           text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id <> auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_repasses' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  select
    combined.sale_id,
    combined.application_name,
    combined.plan_name,
    combined.net_amount,
    combined.paid_at,
    combined.release_date,
    greatest(0, ceil(extract(epoch from (combined.release_date - now())) / 86400.0))::integer as days_remaining,
    case when combined.release_date <= now() then 'elegivel' else 'retido' end as status
  from (
    select
      ap.id as sale_id,
      ap.application_name,
      ap.plan_name,
      ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2) as net_amount,
      ap.paid_at,
      ap.paid_at + (ap.reserve_window_days || ' days')::interval as release_date
    from public.app_purchases ap
    where ap.partner_id = v_partner_id
      and ap.status = 'paid'
      and ap.paid_at is not null
      and ap.reserve_status = 'held'
  ) combined
  order by combined.release_date asc, combined.sale_id;
end;
$$;

revoke execute on function public.get_partner_payout_queue_reserve(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_payout_queue_reserve(uuid) to authenticated;

comment on function public.get_partner_payout_queue_reserve(uuid) is
  'Fila de reserva de disputa. p_partner_id default null = o próprio usuário; exige financeiro_repasses pra ver o de outro.';

-- ─────────────────────────────────────────────────────────────────────────
-- 7) get_partner_payout_history
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_payout_history();

create function public.get_partner_payout_history(p_partner_id uuid default null)
returns table (
  payout_id        uuid,
  reference        text,
  notes            text,
  payout_status    text,
  total_amount     numeric(12,2),
  created_at       timestamptz,
  reverted_at      timestamptz,
  revert_reason    text,
  item_id          uuid,
  item_kind        text,
  item_amount      numeric(12,2),
  application_name text,
  plan_name        text,
  sale_paid_at     timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id <> auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_repasses' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  select
    po.id as payout_id,
    po.reference,
    po.notes,
    po.status as payout_status,
    po.total_amount,
    po.created_at,
    po.reverted_at,
    po.revert_reason,
    pi.id as item_id,
    case
      when pi.subscription_invoice_id is not null then 'subscription_invoice'
      when pi.kind = 'reserve' then 'app_purchase_reserve'
      else 'app_purchase_main'
    end as item_kind,
    pi.amount as item_amount,
    coalesce(ap.application_name, a.name) as application_name,
    coalesce(ap.plan_name, s.plan_name) as plan_name,
    coalesce(ap.paid_at, si.paid_at) as sale_paid_at
  from public.partner_payouts po
  left join public.partner_payout_items pi on pi.payout_id = po.id
  left join public.app_purchases ap on ap.id = pi.app_purchase_id
  left join public.subscription_invoices si on si.id = pi.subscription_invoice_id
  left join public.subscriptions s on s.id = si.subscription_id
  left join public.app_plans p on p.id = s.app_plan_id
  left join public.app_drafts d on d.id = p.app_draft_id
  left join public.applications a on a.id = d.application_id
  where po.partner_id = v_partner_id
  order by po.created_at desc, pi.id;
end;
$$;

revoke execute on function public.get_partner_payout_history(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_payout_history(uuid) to authenticated;

comment on function public.get_partner_payout_history(uuid) is
  'Extrato de repasses. p_partner_id default null = o próprio usuário; exige financeiro_repasses pra ver o de outro.';

-- ─────────────────────────────────────────────────────────────────────────
-- 8) get_financeiro_viewable_partners — nova. Lista de donos cujo
--    financeiro o usuário logado pode ver via equipe (exclui ele mesmo
--    — "ver o meu" é sempre implícito, nunca aparece aqui).
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_financeiro_viewable_partners()
returns table (partner_id uuid, partner_label text)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  return query
  select distinct d.created_by as partner_id,
    coalesce(pr.company_name, pr.full_name, pr.email) as partner_label
  from public.app_team_members tm
  join public.app_drafts d on d.id = tm.app_draft_id
  join public.profiles pr on pr.id = d.created_by
  where tm.user_id = auth.uid()
    and d.created_by <> auth.uid()
    and (tm.role = 'owner' or tm.permissions && array['financeiro_visao_geral','financeiro_vendas','financeiro_repasses'])
  order by partner_label;
end;
$$;

revoke execute on function public.get_financeiro_viewable_partners() from public, anon, authenticated;
grant execute on function public.get_financeiro_viewable_partners() to authenticated;

comment on function public.get_financeiro_viewable_partners() is
  'Donos cujo financeiro o usuário logado pode ver via permissão de equipe (role=owner ou qualquer capacidade financeiro_*) — popula o seletor "Visualizando financeiro de" na área Vendas e financeiro. Não inclui o próprio usuário.';
```

- [ ] **Step 2: Rodar `supabase db push --linked` (confirmar com o usuário antes)**

Não aplicar sem confirmação explícita — mesmo protocolo das migrações
anteriores. **Atenção**: por ter `drop function` + `create function`
(não `create or replace`), existe uma janela — mesmo que breve, dentro
da mesma transação de migração — onde a função antiga não existe mais
e a nova ainda não foi criada. O Supabase aplica cada migração dentro
de uma transação, então isso não é um problema de produção real (não
há "meio do caminho" visível a outra sessão), mas é bom confirmar que
não há nenhum outro código (fora desta migração) chamando a assinatura
antiga de nenhuma dessas 7 RPCs — não há, todas as chamadas vivem nos
arquivos que as Tasks 4 e 5 vão atualizar nesta mesma plan.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261002140000_recebimento_atendimento_equipe.sql
git commit -m "feat: RPCs financeiras aceitam p_partner_id validado por permissão de equipe (Etapa 5)"
```

---

### Task 2: Capacidades novas no convite de equipe

**Files:**
- Modify: `app/dashboard/meus-app/novo/[appId]/equipe/TeamClient.tsx`

**Interfaces:** nenhuma — só estende um array de constantes já
renderizado pelo `.map()` existente, sem mudar nenhuma lógica.

- [ ] **Step 1: Editar o array `PERMISSIONS`**

Antes (linhas 13-17):
```tsx
const PERMISSIONS = [
  { id: 'edit_app', label: 'Editar aplicativo', description: 'Atualizar textos, imagens e informações.' },
  { id: 'respond_qa', label: 'Responder perguntas e avaliações', description: 'Publicar respostas em nome da equipe.' },
  { id: 'manage_finance', label: 'Gerenciar financeiro', description: 'Acessar funções financeiras autorizadas.' },
]
```

Depois:
```tsx
const PERMISSIONS = [
  { id: 'edit_app', label: 'Editar aplicativo', description: 'Atualizar textos, imagens e informações.' },
  { id: 'respond_qa', label: 'Responder perguntas e avaliações', description: 'Publicar respostas em nome da equipe.' },
  { id: 'manage_finance', label: 'Gerenciar financeiro', description: 'Acessar funções financeiras autorizadas.' },
  { id: 'financeiro_visao_geral', label: 'Financeiro — Visão geral', description: 'Ver os indicadores financeiros agregados do dono.' },
  { id: 'financeiro_vendas', label: 'Financeiro — Vendas', description: 'Ver o histórico de vendas do dono.' },
  { id: 'financeiro_repasses', label: 'Financeiro — Repasses e extrato', description: 'Ver a fila de repasse e o extrato do dono.' },
  { id: 'financeiro_ofertas', label: 'Financeiro — Ofertas e promoções', description: 'Ver e editar ofertas (ainda não disponível).' },
  { id: 'financeiro_configuracoes', label: 'Financeiro — Configurações de recebimento', description: 'Ver e editar dados de recebimento (ainda não disponível).' },
]
```

- [ ] **Step 2: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "app/dashboard/meus-app/novo/[appId]/equipe/TeamClient.tsx"
git commit -m "feat: 5 capacidades granulares de financeiro no convite de equipe (Etapa 5)"
```

---

### Task 3: Seletor de parceiro (layout + gate)

**Files:**
- Modify: `app/dashboard/financeiro/layout.tsx`
- Modify: `app/dashboard/financeiro/FinanceiroSellerGate.tsx`

**Interfaces:**
- Consumes: `get_financeiro_viewable_partners()` da Task 1.
- Produces: o padrão de query param `?parceiro=<uuid>` que as Tasks 4
  e 5 vão ler nas 3 páginas reais.

- [ ] **Step 1: Editar `layout.tsx`**

Antes:
```tsx
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import FinanceiroSellerGate from './FinanceiroSellerGate'

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  // user/profile não são usados aqui — o layout raiz (app/dashboard/
  // layout.tsx) já fez essa mesma checagem e já monta o DashboardShell
  // pra toda rota /dashboard/**. Esta chamada é só pra garantir a sessão
  // antes de usar `supabase` na query de app_drafts abaixo (RLS exige
  // usuário autenticado).
  await requireClientSession(supabase)

  // Mesma query (sem filtro explícito por usuário) de app/dashboard/meus-app/
  // page.tsx — a RLS de app_drafts já restringe a "próprio OU membro de
  // app_team_members". Qualquer linha = o usuário já vende pelo menos um app.
  const { data: drafts } = await supabase.from('app_drafts').select('id').limit(1)
  const isSeller = (drafts?.length ?? 0) > 0

  return (
    <FinanceiroSellerGate isSeller={isSeller}>
      {children}
    </FinanceiroSellerGate>
  )
}
```

Depois:
```tsx
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import FinanceiroSellerGate from './FinanceiroSellerGate'

interface ViewablePartner {
  partner_id:    string
  partner_label: string
}

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  // user/profile não são usados aqui — o layout raiz (app/dashboard/
  // layout.tsx) já fez essa mesma checagem e já monta o DashboardShell
  // pra toda rota /dashboard/**. Esta chamada é só pra garantir a sessão
  // antes de usar `supabase` nas queries abaixo (RLS/RPC exigem
  // usuário autenticado).
  await requireClientSession(supabase)

  // Mesma query (sem filtro explícito por usuário) de app/dashboard/meus-app/
  // page.tsx — a RLS de app_drafts já restringe a "próprio OU membro de
  // app_team_members". Qualquer linha = o usuário já vende pelo menos um app.
  const { data: drafts } = await supabase.from('app_drafts').select('id').limit(1)
  const isSeller = (drafts?.length ?? 0) > 0

  // Etapa 5: donos cujo financeiro este usuário pode ver via permissão
  // de equipe (role=owner ou qualquer capacidade financeiro_*) — popula
  // o seletor do FinanceiroSellerGate. Falha aqui não deve quebrar a
  // página inteira (o usuário ainda pode ver o próprio financeiro) —
  // só o seletor fica vazio.
  const { data: viewablePartners } = await supabase.rpc('get_financeiro_viewable_partners') as unknown as { data: ViewablePartner[] | null }

  return (
    <FinanceiroSellerGate isSeller={isSeller} viewablePartners={viewablePartners ?? []}>
      {children}
    </FinanceiroSellerGate>
  )
}
```

- [ ] **Step 2: Editar `FinanceiroSellerGate.tsx`**

Antes (arquivo inteiro):
```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Wallet, ArrowRight } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'

const FINANCEIRO_TABS = [
  { label: 'Visão geral',                 href: '/dashboard/financeiro' },
  { label: 'Vendas',                      href: '/dashboard/financeiro/vendas' },
  { label: 'Repasses e extrato',          href: '/dashboard/financeiro/repasses' },
  { label: 'Ofertas e promoções',         href: '/dashboard/financeiro/ofertas' },
  { label: 'Configurações de recebimento', href: '/dashboard/financeiro/configuracoes' },
]

const isTabActive = (pathname: string, href: string): boolean =>
  href === '/dashboard/financeiro'
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/')

interface Props {
  isSeller: boolean
  children: React.ReactNode
}

/**
 * Guarda de acesso da área "Vendas e financeiro" (Etapa 2 do roadmap —
 * só estrutura, sem dado financeiro real ainda). Quem não vende nenhum
 * app ainda nunca vê `children` renderizado — vê só a apresentação com
 * CTA de cadastro. Importante: isso é uma guarda de *exibição*, não de
 * *busca de dado* — o Server Component da página filha roda no servidor
 * independente disso (o App Router não dá pra um layout impedir isso).
 * Páginas futuras que buscarem dado financeiro real devem fazer sua
 * própria checagem de vendedor antes de consultar, em vez de confiar só
 * neste componente pra evitar a query — *ainda não seguido* pelas
 * páginas da Etapa 3 (Visão geral, Vendas): elas chamam a RPC direto
 * após `requireClientSession`, sem checagem própria. Não é um buraco de
 * segurança (as RPCs são `security definer` e se auto-restringem a
 * `partner_id = auth.uid()`, então um não-vendedor só recebe zeros/lista
 * vazia, e o resultado nem chega a ser exibido — este gate descarta o
 * `children` pra quem não é vendedor), só uma query descartada a mais
 * pra quem acessa a URL sem ser vendedor. Achado na review final da
 * Etapa 3 (2026-10-02) — ver docs/superpowers/specs/2026-10-02-vendas-
 * financeiro-visao-geral-vendas-design.md.
 *
 * NÃO renderiza <DashboardShell> — o layout raiz do dashboard
 * (app/dashboard/layout.tsx → DashboardLayoutWrapper) já envolve TODA
 * rota /dashboard/** nele. Remontar aqui duplicava o DashboardShell
 * (sidebar + assinaturas realtime) pra qualquer rota /dashboard/
 * financeiro/**, e duas instâncias tentando se inscrever no mesmo canal
 * `dash-msg-badge-${user.id}` quebrava com "cannot add `postgres_changes`
 * callbacks ... after `subscribe()`" — achado ao testar de verdade no
 * navegador, não pego por tsc nem pelas reviews (nenhuma rodou a página).
 */
export default function FinanceiroSellerGate({ isSeller, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  if (!isSeller) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center" style={{ color: colors.text }}>
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: colors.primary }}
        >
          <Wallet size={24} className="text-white" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Vendas e financeiro
        </h1>
        <p className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
          Quando você publica um app no marketplace, esta área mostra suas vendas,
          quanto você tem a receber e seus repasses — tudo num só lugar.
        </p>
        <Link
          href="/dashboard/meus-app/novo"
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
          style={{ background: colors.primary }}
        >
          Cadastrar meu aplicativo
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>
        Vendas e financeiro
      </h1>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>
        Acompanhe as vendas dos seus aplicativos, os valores a receber e seus repasses.
      </p>

      {/* Desktop: abas horizontais */}
      <div className="mb-6 hidden gap-1 overflow-x-auto border-b sm:flex" style={{ borderColor: colors.border }}>
        {FINANCEIRO_TABS.map(tab => {
          const active = isTabActive(pathname, tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="shrink-0 px-3 py-2.5 text-sm font-semibold"
              style={active
                ? { color: colors.primary, borderBottom: `2px solid ${colors.primary}` }
                : { color: colors.textSecondary }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Celular: seletor */}
      <div className="mb-6 sm:hidden">
        <select
          value={FINANCEIRO_TABS.find(t => isTabActive(pathname, t.href))?.href ?? FINANCEIRO_TABS[0].href}
          onChange={e => router.push(e.target.value)}
          className="h-11 w-full rounded-xl border px-3 text-sm font-semibold"
          style={{ borderColor: colors.border, background: colors.card, color: colors.text }}
          aria-label="Navegar na área Vendas e financeiro"
        >
          {FINANCEIRO_TABS.map(tab => (
            <option key={tab.href} value={tab.href}>{tab.label}</option>
          ))}
        </select>
      </div>

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

Depois (arquivo inteiro):
```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Wallet, ArrowRight } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'

const FINANCEIRO_TABS = [
  { label: 'Visão geral',                 href: '/dashboard/financeiro' },
  { label: 'Vendas',                      href: '/dashboard/financeiro/vendas' },
  { label: 'Repasses e extrato',          href: '/dashboard/financeiro/repasses' },
  { label: 'Ofertas e promoções',         href: '/dashboard/financeiro/ofertas' },
  { label: 'Configurações de recebimento', href: '/dashboard/financeiro/configuracoes' },
]

const isTabActive = (pathname: string, href: string): boolean =>
  href === '/dashboard/financeiro'
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/')

interface ViewablePartner {
  partner_id:    string
  partner_label: string
}

interface Props {
  isSeller:         boolean
  viewablePartners: ViewablePartner[]
  children:         React.ReactNode
}

/**
 * Guarda de acesso da área "Vendas e financeiro". Quem não é vendedor
 * E não tem acesso ao financeiro de nenhum outro parceiro via equipe
 * (Etapa 5) nunca vê `children` renderizado — vê só a apresentação com
 * CTA de cadastro. Guarda de *exibição*, não de *busca de dado* — o
 * Server Component da página filha roda no servidor independente disso.
 * As 3 páginas com RPC real (Visão geral, Vendas, Repasses) fazem sua
 * própria validação via o parâmetro `p_partner_id` de cada RPC (Etapa
 * 5) — não dependem deste componente pra segurança, só pra navegação.
 *
 * Seletor de parceiro (Etapa 5): quando `viewablePartners` não está
 * vazio, mostra um `<select>` com "Minha conta" (se `isSeller`) + um
 * item por parceiro concedido. Troca de seleção escreve `?parceiro=
 * <uuid>` na URL (via `URLSearchParams`, preservando a sub-rota atual)
 * — cada página real lê esse param e passa como `p_partner_id` pras
 * suas RPCs. `FinanceiroSellerGate` só renderiza o seletor; a
 * autorização de verdade vive nas RPCs (Task 1), nunca só aqui.
 *
 * NÃO renderiza <DashboardShell> — o layout raiz do dashboard
 * (app/dashboard/layout.tsx → DashboardLayoutWrapper) já envolve TODA
 * rota /dashboard/** nele. Remontar aqui duplicava o DashboardShell
 * (sidebar + assinaturas realtime) pra qualquer rota /dashboard/
 * financeiro/**, e duas instâncias tentando se inscrever no mesmo canal
 * `dash-msg-badge-${user.id}` quebrava com "cannot add `postgres_changes`
 * callbacks ... after `subscribe()`" — achado ao testar de verdade no
 * navegador, não pego por tsc nem pelas reviews (nenhuma rodou a página).
 */
export default function FinanceiroSellerGate({ isSeller, viewablePartners, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const hasAnyAccess = isSeller || viewablePartners.length > 0

  if (!hasAnyAccess) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center" style={{ color: colors.text }}>
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: colors.primary }}
        >
          <Wallet size={24} className="text-white" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Vendas e financeiro
        </h1>
        <p className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
          Quando você publica um app no marketplace, esta área mostra suas vendas,
          quanto você tem a receber e seus repasses — tudo num só lugar.
        </p>
        <Link
          href="/dashboard/meus-app/novo"
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
          style={{ background: colors.primary }}
        >
          Cadastrar meu aplicativo
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    )
  }

  const selectorOptions = [
    ...(isSeller ? [{ partner_id: 'self', partner_label: 'Minha conta' }] : []),
    ...viewablePartners,
  ]
  const selectedPartnerId = searchParams.get('parceiro') ?? 'self'

  const handlePartnerChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'self') {
      params.delete('parceiro')
    } else {
      params.set('parceiro', value)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>
        Vendas e financeiro
      </h1>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>
        Acompanhe as vendas dos seus aplicativos, os valores a receber e seus repasses.
      </p>

      {selectorOptions.length > 1 && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>
            Visualizando financeiro de
          </label>
          <select
            value={selectedPartnerId}
            onChange={e => handlePartnerChange(e.target.value)}
            className="h-10 w-full max-w-xs rounded-xl border px-3 text-sm font-semibold sm:w-auto"
            style={{ borderColor: colors.border, background: colors.card, color: colors.text }}
            aria-label="Visualizando financeiro de"
          >
            {selectorOptions.map(opt => (
              <option key={opt.partner_id} value={opt.partner_id}>{opt.partner_label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Desktop: abas horizontais */}
      <div className="mb-6 hidden gap-1 overflow-x-auto border-b sm:flex" style={{ borderColor: colors.border }}>
        {FINANCEIRO_TABS.map(tab => {
          const active = isTabActive(pathname, tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="shrink-0 px-3 py-2.5 text-sm font-semibold"
              style={active
                ? { color: colors.primary, borderBottom: `2px solid ${colors.primary}` }
                : { color: colors.textSecondary }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Celular: seletor de aba */}
      <div className="mb-6 sm:hidden">
        <select
          value={FINANCEIRO_TABS.find(t => isTabActive(pathname, t.href))?.href ?? FINANCEIRO_TABS[0].href}
          onChange={e => router.push(e.target.value)}
          className="h-11 w-full rounded-xl border px-3 text-sm font-semibold"
          style={{ borderColor: colors.border, background: colors.card, color: colors.text }}
          aria-label="Navegar na área Vendas e financeiro"
        >
          {FINANCEIRO_TABS.map(tab => (
            <option key={tab.href} value={tab.href}>{tab.label}</option>
          ))}
        </select>
      </div>

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

- [ ] **Step 3: `npx tsc --noEmit`**

Expected: limpo. Atenção: `useSearchParams()` em Client Component dentro
de uma rota que não está em um `<Suspense>` explícito pode gerar aviso
de build em alguns setups do Next.js — como `DashboardShell.tsx` (que já
é montado acima na árvore, pelo layout raiz) não envolve filhos em
Suspense pra isso, e nenhuma outra tela deste dashboard usa
`useSearchParams()` hoje, preste atenção em qualquer novo warning que
`npx tsc --noEmit`/a navegação manual (Task 6) revelar — se aparecer,
reporte como concern no lugar de silenciar.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/financeiro/layout.tsx app/dashboard/financeiro/FinanceiroSellerGate.tsx
git commit -m "feat: seletor de parceiro na área financeira (Etapa 5)"
```

---

### Task 4: `p_partner_id` nas 3 páginas com RPC real

**Files:**
- Modify: `app/dashboard/financeiro/page.tsx`
- Modify: `app/dashboard/financeiro/vendas/page.tsx`
- Modify: `app/dashboard/financeiro/vendas/VendasClient.tsx`
- Modify: `app/dashboard/financeiro/repasses/page.tsx`

**Interfaces:**
- Consumes: as 7 RPCs com `p_partner_id` (Task 1) + o query param
  `?parceiro=` que o seletor da Task 3 escreve.

- [ ] **Step 1: Editar `app/dashboard/financeiro/page.tsx`**

Antes (linhas 25-30, o resto do arquivo não muda):
```tsx
export default async function FinanceiroVisaoGeralPage() {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  const { data, error } = await supabase.rpc('get_partner_financeiro_overview') as unknown as { data: OverviewRow[] | null; error: unknown }
```

Depois:
```tsx
interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroVisaoGeralPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  const { data, error } = await supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }) as unknown as { data: OverviewRow[] | null; error: unknown }
```

(a interface `SearchParams` fica logo antes da função, depois de
`EMPTY_OVERVIEW` — resto do arquivo, incluindo o bloco de erro e os 6
cards, fica idêntico.)

- [ ] **Step 2: Editar `app/dashboard/financeiro/vendas/page.tsx`**

Antes (arquivo inteiro):
```tsx
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'
import VendasClient from './VendasClient'

export const metadata: Metadata = { title: 'Vendas | LOBBY', robots: { index: false, follow: false } }

interface SoldApp {
  application_id:   string
  application_name: string
}

export default async function FinanceiroVendasPage() {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  const { data, error } = await supabase.rpc('get_partner_sold_apps') as unknown as { data: SoldApp[] | null; error: unknown }

  if (error) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-bold" style={{ color: colors.text }}>Vendas</h2>
        <p className="text-sm" style={{ color: colors.textSecondary }}>Não foi possível carregar o filtro de apps. Tente novamente em instantes.</p>
      </div>
    )
  }

  return <VendasClient soldApps={data ?? []} />
}
```

Depois (arquivo inteiro):
```tsx
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'
import VendasClient from './VendasClient'

export const metadata: Metadata = { title: 'Vendas | LOBBY', robots: { index: false, follow: false } }

interface SoldApp {
  application_id:   string
  application_name: string
}

interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroVendasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  const { data, error } = await supabase.rpc('get_partner_sold_apps', { p_partner_id: partnerId }) as unknown as { data: SoldApp[] | null; error: unknown }

  if (error) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-bold" style={{ color: colors.text }}>Vendas</h2>
        <p className="text-sm" style={{ color: colors.textSecondary }}>Não foi possível carregar o filtro de apps. Tente novamente em instantes.</p>
      </div>
    )
  }

  return <VendasClient soldApps={data ?? []} partnerId={partnerId} />
}
```

- [ ] **Step 3: Editar `VendasClient.tsx`**

Antes (linhas 46-78):
```tsx
interface Props {
  soldApps: SoldApp[]
}

export default function VendasClient({ soldApps }: Props) {
  const [applicationId, setApplicationId] = useState<string>('')
  const [page, setPage] = useState(0)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const supabase = createClient()
    const filterId = applicationId || null
    const [{ data: salesData, error: salesError }, { data: countData, error: countError }] = await Promise.all([
      supabase.rpc('get_partner_sales', { p_application_id: filterId, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }),
      supabase.rpc('get_partner_sales_count', { p_application_id: filterId }),
    ]) as unknown as [{ data: SaleRow[] | null; error: unknown }, { data: number | null; error: unknown }]
    if (salesError || countError) {
      setError(true)
      setSales([])
      setTotal(0)
      setLoading(false)
      return
    }
    setSales(salesData ?? [])
    setTotal(countData ?? 0)
    setLoading(false)
  }, [applicationId, page])
```

Depois:
```tsx
interface Props {
  soldApps:  SoldApp[]
  partnerId: string | null
}

export default function VendasClient({ soldApps, partnerId }: Props) {
  const [applicationId, setApplicationId] = useState<string>('')
  const [page, setPage] = useState(0)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const supabase = createClient()
    const filterId = applicationId || null
    const [{ data: salesData, error: salesError }, { data: countData, error: countError }] = await Promise.all([
      supabase.rpc('get_partner_sales', { p_application_id: filterId, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE, p_partner_id: partnerId }),
      supabase.rpc('get_partner_sales_count', { p_application_id: filterId, p_partner_id: partnerId }),
    ]) as unknown as [{ data: SaleRow[] | null; error: unknown }, { data: number | null; error: unknown }]
    if (salesError || countError) {
      setError(true)
      setSales([])
      setTotal(0)
      setLoading(false)
      return
    }
    setSales(salesData ?? [])
    setTotal(countData ?? 0)
    setLoading(false)
  }, [applicationId, page, partnerId])
```

(resto do arquivo, incluindo `useEffect(() => { load() }, [load])` e
todo o JSX, fica idêntico — `load` já muda de identidade quando
`partnerId` muda porque entrou no array de dependências do
`useCallback`, então o `useEffect` já existente refaz o fetch sozinho.)

- [ ] **Step 4: Editar `app/dashboard/financeiro/repasses/page.tsx`**

Antes (linhas 39-47):
```tsx
export default async function FinanceiroRepassesPage() {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  const [mainRes, reserveRes, historyRes] = await Promise.all([
    supabase.rpc('get_partner_payout_queue_main'),
    supabase.rpc('get_partner_payout_queue_reserve'),
    supabase.rpc('get_partner_payout_history'),
  ]) as unknown as [RpcResult<QueueRow[]>, RpcResult<QueueRow[]>, RpcResult<HistoryRow[]>]
```

Depois:
```tsx
interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroRepassesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  const [mainRes, reserveRes, historyRes] = await Promise.all([
    supabase.rpc('get_partner_payout_queue_main', { p_partner_id: partnerId }),
    supabase.rpc('get_partner_payout_queue_reserve', { p_partner_id: partnerId }),
    supabase.rpc('get_partner_payout_history', { p_partner_id: partnerId }),
  ]) as unknown as [RpcResult<QueueRow[]>, RpcResult<QueueRow[]>, RpcResult<HistoryRow[]>]
```

(a interface `SearchParams` fica logo antes da função, depois de `type
RpcResult<T>` — resto do arquivo, o `return <RepassesClient .../>`,
fica idêntico.)

- [ ] **Step 5: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/financeiro/page.tsx app/dashboard/financeiro/vendas/page.tsx app/dashboard/financeiro/vendas/VendasClient.tsx app/dashboard/financeiro/repasses/page.tsx
git commit -m "feat: as 3 páginas reais passam p_partner_id da URL pras RPCs (Etapa 5)"
```

---

### Task 5: Configurações de recebimento com dado real

**Files:**
- Modify: `app/dashboard/financeiro/configuracoes/page.tsx`

**Interfaces:** nenhuma — leitura direta de `profiles`, sem RPC nova,
sem `p_partner_id` (sempre o próprio usuário, por decisão do spec).

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Antes (arquivo inteiro):
```tsx
import type { Metadata } from 'next'
import { colors } from '@/lib/design-tokens'

export const metadata: Metadata = { title: 'Configurações de recebimento | LOBBY', robots: { index: false, follow: false } }

export default function FinanceiroConfiguracoesPage() {
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Configurações de recebimento</h2>
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        Em construção — essa área está sendo desenvolvida.
      </p>
    </div>
  )
}
```

Depois (arquivo inteiro):
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, LifeBuoy } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'

export const metadata: Metadata = { title: 'Configurações de recebimento | LOBBY', robots: { index: false, follow: false } }

export default async function FinanceiroConfiguracoesPage() {
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  // Sempre o próprio usuário — nunca lê ?parceiro= (decisão do spec:
  // dado bancário nunca é "visualizado em nome de outro parceiro",
  // mesmo padrão de /dashboard/conta, que também é sempre a própria conta).
  const { data: profile } = await supabase
    .from('profiles')
    .select('payout_pix_key, payout_account_holder, payout_notes')
    .eq('id', user.id)
    .maybeSingle()

  const fields = [
    { label: 'Chave PIX',         value: profile?.payout_pix_key },
    { label: 'Titular da conta',  value: profile?.payout_account_holder },
    { label: 'Observações',       value: profile?.payout_notes },
  ]

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Configurações de recebimento</h2>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>
        Dados usados pra receber seus repasses via PIX/TED.
      </p>

      <div className="mb-4 rounded-2xl border p-5" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
        <div className="flex flex-col gap-3">
          {fields.map(f => (
            <div key={f.label}>
              <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>{f.label}</p>
              <p className="text-sm" style={{ color: f.value ? colors.text : colors.textMuted }}>{f.value || 'Não cadastrado'}</p>
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/conta"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
          style={{ color: colors.primary }}
        >
          Editar em Conta
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="rounded-2xl border p-5" style={{ borderColor: colors.border, background: colors.card }}>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: colors.text }}>
          <LifeBuoy size={16} aria-hidden="true" />
          Dúvidas sobre repasse?
        </p>
        <p className="mb-3 text-sm" style={{ color: colors.textSecondary }}>
          Fale com o nosso time de suporte pra tirar dúvidas sobre prazos, valores ou dados de recebimento.
        </p>
        <Link href="/dashboard/suporte" className="text-sm font-semibold" style={{ color: colors.primary }}>
          Abrir suporte →
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `npx tsc --noEmit`**

Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/financeiro/configuracoes/page.tsx
git commit -m "feat: Configurações de recebimento mostra PIX cadastrado + link pra Conta + suporte (Etapa 5)"
```

---

### Task 6: Verificação manual no navegador

**Files:** nenhum arquivo novo — só dados de teste temporários + checagem.

**Interfaces:** nenhuma — task de verificação, não de código.

- [ ] **Step 1: Criar 2 contas de teste — dono + membro de equipe**

Mesmo padrão das etapas anteriores (service-role `auth.admin.createUser`
+ insert manual). Desta vez:
- Conta "dono": `applications`/`app_drafts` (created_by = dono) +
  `app_plans` + 2-3 `app_purchases` variadas (retido/elegível, mesmo
  padrão de teste das etapas 3-4) + `profiles.payout_pix_key`/
  `payout_account_holder` preenchidos (pra testar a Task 5).
- Conta "membro": insert direto em `app_team_members` (`app_draft_id` =
  o app do dono, `user_id` = o membro, `role='member'`, `permissions =
  ARRAY['financeiro_vendas']` — só uma capacidade, de propósito, pra
  testar que as outras ficam bloqueadas).

- [ ] **Step 2: Login como "dono", abrir `/dashboard/financeiro`**

Confirmar: nenhum seletor aparece (dono não tem acesso concedido a
ninguém além de si mesmo) — comportamento idêntico ao de antes da
Etapa 5. Abrir `/dashboard/financeiro/configuracoes`: confirmar que
mostra a chave PIX/titular cadastrados, link "Editar em Conta" funciona,
bloco de suporte aparece.

- [ ] **Step 3: Login como "membro", abrir `/dashboard/financeiro`**

Confirmar: seletor aparece com 1 opção (o dono — "membro" não é
vendedor por si só, então "Minha conta" não aparece, só o dono). Trocar
pro dono. Confirmar: `/dashboard/financeiro/vendas` carrega
normalmente (tem `financeiro_vendas`), mas `/dashboard/financeiro`
(Visão geral) e `/dashboard/financeiro/repasses` mostram o bloco de
erro (não tem `financeiro_visao_geral` nem `financeiro_repasses`) —
confirmar no console do navegador que o erro reportado pela RPC é
"Sem permissão para ver o financeiro deste parceiro." (não um erro
genérico de rede).

- [ ] **Step 4: Conceder `financeiro_visao_geral` ao "membro" e recarregar**

Via update direto em `app_team_members.permissions` (service-role).
Confirmar: recarregando `/dashboard/financeiro` (ainda com `?parceiro=
<dono>` na URL), a Visão geral agora carrega — sem precisar de nenhuma
mudança de código, só a permissão. Testar em mobile (375px) também —
seletor e abas devem continuar usáveis.

- [ ] **Step 5: Limpar os dados de teste**

Apagar `app_team_members`/`app_purchases`/`app_plans`/`app_drafts`/
`applications`/`profiles`/contas de teste — mesmo cuidado das etapas
anteriores.
