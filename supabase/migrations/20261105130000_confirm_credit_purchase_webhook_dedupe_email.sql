-- Auditoria (2026-11-05): app/api/stripe/webhook/route.ts decidia se devia
-- (re)enviar o e-mail de recibo lendo credit_purchases.status ANTES de
-- chamar esta RPC — mas essa leitura não é protegida por lock nenhum.
-- Num redelivery quase-simultâneo do mesmo evento do Stripe (reentrega
-- manual do dashboard correndo junto de um retry por timeout), as DUAS
-- chamadas podiam ler status='pending' antes de qualquer uma confirmar —
-- o lock "for update" aqui dentro já garante que o crédito nunca é
-- mintado duas vezes, mas as duas enxergavam "não confirmada ainda" e as
-- duas mandavam e-mail de recibo pro cliente.
--
-- Fix: a função agora é a ÚNICA fonte da verdade sobre "fui eu que
-- confirmei agora, ou já estava confirmada antes de eu chegar" — ela
-- segura o lock, então só UMA chamada concorrente pode genuinamente ver
-- status='pending' e fazer a transição. Muda o retorno de
-- `credit_purchases` pra jsonb {purchase, was_already_paid}; a rota usa
-- was_already_paid pra decidir o e-mail, não mais uma leitura solta antes
-- da chamada.

drop function if exists public.confirm_credit_purchase_webhook(uuid);

create function public.confirm_credit_purchase_webhook("p_purchase_id" uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  purchase          public.credit_purchases;
  buyer_name        text;
  was_already_paid  boolean;
begin
  select * into purchase from public.credit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Compra não encontrada: %', p_purchase_id;
  end if;

  was_already_paid := (purchase.status <> 'pending');

  if was_already_paid then
    return jsonb_build_object('purchase', to_jsonb(purchase), 'was_already_paid', true);
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
    (type, client_id, client_name, description, amount, status, sale_date, received_date,
     source_type, source_id)
  values
    ('creditos',
     purchase.user_id,
     coalesce(buyer_name, 'Cliente'),
     'Venda de créditos — ' || purchase.credits_amount || ' créditos (Stripe)',
     purchase.amount_paid,
     'pago',
     current_date,
     current_date,
     'credit_purchases',
     purchase.id)
  on conflict (source_type, source_id) where source_type is not null and source_id is not null
  do nothing;

  return jsonb_build_object('purchase', to_jsonb(purchase), 'was_already_paid', false);
end;
$$;

revoke execute on function public.confirm_credit_purchase_webhook(uuid) from public, anon, authenticated;
grant execute on function public.confirm_credit_purchase_webhook(uuid) to service_role;
