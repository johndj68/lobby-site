-- Reserva de disputa do parceiro: 10% do partner_amount retido até 120
-- dias sem disputa (janela de chargeback das bandeiras é bem maior que a
-- retenção de repasse de 16 dias). Decisão do usuário 2026-09-30. Spec
-- completo em docs/superpowers/specs/2026-09-30-partner-dispute-reserve-
-- design.md. Escopo: só app_purchases, subscription_invoices fica fora.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) app_purchases ganha reserve_amount/reserve_status — snapshot no
--    checkout (Task 2), nunca recalculado depois. reserve_amount é uma
--    fatia DENTRO de partner_amount, não um valor adicional — o CHECK
--    commission_amount+partner_amount=amount continua intacto sem mudança.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.app_purchases
  add column if not exists reserve_amount numeric(12,2) not null default 0,
  add column if not exists reserve_status text;

alter table public.app_purchases
  add constraint app_purchases_reserve_status_check
  check (reserve_status is null or reserve_status = any (array['held', 'released', 'clawed_back']));

alter table public.app_purchases
  add constraint app_purchases_reserve_amount_check
  check (reserve_amount >= 0 and reserve_amount <= partner_amount);

comment on column public.app_purchases.reserve_amount is
  '10% de partner_amount, snapshot no checkout. Só > 0 quando partner_id is not null (app da LOBBY nunca reserva nada, sem parceiro pra reter).';
comment on column public.app_purchases.reserve_status is
  'null = sem reserva (app da LOBBY). held = retida. released = liberada após 120 dias sem disputa, já paga. clawed_back = disputa perdida antes de liberar, LOBBY absorve, nunca paga.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) partner_payout_items ganha kind — a mesma venda agora pode ser paga
--    em dois momentos (principal no dia 16, reserva no dia 120). Sem isso,
--    a checagem de "já coberto por repasse confirmado" (por app_purchase_id
--    só) bloquearia a reserva pra sempre assim que a fatia principal fosse
--    paga. Linhas existentes recebem 'main' pelo default — correto, são
--    todas repasses da fatia principal (reserva nunca existiu antes desta
--    migração).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.partner_payout_items
  add column if not exists kind text not null default 'main';

alter table public.partner_payout_items
  add constraint partner_payout_items_kind_check
  check (kind = any (array['main', 'reserve']));

-- ─────────────────────────────────────────────────────────────────────────
-- 3) payment_disputes ganha partner_clawback_amount — quanto já foi pago
--    ao parceiro ANTES da disputa chegar (soma de partner_payout_items
--    confirmados daquela venda, de qualquer kind). null/0 = nada a cobrar.
--    Gravado pelo webhook (Task 3), nunca calculado no client.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.payment_disputes
  add column if not exists partner_clawback_amount numeric(12,2);

comment on column public.payment_disputes.partner_clawback_amount is
  'Quanto já tinha sido pago ao parceiro (repasse confirmado) antes desta disputa perdida chegar — sem API de débito bancário no sistema, cobrança continua manual. null/0 = nada a cobrar (reserva absorveu tudo, ou nada tinha sido pago ainda).';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) create_partner_payout — ganha p_reserve_app_purchase_ids (6º
--    parâmetro). Postgres NÃO substitui uma função por outra com lista de
--    parâmetros diferente via CREATE OR REPLACE — mesmo motivo que já
--    forçou o DROP na migração anterior (4→5 parâmetros,
--    20260927240000_repasse_assinatura.sql). Sem o DROP abaixo, a versão
--    de 5 parâmetros continuaria existindo como um overload separado ao
--    lado da nova, e chamadas via supabase.rpc (que resolve por nome +
--    quantidade de argumentos informados) poderiam ficar ambíguas ou
--    continuar batendo na versão antiga sem a reserva. Fatia principal
--    agora paga partner_amount MENOS a reserva (a reserva nunca foi
--    elegível aqui); reserva só entra pela lista nova, com sua própria
--    janela de 120 dias e seu próprio desconto por reembolso
--    (independente do desconto da fatia principal — ver Global
--    Constraints do plano).
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.create_partner_payout(uuid, uuid[], text, text, uuid[]);

create function public.create_partner_payout(
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
      and ap.paid_at <= now() - interval '16 days'
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
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
      and ap.paid_at <= now() - interval '120 days'
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'reserve' and po.status = 'confirmado'
      );

    if v_reserve_valid_count <> v_reserve_requested then
      raise exception 'Uma ou mais reservas não são elegíveis pra liberação agora (já liberadas, ainda dentro dos 120 dias, com disputa, ou não são deste parceiro).';
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

revoke execute on function public.create_partner_payout(uuid, uuid[], text, text, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.create_partner_payout(uuid, uuid[], text, text, uuid[], uuid[]) to authenticated;
