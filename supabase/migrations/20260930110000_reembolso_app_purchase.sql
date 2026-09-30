-- Reembolso de compra de app via Stripe, automatizado + retenção de
-- repasse sobe de 14 pra 16 dias (decisão do usuário 2026-09-30): janela
-- de reembolso é de 15 dias, repasse só fica elegível a partir do dia 16
-- — por construção as duas janelas nunca se sobrepõem, elimina qualquer
-- necessidade de "clawback" de parceiro que já recebeu (esse caso nunca
-- acontece). Spec completo em
-- docs/superpowers/specs/2026-09-30-app-purchase-refund-design.md.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) app_purchases ganha rastreio de reembolso — mesmo padrão já usado em
--    credit_purchases (20260927170000_reembolso_parcial.sql).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.app_purchases
  add column if not exists refund_status   text,
  add column if not exists refunded_amount numeric(12,2) not null default 0,
  add column if not exists refund_reason   text,
  add column if not exists refunded_at     timestamptz,
  add column if not exists refunded_by     uuid references auth.users(id);

alter table public.app_purchases
  add constraint app_purchases_refund_status_check
  check (refund_status is null or refund_status = any (array['processing', 'refunded']));

alter table public.app_purchases
  add constraint app_purchases_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= amount);

comment on column public.app_purchases.refund_status is
  'null = nunca reembolsada. processing = pedido em voo, aguardando confirmação do webhook Stripe (trava novo pedido concorrente). refunded = totalmente reembolsada (terminal). Depois de uma confirmação PARCIAL, volta a null — permite outro reembolso parcial depois.';
comment on column public.app_purchases.refunded_amount is
  'Soma cumulativa já reembolsada, confirmada pelo Stripe via charge.amount_refunded — nunca calculada localmente. Nunca excede amount.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) refund_app_purchase — pedido de reembolso (parcial ou total). Só
--    líder, só dentro da janela de 15 dias após o pagamento. Estado
--    otimista ('processing') até o webhook confirmar com o valor real do
--    Stripe — mesmo padrão de refund_credit_purchase.
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
  if purchase.paid_at is null or purchase.paid_at <= now() - interval '15 days' then
    raise exception 'Fora do prazo de reembolso — só é possível solicitar até 15 dias após o pagamento.';
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

revoke execute on function public.refund_app_purchase(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.refund_app_purchase(uuid, numeric, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) create_partner_payout — retenção 14→16 dias (app + assinatura) e
--    elegibilidade de app_purchases agora desconta a fatia de reembolso já
--    confirmada, proporcional ao partner_amount original. Mesma assinatura
--    de parâmetros de 20260927240000_repasse_assinatura.sql — CREATE OR
--    REPLACE direto, sem precisar dropar (lista de parâmetros não muda).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.create_partner_payout(
  "p_partner_id"                uuid,
  "p_app_purchase_ids"          uuid[],
  "p_reference"                 text,
  "p_notes"                     text default null,
  "p_subscription_invoice_ids"  uuid[] default null
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
  v_app_total         numeric(12,2) := 0;
  v_sub_total         numeric(12,2) := 0;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode registrar repasse.';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'Informe a referência/comprovante do repasse.';
  end if;
  if v_app_requested = 0 and v_sub_requested = 0 then
    raise exception 'Selecione ao menos uma venda ou fatura de assinatura pra repassar.';
  end if;

  if v_app_requested > 0 then
    perform 1 from public.app_purchases where id = any(p_app_purchase_ids) for update;

    select count(*), coalesce(sum(
        ap.partner_amount - round(ap.refunded_amount * ap.partner_amount / ap.amount)
      ), 0)
      into v_app_valid_count, v_app_total
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids)
      and ap.partner_id = p_partner_id
      and ap.status = 'paid'
      and ap.paid_at is not null
      and ap.paid_at <= now() - interval '16 days'
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and po.status = 'confirmado'
      );

    if v_app_valid_count <> v_app_requested then
      raise exception 'Uma ou mais vendas não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção de 16 dias, ou não são deste parceiro).';
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

  v_total := v_app_total + v_sub_total;

  insert into public.partner_payouts (partner_id, total_amount, reference, notes, requested_by)
  values (p_partner_id, v_total, trim(p_reference), nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning * into v_payout;

  if v_app_requested > 0 then
    insert into public.partner_payout_items (payout_id, app_purchase_id, amount)
    select v_payout.id, ap.id, ap.partner_amount - round(ap.refunded_amount * ap.partner_amount / ap.amount)
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids);
  end if;

  if v_sub_requested > 0 then
    insert into public.partner_payout_items (payout_id, subscription_invoice_id, amount)
    select v_payout.id, si.id, si.partner_amount
    from public.subscription_invoices si
    where si.id = any(p_subscription_invoice_ids);
  end if;

  return v_payout;
end;
$$;
