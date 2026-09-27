-- Reembolso parcial de créditos e financeiro geral (decisão comercial
-- confirmada 2026-09-27: "sim, pra créditos e financeiro geral").
--
-- Reaproveita o único padrão de reembolso Stripe que já funciona no projeto
-- (campaign_purchases: refund_status/refund_reason/refunded_at/refunded_by,
-- ver supabase/migrations/20260924000000_marketplace_destaques.sql), mas
-- corrige uma limitação daquele padrão pra suportar reembolso PARCIAL de
-- verdade: refund_status volta a NULL depois de uma confirmação parcial
-- (não fica travado em "processing" pra sempre) — só vira o estado
-- terminal 'refunded' quando o valor acumulado reembolsado pelo Stripe
-- bate com o valor total pago. Isso permite múltiplos reembolsos parciais
-- ao longo do tempo pra mesma compra, cada um travado individualmente
-- (via refund_status='processing' + lock de linha) só enquanto aquele
-- pedido específico está em voo até o webhook confirmar.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual, mesma disciplina da Etapa 2.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) credit_purchases ganha rastreio de reembolso
-- ─────────────────────────────────────────────────────────────────────────

alter table public.credit_purchases
  add column if not exists refund_status   text,
  add column if not exists refunded_amount numeric(12,2) not null default 0,
  add column if not exists refund_reason   text,
  add column if not exists refunded_at     timestamptz,
  add column if not exists refunded_by     uuid references auth.users(id);

alter table public.credit_purchases
  add constraint credit_purchases_refund_status_check
  check (refund_status is null or refund_status = any (array['processing', 'refunded']));

alter table public.credit_purchases
  add constraint credit_purchases_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= amount_paid);

comment on column public.credit_purchases.refund_status is
  'null = nunca reembolsada. processing = pedido de reembolso em voo, aguardando confirmação do webhook Stripe (trava novo pedido concorrente). refunded = totalmente reembolsada (terminal). Depois de uma confirmação PARCIAL, volta a null — permite outro reembolso parcial depois.';
comment on column public.credit_purchases.refunded_amount is
  'Soma cumulativa já reembolsada (confirmada pelo Stripe via charge.amount_refunded, nunca calculada localmente). Nunca excede amount_paid.';


-- ─────────────────────────────────────────────────────────────────────────
-- 2) financial_transactions ganha valor reembolsado (sem coluna de status
--    dedicada — reaproveita o enum status existente: 'reembolsado' só
--    quando o valor reembolsado cobre o total; parcial mantém 'pago')
-- ─────────────────────────────────────────────────────────────────────────

alter table public.financial_transactions
  add column if not exists refunded_amount numeric(12,2) not null default 0;

alter table public.financial_transactions
  add constraint financial_transactions_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= amount);


-- ─────────────────────────────────────────────────────────────────────────
-- 3) refund_credit_purchase — prepara o estado local (débito opcional de
--    créditos + trava de reembolso em voo). NÃO chama Stripe (isso é JS) —
--    a rota da API chama Stripe primeiro, só chama esta função depois do
--    Stripe aceitar o pedido (mesma ordem de
--    app/api/admin/campaigns/[campaignId]/refund/route.ts).
--
-- Créditos consumidos são ambíguos por design (saldo é um pool único, não
-- rastreia de qual compra veio cada crédito — seções 3/6 do pedido
-- original). A função não adivinha: recebe p_credits_to_deduct explícito,
-- decidido pelo admin olhando o saldo atual na tela antes de confirmar.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.refund_credit_purchase(
  "p_purchase_id"       uuid,
  "p_amount"            numeric,
  "p_reason"            text,
  "p_credits_to_deduct" integer default 0
)
returns public.credit_purchases
language plpgsql security definer
set search_path to 'public'
as $$
declare
  purchase public.credit_purchases;
  wallet   public.client_credit_wallets;
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

  select * into purchase from public.credit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  if purchase.status <> 'paid' then
    raise exception 'Só é possível reembolsar uma compra paga.';
  end if;
  if purchase.refund_status = 'processing' then
    raise exception 'Já existe um reembolso em andamento para esta compra — aguarde a confirmação antes de pedir outro.';
  end if;
  if p_amount > (purchase.amount_paid - purchase.refunded_amount) then
    raise exception 'Valor maior que o saldo ainda reembolsável (R$ %).', (purchase.amount_paid - purchase.refunded_amount);
  end if;

  if p_credits_to_deduct is not null and p_credits_to_deduct > 0 then
    update public.client_credit_wallets
      set balance = balance - p_credits_to_deduct,
          total_spent = total_spent + p_credits_to_deduct,
          updated_at = now()
      where user_id = purchase.user_id and balance >= p_credits_to_deduct
      returning * into wallet;
    if not found then
      raise exception 'Saldo insuficiente na carteira do cliente para debitar % créditos.', p_credits_to_deduct;
    end if;

    insert into public.credit_transactions
      (wallet_id, user_id, type, amount, direction, balance_after, description, status, reference_type, reference_id, created_by)
    values
      (wallet.id, purchase.user_id, 'refund', p_credits_to_deduct, 'debit', wallet.balance, p_reason, 'completed', 'credit_purchases', purchase.id, auth.uid());
  end if;

  update public.credit_purchases
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

revoke execute on function public.refund_credit_purchase(uuid, numeric, text, integer) from public, anon, authenticated;
grant execute on function public.refund_credit_purchase(uuid, numeric, text, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 4) refund_financial_transaction — lançamentos gerais (a maioria é
--    recebimento manual, PIX/dinheiro/boleto, não Stripe) — sem chamada a
--    provedor nenhum, mesmo padrão de confiança manual atestada já usado
--    em confirm_ebook_purchase_manual (Etapa 2). Justificativa vai pra
--    `notes` (não existe coluna dedicada aqui, reaproveita o campo livre
--    já usado pra anotações internas).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.refund_financial_transaction(
  "p_transaction_id" uuid,
  "p_amount"          numeric,
  "p_reason"          text
)
returns public.financial_transactions
language plpgsql security definer
set search_path to 'public'
as $$
declare
  tx public.financial_transactions;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode registrar reembolso.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Informe o motivo do reembolso.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor de reembolso inválido.';
  end if;

  select * into tx from public.financial_transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
  if tx.status <> 'pago' then
    raise exception 'Só é possível reembolsar um lançamento pago.';
  end if;
  if p_amount > (tx.amount - tx.refunded_amount) then
    raise exception 'Valor maior que o saldo ainda reembolsável (R$ %).', (tx.amount - tx.refunded_amount);
  end if;

  update public.financial_transactions
    set refunded_amount = tx.refunded_amount + p_amount,
        status      = case when tx.refunded_amount + p_amount >= tx.amount then 'reembolsado' else status end,
        notes       = coalesce(notes || E'\n', '') || 'Reembolso de ' || to_char(p_amount, 'FM999999990.00') || ' em ' || to_char(now(), 'DD/MM/YYYY') || ': ' || p_reason,
        updated_at  = now()
    where id = p_transaction_id
    returning * into tx;

  return tx;
end;
$$;

revoke execute on function public.refund_financial_transaction(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.refund_financial_transaction(uuid, numeric, text) to authenticated;
