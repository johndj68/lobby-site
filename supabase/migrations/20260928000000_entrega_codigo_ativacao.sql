-- Gap 4 (sinalizado após roadmap principal, "Constrói completo" aprovado
-- pelo usuário): entrega automática de código de ativação nunca funcionou
-- neste projeto. app/api/apps/activation/[appId]/upload-codes/route.ts só
-- valida um arquivo (dedupe por code_hash) e nunca grava em
-- app_activation_codes/app_activation_codes_batch — endpoint de
-- persistência não existe. E não existe nenhuma função que entregue um
-- código pro comprador na confirmação de compra.
--
-- app_activation_codes/app_activation_codes_batch já existem desde antes
-- (schema legado) com policies de INSERT/SELECT corretas pro parceiro
-- dono do app_draft — não precisam de migração. Só falta:
--   1) função atômica de entrega na confirmação de compra (webhook,
--      contexto service_role);
--   2) devolver o código entregue pro comprador (extensão de
--      get_my_app_purchase_access).
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra
-- revisão e `supabase db push` manual.

-- ─────────────────────────────────────────────────────────────────────────
-- deliver_activation_code — reserva+entrega atomicamente 1 código
-- disponível do plano da compra. Idempotente: se a compra já tem um
-- código com order_id = p_app_purchase_id, devolve o mesmo (reentrega do
-- webhook do Stripe não deve consumir 2 códigos). SECURITY DEFINER porque
-- roda no contexto do webhook (service_role), sem sessão de usuário —
-- travado só pra service_role via grant, mesmo padrão de
-- reserve_ad_capacity/confirm_ad_reservation (Etapa 2).
--
-- Lança 'SEM_CODIGO_DISPONIVEL' quando o estoque do plano zerou — o
-- chamador (webhook) trata isso como falha não-fatal (loga, não derruba a
-- confirmação de pagamento) em vez de deixar o handler inteiro falhar.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.deliver_activation_code(p_app_purchase_id uuid)
returns public.app_activation_codes
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_purchase public.app_purchases;
  v_code     public.app_activation_codes;
begin
  select * into v_purchase
  from public.app_purchases
  where id = p_app_purchase_id
  for update;

  if not found or v_purchase.status <> 'paid' then
    raise exception 'Compra não encontrada ou não confirmada.';
  end if;

  select * into v_code
  from public.app_activation_codes
  where order_id = p_app_purchase_id::text and status = 'delivered'
  limit 1;

  if found then
    return v_code;
  end if;

  select * into v_code
  from public.app_activation_codes
  where plan_id = v_purchase.plan_id and status = 'available'
  order by created_at
  limit 1
  for update skip locked;

  if not found then
    raise exception 'SEM_CODIGO_DISPONIVEL';
  end if;

  update public.app_activation_codes
  set status = 'delivered',
      delivered_to = v_purchase.buyer_user_id::text,
      delivered_at = now(),
      order_id = p_app_purchase_id::text
  where id = v_code.id
  returning * into v_code;

  update public.app_activation_codes_batch
  set available = available - 1,
      delivered = delivered + 1
  where id = v_code.batch_id;

  return v_code;
end;
$$;

revoke execute on function public.deliver_activation_code(uuid) from public, anon, authenticated;
grant execute on function public.deliver_activation_code(uuid) to service_role;


-- ─────────────────────────────────────────────────────────────────────────
-- get_my_app_purchase_access ganha o código entregue (null se o app não
-- usa entrega por código, ou se ainda não foi entregue — ex.: estoque
-- zerado). Assinatura de retorno muda (nova coluna) -> precisa DROP antes
-- do CREATE (mesma razão de confirm_credit_purchase/create_partner_payout
-- nesta sessão).
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_my_app_purchase_access(uuid);

create function public.get_my_app_purchase_access(p_purchase_id uuid)
returns table (activation_link text, support_email text, instructions jsonb, activation_code text)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_plan_id uuid;
begin
  select plan_id into v_plan_id
  from public.app_purchases
  where id = p_purchase_id and buyer_user_id = auth.uid() and status = 'paid';

  if v_plan_id is null then
    raise exception 'Compra não encontrada ou não confirmada.';
  end if;

  return query
  select c.activation_link, c.support_email, c.instructions,
         (select ac.code from public.app_activation_codes ac
          where ac.order_id = p_purchase_id::text and ac.status = 'delivered'
          limit 1) as activation_code
  from public.app_plans p
  join public.app_activation_config c on c.app_draft_id = p.app_draft_id
  where p.id = v_plan_id;
end;
$$;

revoke execute on function public.get_my_app_purchase_access(uuid) from public;
grant execute on function public.get_my_app_purchase_access(uuid) to authenticated;
