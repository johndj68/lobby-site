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

revoke execute on function public.get_partner_financeiro_overview() from public, anon, authenticated;
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

revoke execute on function public.get_partner_sold_apps() from public, anon, authenticated;
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

revoke execute on function public.get_partner_sales(uuid, integer, integer) from public, anon, authenticated;
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

revoke execute on function public.get_partner_sales_count(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_sales_count(uuid) to authenticated;

comment on function public.get_partner_financeiro_overview() is
  'Os 6 indicadores agregados da Visão geral do parceiro — retido/elegível/repassado/reserva somam app_purchases + subscription_invoices (reserva e reembolso só existem em app_purchases). Mesma matemática de create_partner_payout, nunca uma 3ª implementação divergente.';
comment on function public.get_partner_sold_apps() is
  'Apps distintos que o parceiro já vendeu (compra única ou assinatura) — só pra popular o filtro da página Vendas.';
comment on function public.get_partner_sales(uuid, integer, integer) is
  'Lista paginada de vendas do parceiro (compra única + fatura de assinatura), com comprador e status de repasse por linha. payout_status = reembolsado quando a compra foi totalmente revertida (status=refunded) — valor adicional sobre retido/elegivel/pago.';
comment on function public.get_partner_sales_count(uuid) is
  'Contagem total pro mesmo filtro de get_partner_sales — paginação client-side.';
