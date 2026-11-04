-- Fix de 2 achados Important da review final da Etapa 3 "Vendas e
-- financeiro" (2026-10-02), sobre RPCs já em produção
-- (20261002110000_consultas_financeiro_parceiro.sql). Assinaturas
-- idênticas — CREATE OR REPLACE direto, sem DROP (revoke/grant já
-- estabelecidos na migration anterior não são afetados por um CREATE OR
-- REPLACE com a mesma assinatura).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_partner_financeiro_overview — as 3 pernas de subscription_invoices
--    (retido, elegível, vendas do mês) não filtravam por
--    s.product_type = 'app_plan', diferente de get_partner_sales/
--    get_partner_sales_count/get_partner_sold_apps. Pelo comentário da
--    tabela subscriptions, 'mensalidade' nunca deveria ter partner_id —
--    mas nada impede isso hoje, e se acontecesse os cards da Visão geral
--    contariam uma venda que a tabela/filtro de Vendas não contaria.
--    Corpo idêntico ao original, só com o predicado adicional nas 3
--    pernas (a perna de reembolsos do mês não tem join com subscriptions
--    — fica intocada).
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
    and s.product_type = 'app_plan'
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
    and s.product_type = 'app_plan'
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
    and s.product_type = 'app_plan'
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

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_sales — faltava o guard ap.paid_at is not null na perna
--    de app_purchases (presente em todo outro lugar que lê app_purchases
--    pra venda paga, inclusive na própria get_partner_financeiro_overview
--    acima) e o order by final não tinha tiebreaker — duas linhas com
--    paid_at idêntico (ex: subscription_invoices default now()) podiam
--    duplicar ou pular entre páginas de LIMIT/OFFSET.
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
    where s.partner_id = auth.uid()
      and s.product_type = 'app_plan'
      and (p_application_id is null or d.application_id = p_application_id)
  ) combined
  order by combined.paid_at desc, combined.sale_id
  limit p_limit offset p_offset;
end;
$$;
