-- Integração Stripe: adiciona colunas de rastreamento, coluna stripe_price_id
-- nos pacotes, campo onboarded em profiles e uma função dedicada para o
-- webhook confirmar compras sem precisar de auth.uid() de líder.
--
-- Problema resolvido: confirm_credit_purchase exige is_leader(auth.uid()),
-- mas o webhook roda com service_role → auth.uid() = NULL → função falhava.
-- Solução: confirm_credit_purchase_webhook sem checagem de líder, só
-- acessível via service_role (revoke de authenticated e anon).

-- ── 1. credit_packages: Stripe Price ID ─────────────────────────────────────
-- Usado pelo checkout/route.ts: se preenchido, passa direto para Stripe;
-- se nulo, cria um price_data dinâmico com o valor de pkg.price.

alter table public.credit_packages
  add column if not exists stripe_price_id text;

-- ── 2. credit_purchases: rastreamento Stripe ────────────────────────────────
-- stripe_session_id:        ID da Checkout Session (cs_...)
-- stripe_payment_intent_id: ID do PaymentIntent (pi_...) extraído após pagamento

alter table public.credit_purchases
  add column if not exists stripe_session_id         text unique,
  add column if not exists stripe_payment_intent_id  text unique;

-- Index para lookup rápido no webhook (session ID chega no evento)
create index if not exists credit_purchases_stripe_session_idx
  on public.credit_purchases (stripe_session_id)
  where stripe_session_id is not null;

-- ── 3. profiles: campo onboarded ────────────────────────────────────────────
-- Controla se o cliente já passou pelo fluxo de boas-vindas (OnboardingWelcome).
-- Default false: novos clientes veem a tela; após dispensar, update para true.

alter table public.profiles
  add column if not exists onboarded boolean not null default false;

-- ── 4. Segurança: remover policy de insert direto em credit_purchases ────────
-- Antes: cliente podia inserir purchase diretamente do browser (BuyCreditsModal
-- fazia insert client-side). Agora: o insert é feito pelo servidor via admin
-- client em /api/stripe/checkout. Clientes não devem mais escrever na tabela.
-- A select policy permanece para que clientes vejam o histórico de compras.

drop policy if exists "client_insert_own_purchase" on public.credit_purchases;

-- ── 5. confirm_credit_purchase_webhook ──────────────────────────────────────
-- Versão da função de confirmação para uso exclusivo do webhook Stripe.
-- Diferença principal: não verifica is_leader(auth.uid()) — o webhook usa
-- service_role, então auth.uid() seria NULL e a checagem falharia.
-- REVOKE garante que nenhum usuário autenticado chame direto.
--
-- Lógica idêntica à confirm_credit_purchase:
--   - SELECT FOR UPDATE para evitar double-credit em retentativas
--   - UPDATE status → 'paid' + paid_at
--   - add_credits (que por sua vez é SECURITY DEFINER e não precisa de role)
--   - INSERT em financial_transactions
-- responsible_user_id omitido — não há usuário humano nesta chamada.

create or replace function public.confirm_credit_purchase_webhook(p_purchase_id uuid)
returns public.credit_purchases
language plpgsql
security definer set search_path = public
as $$
declare
  purchase   public.credit_purchases;
  buyer_name text;
begin
  select * into purchase
    from public.credit_purchases
    where id = p_purchase_id
    for update;

  if not found then
    raise exception 'Compra não encontrada: %', p_purchase_id;
  end if;

  if purchase.status <> 'pending' then
    -- Idempotência: retorna sem erro se já confirmada (webhook retry)
    return purchase;
  end if;

  update public.credit_purchases
    set status    = 'paid',
        paid_at   = now(),
        updated_at = now()
    where id = p_purchase_id
    returning * into purchase;

  perform public.add_credits(
    purchase.user_id,
    purchase.credits_amount,
    'purchase',
    'Compra de créditos confirmada via Stripe',
    'credit_purchases',
    purchase.id,
    null   -- created_by: sem usuário humano no fluxo do webhook
  );

  select full_name into buyer_name
    from public.profiles where id = purchase.user_id;

  insert into public.financial_transactions
    (type, client_id, client_name, description, amount, status, sale_date, received_date)
  values
    ('creditos',
     purchase.user_id,
     coalesce(buyer_name, 'Cliente'),
     'Venda de créditos — ' || purchase.credits_amount || ' créditos (Stripe)',
     purchase.amount_paid,
     'pago',
     current_date,
     current_date);

  return purchase;
end;
$$;

-- Somente service_role pode chamar esta função (webhook usa admin client)
revoke execute on function public.confirm_credit_purchase_webhook(uuid) from authenticated, anon;
