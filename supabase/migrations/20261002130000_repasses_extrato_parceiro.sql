-- RPCs de leitura da fila de repasse e do extrato pro próprio parceiro
-- (Etapa 4 do roadmap "Vendas e financeiro" — Repasses e extrato).
-- Mesmo padrão de auto-escopo da Etapa 3 (20261002110000/20261002120000):
-- auth.uid() direto, sem p_partner_id, revoke+grant explícitos.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_partner_payout_queue_main — vendas (compra única + assinatura)
--    ainda não cobertas por repasse confirmado da fatia principal, com
--    data exata de liberação (nunca um número presumido).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_payout_queue_main()
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
begin
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
    where ap.partner_id = auth.uid()
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
    where s.partner_id = auth.uid()
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

revoke execute on function public.get_partner_payout_queue_main() from public, anon, authenticated;
grant execute on function public.get_partner_payout_queue_main() to authenticated;

comment on function public.get_partner_payout_queue_main() is
  'Fila de vendas (compra única + fatura de assinatura) ainda não cobertas por repasse confirmado da fatia principal, com data exata de liberação (paid_at + retention_days, snapshot — nunca presumido). Exclui compras totalmente reembolsadas.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_payout_queue_reserve — reserva de disputa ainda retida
--    (reserve_status='held'), só app_purchases.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_payout_queue_reserve()
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
begin
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
    where ap.partner_id = auth.uid()
      and ap.status = 'paid'
      and ap.paid_at is not null
      and ap.reserve_status = 'held'
  ) combined
  order by combined.release_date asc, combined.sale_id;
end;
$$;

revoke execute on function public.get_partner_payout_queue_reserve() from public, anon, authenticated;
grant execute on function public.get_partner_payout_queue_reserve() to authenticated;

comment on function public.get_partner_payout_queue_reserve() is
  'Fila de reserva de disputa (10% retido por até reserve_window_days) ainda não liberada nem perdida em disputa. reserve_status=held já basta como filtro — create_partner_payout vira released no momento do repasse, não existe estado intermediário coberto-mas-ainda-held.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) get_partner_payout_history — uma linha por item de repasse; o client
--    agrupa por payout_id pro drill-down. Inclui repasses revertidos
--    (transparência do histórico completo, nunca esconder um estorno).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_payout_history()
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
begin
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
  where po.partner_id = auth.uid()
  order by po.created_at desc, pi.id;
end;
$$;

revoke execute on function public.get_partner_payout_history() from public, anon, authenticated;
grant execute on function public.get_partner_payout_history() to authenticated;

comment on function public.get_partner_payout_history() is
  'Extrato de repasses do parceiro (confirmados e revertidos), uma linha por item coberto — client agrupa por payout_id pro drill-down. LEFT JOIN nos itens: um repasse sem item nenhum (não deveria existir) ainda aparece.';
