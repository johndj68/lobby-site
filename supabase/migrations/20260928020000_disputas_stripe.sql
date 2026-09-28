-- Contestação/disputa Stripe (charge.dispute.*) — sinalizado no
-- diagnóstico original, nunca coberto. Decisão do usuário: além de
-- registrar e notificar o líder, o sistema congela automaticamente o que
-- a cobrança disputada liberou (créditos/acesso/campanha/assinatura),
-- por tipo de origem.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra
-- revisão e `supabase db push` manual.

-- ─────────────────────────────────────────────────────────────────────────
-- payment_disputes — 1 linha por disputa Stripe, linkada à origem via
-- source_type/source_id (mesmo padrão de financial_transactions). Nunca
-- ebook_purchases: ebook só é pago via crédito ou manual (payment_provider
-- in ('credits','manual')), nunca tem cobrança Stripe própria pra
-- disputar — confirmado em lib/ebooks.ts.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.payment_disputes (
  id                        uuid primary key default gen_random_uuid(),
  stripe_dispute_id         text not null unique,
  stripe_payment_intent_id  text,
  -- Nullable: se a disputa não bater com nenhuma compra nossa (ex: charge
  -- órfão, ou payment_intent de produto que não existe mais), a linha
  -- ainda é registrada pra visibilidade do líder em vez de ser
  -- silenciosamente descartada — só não tem congelamento nenhum pra
  -- aplicar.
  source_type               text check (source_type in ('credit_purchases', 'app_purchases', 'campaign_purchases', 'subscription_invoices')),
  source_id                 uuid,
  amount                    numeric(12,2) not null,
  currency                  text not null default 'BRL',
  reason                    text,
  status                    text not null, -- espelha Stripe: needs_response, under_review, won, lost, warning_closed, etc.
  -- Só preenchido pra source_type='credit_purchases' — quantos créditos
  -- saíram do saldo pra held_credits nesta disputa especificamente (não
  -- confia no held_credits agregado da carteira pra saber quanto
  -- devolver no dispute.closed, porque é um contador compartilhado).
  held_amount               integer,
  opened_at                 timestamptz not null default now(),
  closed_at                 timestamptz,
  created_at                timestamptz not null default now()
);

create index if not exists payment_disputes_source_idx on public.payment_disputes (source_type, source_id);
create index if not exists payment_disputes_pi_idx on public.payment_disputes (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

alter table public.payment_disputes enable row level security;

grant select on table public.payment_disputes to authenticated;
grant all on table public.payment_disputes to service_role;

-- Financeiro sensível — só líder, mesmo padrão de subscription_invoices/
-- partner_payouts/financial_transactions.
create policy "leader_select_payment_disputes" on public.payment_disputes
  for select to authenticated
  using (public.is_leader(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- Campos de congelamento por tipo de origem.
--
-- credit_purchases/client_credit_wallets: crédito é um saldo fungível
-- (não rastreia de qual compra veio cada crédito, mesmo princípio do
-- reembolso parcial da peça 1) — "congelar" move os créditos daquela
-- compra especificamente pra held_credits, saindo de balance (que
-- continua sendo o único campo que a função de gasto de crédito olha —
-- nenhuma mudança necessária nela: crédito em held nunca é gasto porque
-- já não está mais em balance).
--
-- app_purchases/campaign_purchases: status ganha 'disputed' — as duas já
-- têm consumidor real que filtra por status='paid' (get_my_app_purchase_
-- access e o pause de campanha respectivamente), então marcar
-- 'disputed' já revoga acesso/pausa a campanha sem precisar de coluna
-- nova.
--
-- subscriptions: status é 100% espelho do Stripe (customer.subscription.
-- updated sobrescreve isso a qualquer momento) — coluna própria
-- `disputed`, separada de status, pra não ser pisada pelo próximo evento
-- de sincronização. Ainda não existe nenhum ponto no código que gate
-- acesso real por status de assinatura (só o checkout usa status='active'
-- pra bloquear assinatura duplicada) — a flag fica registrada e visível
-- no admin pra decisão manual, e disponível pra um gate de acesso futuro.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.client_credit_wallets
  add column if not exists held_credits integer not null default 0 check (held_credits >= 0);

alter table public.app_purchases
  drop constraint app_purchases_status_check;
alter table public.app_purchases
  add constraint app_purchases_status_check
  check (status = any (array['pending', 'paid', 'canceled', 'failed', 'refunded', 'disputed']));

alter table public.campaign_purchases
  drop constraint campaign_purchases_status_check;
alter table public.campaign_purchases
  add constraint campaign_purchases_status_check
  check (status = any (array['pending', 'paid', 'failed', 'refunded', 'isento', 'disputed']));

alter table public.subscriptions
  add column if not exists disputed boolean not null default false;


-- ─────────────────────────────────────────────────────────────────────────
-- freeze_credit_purchase_for_dispute / unfreeze — únicas duas operações
-- que precisam de RPC atômica aqui (math de saldo com lock; os outros 3
-- tipos são só um UPDATE de campo simples, feito direto pelo webhook via
-- admin client, sem precisar de função). SECURITY DEFINER restrito a
-- service_role — só o webhook chama isso, nunca uma sessão de usuário.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.freeze_credit_purchase_for_dispute(p_purchase_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_purchase public.credit_purchases;
  v_wallet   public.client_credit_wallets;
  v_hold     integer;
begin
  select * into v_purchase from public.credit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Compra de crédito não encontrada.';
  end if;

  select * into v_wallet from public.client_credit_wallets where user_id = v_purchase.user_id for update;
  if not found then
    return 0;
  end if;

  v_hold := least(v_purchase.credits_amount, v_wallet.balance);

  update public.client_credit_wallets
  set balance      = balance - v_hold,
      held_credits = held_credits + v_hold
  where user_id = v_purchase.user_id;

  return v_hold;
end;
$$;

revoke execute on function public.freeze_credit_purchase_for_dispute(uuid) from public, anon, authenticated;
grant execute on function public.freeze_credit_purchase_for_dispute(uuid) to service_role;

create or replace function public.unfreeze_credit_purchase_for_dispute(p_purchase_id uuid, p_held_amount integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.credit_purchases where id = p_purchase_id;
  if v_user_id is null then
    raise exception 'Compra de crédito não encontrada.';
  end if;
  if p_held_amount is null or p_held_amount <= 0 then
    return;
  end if;

  update public.client_credit_wallets
  set held_credits = held_credits - p_held_amount,
      balance      = balance + p_held_amount
  where user_id = v_user_id;
end;
$$;

revoke execute on function public.unfreeze_credit_purchase_for_dispute(uuid, integer) from public, anon, authenticated;
grant execute on function public.unfreeze_credit_purchase_for_dispute(uuid, integer) to service_role;
