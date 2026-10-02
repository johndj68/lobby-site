-- Snapshot dos prazos financeiros por venda (reembolso/retenção/reserva).
-- Achado na auditoria da área "Vendas e financeiro" do parceiro
-- (2026-10-01): os 3 prazos (15d reembolso, 16d retenção, 120d reserva)
-- eram literais fixos nas RPCs — uma mudança futura na constante valeria
-- retroativamente pra toda venda já existente, não só pras novas. Spec
-- completo em docs/superpowers/specs/2026-10-01-snapshot-prazos-
-- financeiros-design.md. Produção tem zero linhas em app_purchases —
-- sem backfill a decidir.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) app_purchases ganha os 3 prazos como snapshot — mesmo princípio de
--    commission_percent/commission_amount, gravados no checkout, nunca
--    recalculados depois.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.app_purchases
  add column if not exists refund_window_days   integer not null default 15,
  add column if not exists retention_days        integer not null default 16,
  add column if not exists reserve_window_days    integer not null default 120;

alter table public.app_purchases
  add constraint app_purchases_refund_window_days_check check (refund_window_days > 0);
alter table public.app_purchases
  add constraint app_purchases_retention_days_check check (retention_days > 0);
alter table public.app_purchases
  add constraint app_purchases_reserve_window_days_check check (reserve_window_days > 0);

comment on column public.app_purchases.refund_window_days is
  'Janela de reembolso voluntário (dias), snapshot no checkout — nunca recalculada. Fonte de verdade da RPC refund_app_purchase pra esta venda específica.';
comment on column public.app_purchases.retention_days is
  'Retenção da fatia principal de repasse (dias), snapshot no checkout. Fonte de verdade da RPC create_partner_payout pra esta venda específica.';
comment on column public.app_purchases.reserve_window_days is
  'Janela da reserva de disputa (dias), snapshot no checkout. Fonte de verdade da RPC create_partner_payout pra esta venda específica.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) refund_app_purchase — lê refund_window_days da própria venda em vez
--    de interval '15 days' fixo. Assinatura idêntica (3 params) — CREATE
--    OR REPLACE direto, sem DROP.
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
  if purchase.paid_at is null or purchase.paid_at <= now() - (purchase.refund_window_days || ' days')::interval then
    raise exception 'Fora do prazo de reembolso — só é possível solicitar até % dias após o pagamento.', purchase.refund_window_days;
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

-- ─────────────────────────────────────────────────────────────────────────
-- 3) create_partner_payout — só a perna de app_purchases passa a ler
--    retention_days/reserve_window_days da venda em vez de interval '16
--    days'/'120 days' fixos. subscription_invoices continua com '16 days'
--    fixo (fora de escopo). Assinatura idêntica (6 params) — CREATE OR
--    REPLACE direto, sem DROP.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.create_partner_payout(
  "p_partner_id"                uuid,
  "p_app_purchase_ids"          uuid[],
  "p_reference"                 text,
  "p_notes"                     text default null,
  "p_subscription_invoice_ids"  uuid[] default null,
  "p_reserve_app_purchase_ids"  uuid[] default null
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
  v_reserve_valid_count integer := 0;
  v_reserve_requested   integer := coalesce(array_length(p_reserve_app_purchase_ids, 1), 0);
  v_app_total         numeric(12,2) := 0;
  v_sub_total         numeric(12,2) := 0;
  v_reserve_total      numeric(12,2) := 0;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode registrar repasse.';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'Informe a referência/comprovante do repasse.';
  end if;
  if v_app_requested = 0 and v_sub_requested = 0 and v_reserve_requested = 0 then
    raise exception 'Selecione ao menos uma venda ou fatura de assinatura pra repassar.';
  end if;

  if v_app_requested > 0 then
    perform 1 from public.app_purchases where id = any(p_app_purchase_ids) for update;

    select count(*), coalesce(sum(
        (ap.partner_amount - ap.reserve_amount)
          - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2)
      ), 0)
      into v_app_valid_count, v_app_total
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids)
      and ap.partner_id = p_partner_id
      and ap.status = 'paid'
      and ap.paid_at is not null
      and ap.paid_at <= now() - (ap.retention_days || ' days')::interval
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
      );

    if v_app_valid_count <> v_app_requested then
      raise exception 'Uma ou mais vendas não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção, ou não são deste parceiro).';
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

  if v_reserve_requested > 0 then
    perform 1 from public.app_purchases where id = any(p_reserve_app_purchase_ids) for update;

    select count(*), coalesce(sum(
        ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2)
      ), 0)
      into v_reserve_valid_count, v_reserve_total
    from public.app_purchases ap
    where ap.id = any(p_reserve_app_purchase_ids)
      and ap.partner_id = p_partner_id
      and ap.status = 'paid'
      and ap.reserve_status = 'held'
      and ap.paid_at is not null
      and ap.paid_at <= now() - (ap.reserve_window_days || ' days')::interval
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'reserve' and po.status = 'confirmado'
      );

    if v_reserve_valid_count <> v_reserve_requested then
      raise exception 'Uma ou mais reservas não são elegíveis pra liberação agora (já liberadas, ainda dentro da janela, com disputa, ou não são deste parceiro).';
    end if;
  end if;

  v_total := v_app_total + v_sub_total + v_reserve_total;

  insert into public.partner_payouts (partner_id, total_amount, reference, notes, requested_by)
  values (p_partner_id, v_total, trim(p_reference), nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning * into v_payout;

  if v_app_requested > 0 then
    insert into public.partner_payout_items (payout_id, app_purchase_id, amount, kind)
    select v_payout.id, ap.id,
           (ap.partner_amount - ap.reserve_amount) - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2),
           'main'
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids);
  end if;

  if v_sub_requested > 0 then
    insert into public.partner_payout_items (payout_id, subscription_invoice_id, amount)
    select v_payout.id, si.id, si.partner_amount
    from public.subscription_invoices si
    where si.id = any(p_subscription_invoice_ids);
  end if;

  if v_reserve_requested > 0 then
    insert into public.partner_payout_items (payout_id, app_purchase_id, amount, kind)
    select v_payout.id, ap.id,
           ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2),
           'reserve'
    from public.app_purchases ap
    where ap.id = any(p_reserve_app_purchase_ids);

    update public.app_purchases
      set reserve_status = 'released'
      where id = any(p_reserve_app_purchase_ids);
  end if;

  return v_payout;
end;
$$;
