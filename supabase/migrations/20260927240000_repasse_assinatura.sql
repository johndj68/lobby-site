-- Repasse de receita de assinatura (gap 3/4 sinalizado depois do roadmap
-- principal). Peça 4 (repasse) só olhava app_purchases — receita
-- recorrente de app_plan com parceiro (subscription_invoices.
-- partner_amount) nunca entrava na fila, apesar de peça 5 já computar e
-- guardar esse valor por ciclo.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual.

-- ─────────────────────────────────────────────────────────────────────────
-- partner_payout_items ganha subscription_invoice_id — mesmo padrão de
-- duas FKs nullable já usado em subscriptions (app_plan_id/
-- client_project_id) em vez de id polimórfico. app_purchase_id deixa de
-- ser NOT NULL (um repasse agora pode ser 100% de receita de assinatura).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.partner_payout_items
  alter column app_purchase_id drop not null;

alter table public.partner_payout_items
  add column if not exists subscription_invoice_id uuid references public.subscription_invoices(id);

alter table public.partner_payout_items
  add constraint partner_payout_items_source_check
  check (
    (app_purchase_id is not null and subscription_invoice_id is null)
    or
    (app_purchase_id is null and subscription_invoice_id is not null)
  );

create index if not exists partner_payout_items_subscription_invoice_idx
  on public.partner_payout_items (subscription_invoice_id) where subscription_invoice_id is not null;


-- ─────────────────────────────────────────────────────────────────────────
-- create_partner_payout — assinatura muda (novo parâmetro), precisa DROP
-- antes do CREATE (mesma razão de confirm_credit_purchase na Etapa 2:
-- Postgres não substitui função por outra com lista de parâmetros
-- diferente via CREATE OR REPLACE).
--
-- Mesma janela de retenção de 14 dias e mesma trava contra repasse
-- duplicado, agora nas duas fontes. Pelo menos uma das duas listas
-- precisa ter item — repasse vazio não faz sentido.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.create_partner_payout(uuid, uuid[], text, text);

create function public.create_partner_payout(
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

    select count(*), coalesce(sum(ap.partner_amount), 0)
      into v_app_valid_count, v_app_total
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids)
      and ap.partner_id = p_partner_id
      and ap.status = 'paid'
      and ap.paid_at is not null
      and ap.paid_at <= now() - interval '14 days'
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and po.status = 'confirmado'
      );

    if v_app_valid_count <> v_app_requested then
      raise exception 'Uma ou mais vendas não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção de 14 dias, ou não são deste parceiro).';
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
      and si.paid_at <= now() - interval '14 days'
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
      );

    if v_sub_valid_count <> v_sub_requested then
      raise exception 'Uma ou mais faturas de assinatura não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção de 14 dias, ou não são deste parceiro).';
    end if;
  end if;

  v_total := v_app_total + v_sub_total;

  insert into public.partner_payouts (partner_id, total_amount, reference, notes, requested_by)
  values (p_partner_id, v_total, trim(p_reference), nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning * into v_payout;

  if v_app_requested > 0 then
    insert into public.partner_payout_items (payout_id, app_purchase_id, amount)
    select v_payout.id, ap.id, ap.partner_amount
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

revoke execute on function public.create_partner_payout(uuid, uuid[], text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.create_partner_payout(uuid, uuid[], text, text, uuid[]) to authenticated;
