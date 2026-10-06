-- Aba "Vendas" (Vendas e financeiro) — filtros reais (período, plano,
-- status de pagamento, status de repasse, busca, ordenação), indicadores
-- do período filtrado e um detalhe completo por venda pra alimentar o
-- painel lateral. Mesmo padrão de permissão (financeiro_vendas via
-- app_team_members) já usado em get_partner_sales/get_partner_sold_apps —
-- reaproveitado, nunca reinventado. CREATE OR REPLACE não troca uma função
-- cuja lista de parâmetros mudou (mesmo motivo documentado em
-- 20260930120000_reserva_disputa_parceiro.sql) — todo DROP abaixo é
-- necessário, não defensivo.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_partner_sales — ganha filtros de plano/período/status/busca,
--    ordenação, e separa o antigo payout_status conflado (que misturava
--    "reembolsado", um estado de PAGAMENTO, com retido/elegível/pago, que
--    são estados de REPASSE) em duas colunas reais e independentes:
--    payment_status (confirmado/parcialmente_reembolsado/reembolsado) e
--    payout_status (retido/elegivel/parcialmente_repassado/repassado).
--    Uma venda reembolsada pode estar com repasse já feito — isso não é
--    contraditório, é só dois eixos diferentes (spec: nunca misturar
--    pagamento/repasse numa única classificação).
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_sales(uuid, integer, integer, uuid);

create function public.get_partner_sales(
  p_application_id uuid default null,
  p_limit          integer default 50,
  p_offset         integer default 0,
  p_partner_id     uuid default null,
  p_plan_id        uuid default null,
  p_date_from      timestamptz default null,
  p_date_to        timestamptz default null,
  p_payment_status text default null,
  p_payout_status  text default null,
  p_search         text default null,
  p_sort           text default 'recent'
)
returns table (
  sale_id           uuid,
  sale_kind         text,
  application_id    uuid,
  application_name  text,
  logo_url          text,
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
  payment_status    text,
  payout_status     text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_search     text := nullif(trim(coalesce(p_search, '')), '');
begin
  if v_partner_id is distinct from auth.uid() then
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
      ap.application_id,
      ap.application_name,
      a.logo_url,
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
        when ap.refunded_amount > 0 then 'parcialmente_reembolsado'
        else 'confirmado'
      end as payment_status,
      case
        when ap.reserve_amount = 0 then
          case
            when exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
            ) then 'repassado'
            when ap.paid_at <= now() - (ap.retention_days || ' days')::interval then 'elegivel'
            else 'retido'
          end
        else
          case
            when exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
            ) and exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'reserve' and po.status = 'confirmado'
            ) then 'repassado'
            when exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
            ) then 'parcialmente_repassado'
            when ap.paid_at <= now() - (ap.retention_days || ' days')::interval then 'elegivel'
            else 'retido'
          end
      end as payout_status
    from public.app_purchases ap
    left join public.profiles pr on pr.id = ap.buyer_user_id
    left join public.applications a on a.id = ap.application_id
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and ap.paid_at is not null
      and (p_application_id is null or ap.application_id = p_application_id)
      and (p_plan_id is null or ap.plan_id = p_plan_id)
      and (p_date_from is null or ap.paid_at >= p_date_from)
      and (p_date_to is null or ap.paid_at < p_date_to)

    union all

    select
      si.id                        as sale_id,
      'subscription_invoice'::text as sale_kind,
      d.application_id,
      a.name                       as application_name,
      a.logo_url,
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
      'confirmado'::text as payment_status,
      case
        when exists (
          select 1 from public.partner_payout_items pi
          join public.partner_payouts po on po.id = pi.payout_id
          where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
        ) then 'repassado'
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
      and (p_plan_id is null or s.app_plan_id = p_plan_id)
      and (p_date_from is null or si.paid_at >= p_date_from)
      and (p_date_to is null or si.paid_at < p_date_to)
  ) combined
  where (p_payment_status is null or combined.payment_status = p_payment_status)
    and (p_payout_status is null or combined.payout_status = p_payout_status)
    and (
      v_search is null
      or combined.application_name ilike '%' || v_search || '%'
      or combined.plan_name ilike '%' || v_search || '%'
      or combined.buyer_name ilike '%' || v_search || '%'
      or combined.buyer_email ilike '%' || v_search || '%'
      or combined.sale_id::text ilike '%' || v_search || '%'
    )
  order by
    case when p_sort = 'oldest' then combined.paid_at end asc,
    case when p_sort = 'highest' then combined.amount end desc,
    case when p_sort = 'lowest' then combined.amount end asc,
    case when p_sort is distinct from 'oldest' and p_sort is distinct from 'highest' and p_sort is distinct from 'lowest' then combined.paid_at end desc,
    combined.sale_id asc
  limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.get_partner_sales(uuid, integer, integer, uuid, uuid, timestamptz, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_partner_sales(uuid, integer, integer, uuid, uuid, timestamptz, timestamptz, text, text, text, text) to authenticated;

comment on function public.get_partner_sales(uuid, integer, integer, uuid, uuid, timestamptz, timestamptz, text, text, text, text) is
  'Lista paginada e filtrável de vendas da aba Vendas. payment_status e payout_status são eixos independentes — nunca conflados. p_partner_id default null = o próprio usuário; exige financeiro_vendas pra ver o de outro.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_sales_count — mesmo filtro de get_partner_sales, sem
--    paginação/ordenação.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_sales_count(uuid, uuid);

create function public.get_partner_sales_count(
  p_application_id uuid default null,
  p_partner_id     uuid default null,
  p_plan_id        uuid default null,
  p_date_from      timestamptz default null,
  p_date_to        timestamptz default null,
  p_payment_status text default null,
  p_payout_status  text default null,
  p_search         text default null
)
returns integer
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_search     text := nullif(trim(coalesce(p_search, '')), '');
  v_count      integer;
begin
  if v_partner_id is distinct from auth.uid() then
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
    select
      ap.id as sale_id, ap.application_name, ap.plan_name,
      coalesce(pr.full_name, '—') as buyer_name, coalesce(pr.email, '—') as buyer_email,
      case
        when ap.status = 'refunded' then 'reembolsado'
        when ap.refunded_amount > 0 then 'parcialmente_reembolsado'
        else 'confirmado'
      end as payment_status,
      case
        when ap.reserve_amount = 0 then
          case
            when exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
            ) then 'repassado'
            when ap.paid_at <= now() - (ap.retention_days || ' days')::interval then 'elegivel'
            else 'retido'
          end
        else
          case
            when exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
            ) and exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'reserve' and po.status = 'confirmado'
            ) then 'repassado'
            when exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
            ) then 'parcialmente_repassado'
            when ap.paid_at <= now() - (ap.retention_days || ' days')::interval then 'elegivel'
            else 'retido'
          end
      end as payout_status
    from public.app_purchases ap
    left join public.profiles pr on pr.id = ap.buyer_user_id
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and ap.paid_at is not null
      and (p_application_id is null or ap.application_id = p_application_id)
      and (p_plan_id is null or ap.plan_id = p_plan_id)
      and (p_date_from is null or ap.paid_at >= p_date_from)
      and (p_date_to is null or ap.paid_at < p_date_to)

    union all

    select
      si.id, a.name, s.plan_name,
      coalesce(pr.full_name, '—'), coalesce(pr.email, '—'),
      'confirmado'::text,
      case
        when exists (
          select 1 from public.partner_payout_items pi
          join public.partner_payouts po on po.id = pi.payout_id
          where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
        ) then 'repassado'
        when si.paid_at <= now() - interval '16 days' then 'elegivel'
        else 'retido'
      end
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.profiles pr on pr.id = s.user_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and (p_application_id is null or d.application_id = p_application_id)
      and (p_plan_id is null or s.app_plan_id = p_plan_id)
      and (p_date_from is null or si.paid_at >= p_date_from)
      and (p_date_to is null or si.paid_at < p_date_to)
  ) combined
  where (p_payment_status is null or combined.payment_status = p_payment_status)
    and (p_payout_status is null or combined.payout_status = p_payout_status)
    and (
      v_search is null
      or combined.application_name ilike '%' || v_search || '%'
      or combined.plan_name ilike '%' || v_search || '%'
      or combined.buyer_name ilike '%' || v_search || '%'
      or combined.buyer_email ilike '%' || v_search || '%'
      or combined.sale_id::text ilike '%' || v_search || '%'
    );

  return v_count;
end;
$$;

revoke execute on function public.get_partner_sales_count(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.get_partner_sales_count(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) to authenticated;

comment on function public.get_partner_sales_count(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) is
  'Contagem total pro mesmo filtro de get_partner_sales.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) get_partner_sale_plans — opções do filtro "Plano", só os planos
--    realmente vendidos pelo parceiro naquele app (nunca todos os planos
--    cadastrados do app).
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_sale_plans(
  p_application_id uuid,
  p_partner_id     uuid default null
)
returns table (plan_id uuid, plan_name text)
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
        and (tm.role = 'owner' or 'financeiro_vendas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  select distinct x.plan_id, x.plan_name from (
    select ap.plan_id, ap.plan_name
    from public.app_purchases ap
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and ap.application_id = p_application_id
      and ap.plan_id is not null

    union all

    select s.app_plan_id as plan_id, s.plan_name
    from public.subscriptions s
    join public.app_plans p on p.id = s.app_plan_id
    join public.app_drafts d on d.id = p.app_draft_id
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and d.application_id = p_application_id
  ) x
  order by x.plan_name;
end;
$$;

revoke execute on function public.get_partner_sale_plans(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_sale_plans(uuid, uuid) to authenticated;

comment on function public.get_partner_sale_plans(uuid, uuid) is
  'Planos realmente vendidos pelo parceiro num app — opções do filtro Plano na aba Vendas.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) get_partner_vendas_resumo — os 4 indicadores da aba Vendas, sobre o
--    MESMO conjunto filtrado da tabela (não paginado). Reembolsos aqui são
--    "quanto foi reembolsado destas vendas selecionadas" — diferente de
--    get_partner_financeiro_periodo_resumo, que janela reembolsos por
--    refunded_at (responde "reembolsos que caíram neste período", uma
--    pergunta diferente). Divergência intencional, não é duplicação por
--    descuido.
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_vendas_resumo(
  p_application_id uuid default null,
  p_partner_id     uuid default null,
  p_plan_id        uuid default null,
  p_date_from      timestamptz default null,
  p_date_to        timestamptz default null,
  p_payment_status text default null,
  p_payout_status  text default null,
  p_search         text default null
)
returns table (
  vendas_confirmadas_qtd integer,
  valor_vendido          numeric(12,2),
  participacao_valor     numeric(12,2),
  reembolsos_valor       numeric(12,2),
  reembolsos_qtd         integer
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_search     text := nullif(trim(coalesce(p_search, '')), '');
begin
  if v_partner_id is distinct from auth.uid() then
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
  select
    count(*)::integer,
    coalesce(sum(combined.amount), 0),
    coalesce(sum(combined.partner_amount), 0),
    coalesce(sum(combined.refunded_amount), 0),
    count(*) filter (where combined.refunded_amount > 0)::integer
  from (
    select
      ap.amount, ap.partner_amount, ap.refunded_amount,
      case
        when ap.status = 'refunded' then 'reembolsado'
        when ap.refunded_amount > 0 then 'parcialmente_reembolsado'
        else 'confirmado'
      end as payment_status,
      case
        when ap.reserve_amount = 0 then
          case
            when exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
            ) then 'repassado'
            when ap.paid_at <= now() - (ap.retention_days || ' days')::interval then 'elegivel'
            else 'retido'
          end
        else
          case
            when exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
            ) and exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'reserve' and po.status = 'confirmado'
            ) then 'repassado'
            when exists (
              select 1 from public.partner_payout_items pi
              join public.partner_payouts po on po.id = pi.payout_id
              where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
            ) then 'parcialmente_repassado'
            when ap.paid_at <= now() - (ap.retention_days || ' days')::interval then 'elegivel'
            else 'retido'
          end
      end as payout_status,
      ap.application_name, ap.plan_name,
      coalesce(pr.full_name, '—') as buyer_name, coalesce(pr.email, '—') as buyer_email,
      ap.id as sale_id
    from public.app_purchases ap
    left join public.profiles pr on pr.id = ap.buyer_user_id
    where ap.partner_id = v_partner_id
      and ap.status in ('paid', 'refunded')
      and ap.paid_at is not null
      and (p_application_id is null or ap.application_id = p_application_id)
      and (p_plan_id is null or ap.plan_id = p_plan_id)
      and (p_date_from is null or ap.paid_at >= p_date_from)
      and (p_date_to is null or ap.paid_at < p_date_to)

    union all

    select
      si.amount, si.partner_amount, 0::numeric(12,2),
      'confirmado'::text,
      case
        when exists (
          select 1 from public.partner_payout_items pi
          join public.partner_payouts po on po.id = pi.payout_id
          where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
        ) then 'repassado'
        when si.paid_at <= now() - interval '16 days' then 'elegivel'
        else 'retido'
      end,
      a.name, s.plan_name,
      coalesce(pr.full_name, '—'), coalesce(pr.email, '—'),
      si.id
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.profiles pr on pr.id = s.user_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where s.partner_id = v_partner_id
      and s.product_type = 'app_plan'
      and (p_application_id is null or d.application_id = p_application_id)
      and (p_plan_id is null or s.app_plan_id = p_plan_id)
      and (p_date_from is null or si.paid_at >= p_date_from)
      and (p_date_to is null or si.paid_at < p_date_to)
  ) combined
  where (p_payment_status is null or combined.payment_status = p_payment_status)
    and (p_payout_status is null or combined.payout_status = p_payout_status)
    and (
      v_search is null
      or combined.application_name ilike '%' || v_search || '%'
      or combined.plan_name ilike '%' || v_search || '%'
      or combined.buyer_name ilike '%' || v_search || '%'
      or combined.buyer_email ilike '%' || v_search || '%'
      or combined.sale_id::text ilike '%' || v_search || '%'
    );
end;
$$;

revoke execute on function public.get_partner_vendas_resumo(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.get_partner_vendas_resumo(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) to authenticated;

comment on function public.get_partner_vendas_resumo(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) is
  'Os 4 indicadores da aba Vendas, somados sobre TODO o conjunto filtrado (não só a página atual). reembolsos_valor é sobre as vendas selecionadas, não janelado por refunded_at.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) get_partner_sale_detail — composição completa de uma venda pro
--    painel lateral. Exige sale_kind explícito (evita ambiguidade entre
--    as duas tabelas) e confirma que a venda pertence a v_partner_id —
--    trocar o id na URL pra uma venda de outro parceiro retorna vazio,
--    nunca lança exceção que revele que o id existe.
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_sale_detail(
  p_sale_id    uuid,
  p_sale_kind  text default null,
  p_partner_id uuid default null
)
returns table (
  sale_id              uuid,
  sale_kind            text,
  application_id       uuid,
  application_name     text,
  logo_url             text,
  plan_name            text,
  buyer_name           text,
  buyer_email          text,
  amount               numeric(12,2),
  commission_percent   numeric(5,2),
  commission_amount    numeric(12,2),
  partner_amount       numeric(12,2),
  paid_at              timestamptz,
  payment_status       text,
  retention_days       integer,
  retention_release_at timestamptz,
  retention_days_left  integer,
  reserve_amount       numeric(12,2),
  reserve_status       text,
  reserve_window_days  integer,
  reserve_release_at   timestamptz,
  reserve_days_left    integer,
  refund_status        text,
  refunded_amount      numeric(12,2),
  refund_reason        text,
  refunded_at          timestamptz,
  refund_window_days   integer,
  dispute_status       text,
  dispute_opened_at    timestamptz,
  dispute_closed_at    timestamptz,
  dispute_reason       text,
  activation_status    text,
  activation_delivered_at timestamptz,
  payout_legs          jsonb,
  history              jsonb
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_sale_kind  text := p_sale_kind;
begin
  if v_sale_kind is not null and v_sale_kind not in ('app_purchase', 'subscription_invoice') then
    raise exception 'sale_kind inválido.';
  end if;

  if v_partner_id is distinct from auth.uid() then
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

  -- Deep links (ex.: "Ver detalhes" vindo da Visão geral, ?venda=<id>)
  -- nem sempre carregam o tipo da venda na URL — resolve pela existência
  -- do id numa das duas tabelas. Colisão de uuid entre as duas é
  -- praticamente impossível (gen_random_uuid() em ambas) e, mesmo assim,
  -- o filtro de propriedade por v_partner_id abaixo nunca vaza a venda
  -- errada.
  if v_sale_kind is null then
    if exists (select 1 from public.app_purchases ap where ap.id = p_sale_id) then
      v_sale_kind := 'app_purchase';
    elsif exists (select 1 from public.subscription_invoices si where si.id = p_sale_id) then
      v_sale_kind := 'subscription_invoice';
    else
      return;
    end if;
  end if;

  if v_sale_kind = 'app_purchase' then
    return query
    select
      ap.id, 'app_purchase'::text, ap.application_id, ap.application_name, a.logo_url, ap.plan_name,
      coalesce(pr.full_name, '—'), coalesce(pr.email, '—'),
      ap.amount, ap.commission_percent, ap.commission_amount, ap.partner_amount, ap.paid_at,
      case
        when ap.status = 'refunded' then 'reembolsado'
        when ap.refunded_amount > 0 then 'parcialmente_reembolsado'
        else 'confirmado'
      end,
      ap.retention_days,
      ap.paid_at + (ap.retention_days || ' days')::interval,
      greatest(0, ceil(extract(epoch from (ap.paid_at + (ap.retention_days || ' days')::interval - now())) / 86400.0))::integer,
      ap.reserve_amount, ap.reserve_status, ap.reserve_window_days,
      case when ap.reserve_amount > 0 then ap.paid_at + (ap.reserve_window_days || ' days')::interval else null end,
      case when ap.reserve_amount > 0 then greatest(0, ceil(extract(epoch from (ap.paid_at + (ap.reserve_window_days || ' days')::interval - now())) / 86400.0))::integer else null end,
      ap.refund_status, ap.refunded_amount, ap.refund_reason, ap.refunded_at, ap.refund_window_days,
      pd.status, pd.opened_at, pd.closed_at, pd.reason,
      ac.status, ac.delivered_at,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'kind', leg.kind, 'amount', leg.amount, 'payout_status', leg.payout_status,
          'payout_created_at', leg.payout_created_at, 'payout_reference', leg.payout_reference,
          'reverted_at', leg.reverted_at
        ) order by leg.kind), '[]'::jsonb)
        from (
          select pi.kind, pi.amount, po.status as payout_status, po.created_at as payout_created_at, po.reference as payout_reference, po.reverted_at
          from public.partner_payout_items pi
          join public.partner_payouts po on po.id = pi.payout_id
          where pi.app_purchase_id = ap.id
          order by (po.status = 'confirmado') desc, po.created_at desc
        ) leg
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object('event_at', ev.event_at, 'label', ev.label, 'description', ev.description) order by ev.event_at), '[]'::jsonb)
        from (
          select ap.paid_at as event_at, 'Pagamento confirmado' as label, null::text as description
          where ap.paid_at is not null
          union all
          select ap.refunded_at, 'Reembolso concluído', 'Valor reembolsado: ' || to_char(ap.refunded_amount, 'FM999999990.00')
          where ap.refunded_at is not null
          union all
          select pd.opened_at, 'Disputa aberta', pd.reason
          where pd.opened_at is not null
          union all
          select pd.closed_at, 'Disputa encerrada (' || pd.status || ')', null
          where pd.closed_at is not null
          union all
          select pi.created_at, 'Incluído em repasse (' || (case pi.kind when 'reserve' then 'reserva' else 'principal' end) || ')', null
          from public.partner_payout_items pi where pi.app_purchase_id = ap.id
          union all
          select po.created_at, 'Repasse confirmado', po.reference
          from public.partner_payout_items pi join public.partner_payouts po on po.id = pi.payout_id
          where pi.app_purchase_id = ap.id and po.status = 'confirmado'
          union all
          select po.reverted_at, 'Repasse revertido', po.revert_reason
          from public.partner_payout_items pi join public.partner_payouts po on po.id = pi.payout_id
          where pi.app_purchase_id = ap.id and po.reverted_at is not null
        ) ev
      )
    from public.app_purchases ap
    left join public.profiles pr on pr.id = ap.buyer_user_id
    left join public.applications a on a.id = ap.application_id
    left join lateral (
      select pd.status, pd.opened_at, pd.closed_at, pd.reason
      from public.payment_disputes pd
      where pd.source_type = 'app_purchases' and pd.source_id = ap.id
      order by pd.created_at desc limit 1
    ) pd on true
    left join lateral (
      select aac.status, aac.delivered_at
      from public.app_activation_codes aac
      where aac.order_id = ap.id::text
      order by aac.delivered_at desc nulls last limit 1
    ) ac on true
    where ap.id = p_sale_id and ap.partner_id = v_partner_id;
  else
    return query
    select
      si.id, 'subscription_invoice'::text, d.application_id, a.name, a.logo_url, s.plan_name,
      coalesce(pr.full_name, '—'), coalesce(pr.email, '—'),
      si.amount, si.commission_percent, si.commission_amount, si.partner_amount, si.paid_at,
      'confirmado'::text,
      16, si.paid_at + interval '16 days',
      greatest(0, ceil(extract(epoch from (si.paid_at + interval '16 days' - now())) / 86400.0))::integer,
      0::numeric(12,2), null::text, null::integer, null::timestamptz, null::integer,
      null::text, 0::numeric(12,2), null::text, null::timestamptz, null::integer,
      pd.status, pd.opened_at, pd.closed_at, pd.reason,
      null::text, null::timestamptz,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'kind', 'main', 'amount', pi.amount, 'payout_status', po.status,
          'payout_created_at', po.created_at, 'payout_reference', po.reference, 'reverted_at', po.reverted_at
        ) order by po.created_at desc), '[]'::jsonb)
        from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.subscription_invoice_id = si.id
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object('event_at', ev.event_at, 'label', ev.label, 'description', ev.description) order by ev.event_at), '[]'::jsonb)
        from (
          select si.paid_at as event_at, 'Pagamento confirmado' as label, null::text as description
          where si.paid_at is not null
          union all
          select pd.opened_at, 'Disputa aberta', pd.reason
          where pd.opened_at is not null
          union all
          select pd.closed_at, 'Disputa encerrada (' || pd.status || ')', null
          where pd.closed_at is not null
          union all
          select pi.created_at, 'Incluído em repasse', null
          from public.partner_payout_items pi where pi.subscription_invoice_id = si.id
          union all
          select po.created_at, 'Repasse confirmado', po.reference
          from public.partner_payout_items pi join public.partner_payouts po on po.id = pi.payout_id
          where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
          union all
          select po.reverted_at, 'Repasse revertido', po.revert_reason
          from public.partner_payout_items pi join public.partner_payouts po on po.id = pi.payout_id
          where pi.subscription_invoice_id = si.id and po.reverted_at is not null
        ) ev
      )
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.profiles pr on pr.id = s.user_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    left join lateral (
      select pd.status, pd.opened_at, pd.closed_at, pd.reason
      from public.payment_disputes pd
      where pd.source_type = 'subscription_invoices' and pd.source_id = si.id
      order by pd.created_at desc limit 1
    ) pd on true
    where si.id = p_sale_id and s.partner_id = v_partner_id;
  end if;
end;
$$;

revoke execute on function public.get_partner_sale_detail(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_sale_detail(uuid, text, uuid) to authenticated;

comment on function public.get_partner_sale_detail(uuid, text, uuid) is
  'Composição completa de uma venda (retenção, reserva, reembolso, disputa, ativação, repasses, histórico) pro painel de detalhes da aba Vendas. Confirma ap.partner_id/s.partner_id = v_partner_id — id de venda de outro parceiro retorna vazio.';
