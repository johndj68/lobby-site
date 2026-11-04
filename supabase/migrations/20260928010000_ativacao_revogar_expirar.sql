-- Continuação do gap 4 (itens sinalizados depois de fechar a entrega de
-- código): parceiro não tinha como revogar/excluir um lote importado
-- errado, e lote de código não tinha data de validade.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra
-- revisão e `supabase db push` manual.

-- ─────────────────────────────────────────────────────────────────────────
-- Validade do lote — batch-level (não por código individual: simplicidade
-- suficiente pro pedido, e todo código de um lote normalmente compartilha
-- a mesma janela de validade). Código expirado nunca é escolhido por
-- deliver_activation_code (abaixo), mas não muda de status sozinho —
-- sem job/cron no projeto, e não foi pedido.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.app_activation_codes_batch
  add column if not exists expires_at timestamptz;


-- ─────────────────────────────────────────────────────────────────────────
-- revoke_activation_batch — revoga todos os códigos ainda 'available' de
-- um lote (não afeta os já 'delivered' — histórico de entrega nunca
-- muda). Remove os revogados da contagem do lote inteiramente
-- (total_codes e available caem juntos), porque 'revoked' não entra no
-- check valid_counts (available+reserved+delivered=total_codes) — o
-- código revogado fica só como registro auditável com status='revoked'.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.revoke_activation_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner_id uuid;
  v_count    integer;
begin
  select d.created_by into v_owner_id
  from public.app_activation_codes_batch b
  join public.app_drafts d on d.id = b.app_draft_id
  where b.id = p_batch_id
  for update of b;

  if v_owner_id is null then
    raise exception 'Lote não encontrado.';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Sem permissão sobre este lote.';
  end if;

  with revoked as (
    update public.app_activation_codes
    set status = 'revoked'
    where batch_id = p_batch_id and status = 'available'
    returning 1
  )
  select count(*) into v_count from revoked;

  update public.app_activation_codes_batch
  set available   = available - v_count,
      total_codes = total_codes - v_count
  where id = p_batch_id;

  return v_count;
end;
$$;

revoke execute on function public.revoke_activation_batch(uuid) from public, anon;
grant execute on function public.revoke_activation_batch(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- delete_activation_batch — só permite excluir um lote que nunca entregou
-- nada (delivered = 0). Se já entregou, o lote fica pra sempre como
-- registro (mesmo que todo o resto tenha sido revogado) — usa
-- revoke_activation_batch pra esvaziar o estoque restante em vez de
-- excluir.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.delete_activation_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner_id uuid;
  v_delivered integer;
begin
  select d.created_by, b.delivered into v_owner_id, v_delivered
  from public.app_activation_codes_batch b
  join public.app_drafts d on d.id = b.app_draft_id
  where b.id = p_batch_id
  for update of b;

  if v_owner_id is null then
    raise exception 'Lote não encontrado.';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Sem permissão sobre este lote.';
  end if;
  if v_delivered > 0 then
    raise exception 'Lote já entregou código — não pode ser excluído. Revogue os disponíveis em vez disso.';
  end if;

  delete from public.app_activation_codes where batch_id = p_batch_id;
  delete from public.app_activation_codes_batch where id = p_batch_id;
end;
$$;

revoke execute on function public.delete_activation_batch(uuid) from public, anon;
grant execute on function public.delete_activation_batch(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- set_activation_batch_expiry — parceiro define/limpa a validade de um
-- lote já importado (sem policy de UPDATE direta pro parceiro nessas
-- tabelas — mesmo padrão de RPC ownership-checked das duas funções acima).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.set_activation_batch_expiry(p_batch_id uuid, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner_id uuid;
begin
  select d.created_by into v_owner_id
  from public.app_activation_codes_batch b
  join public.app_drafts d on d.id = b.app_draft_id
  where b.id = p_batch_id;

  if v_owner_id is null then
    raise exception 'Lote não encontrado.';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Sem permissão sobre este lote.';
  end if;

  update public.app_activation_codes_batch
  set expires_at = p_expires_at
  where id = p_batch_id;
end;
$$;

revoke execute on function public.set_activation_batch_expiry(uuid, timestamptz) from public, anon;
grant execute on function public.set_activation_batch_expiry(uuid, timestamptz) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- deliver_activation_code passa a ignorar código de lote expirado na
-- hora de escolher qual entregar (mesma assinatura — CREATE OR REPLACE
-- sem DROP). Lote expirado com código 'available' sobrando continua
-- contando nos números da tela do parceiro (não muda status sozinho),
-- só não é mais escolhido pra entrega — efeito prático é igual a
-- estoque zerado (SEM_CODIGO_DISPONIVEL) pro comprador.
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

  select ac.* into v_code
  from public.app_activation_codes ac
  join public.app_activation_codes_batch b on b.id = ac.batch_id
  where ac.plan_id = v_purchase.plan_id
    and ac.status = 'available'
    and (b.expires_at is null or b.expires_at > now())
  order by ac.created_at
  limit 1
  for update of ac skip locked;

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
