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
