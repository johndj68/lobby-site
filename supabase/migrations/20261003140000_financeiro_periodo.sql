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
