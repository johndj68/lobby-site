-- Fecha 2 furos do mesmo padrão já achado e corrigido em 20260717152249:
-- `revoke execute ... from authenticated, anon` NÃO remove o EXECUTE que toda
-- function nova recebe pra role PUBLIC por default (authenticated/anon são
-- apenas membros de PUBLIC). É preciso revogar de PUBLIC explicitamente.
--
-- 1) confirm_credit_purchase_webhook (20260720120000): comentário na própria
--    migration dizia "Somente service_role pode chamar esta função", mas só
--    revogou de authenticated/anon — nunca de PUBLIC. Resultado: qualquer
--    usuário autenticado podia chamar
--    supabase.rpc('confirm_credit_purchase_webhook', {p_purchase_id: <id>})
--    direto do browser pra marcar uma compra pendente como paga, mintar
--    créditos pra própria carteira e criar um financial_transactions falso —
--    sem passar pelo Stripe.
--
-- 2) get_thread_summaries (20260720150000): nunca teve nenhum revoke — só um
--    `grant ... to authenticated` (aditivo, não remove o grant implícito de
--    PUBLIC). SECURITY DEFINER bypassa RLS de messages/profiles/client_projects
--    e é chamada direto do client (app/admin/mensagens/MensagensClient.tsx),
--    não por trás de um route handler — então o gate de "só técnico" que o
--    comentário da function presumia nunca existiu no banco. Qualquer usuário
--    autenticado (inclusive um cliente, não só técnico) conseguia listar
--    nome/e-mail/empresa de todos os clientes e preview de todas as
--    conversas. Fix: revoga de PUBLIC e adiciona checagem interna
--    is_technician(auth.uid()) na própria function (defesa em profundidade —
--    não depende só do grant).

revoke execute on function public.confirm_credit_purchase_webhook(uuid) from public;

create or replace function public.get_thread_summaries()
returns table (
  client_id         uuid,
  project_id        uuid,
  client_name       text,
  client_email      text,
  client_company    text,
  project_title     text,
  last_content      text,
  last_at           timestamptz,
  last_sender_role  text,
  unread_count      bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_technician(auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  with latest as (
    select distinct on (m.client_id, m.project_id)
      m.client_id,
      m.project_id,
      m.content,
      m.created_at,
      m.sender_role
    from public.messages m
    order by m.client_id, m.project_id, m.created_at desc
  ),
  unread_counts as (
    select
      m.client_id,
      m.project_id,
      count(*) as cnt
    from public.messages m
    where m.sender_role = 'client'
      and m.read_at is null
    group by m.client_id, m.project_id
  )
  select
    l.client_id,
    l.project_id,
    p.full_name                     as client_name,
    p.email                         as client_email,
    p.company_name                  as client_company,
    cp.title                        as project_title,
    l.content                       as last_content,
    l.created_at                    as last_at,
    l.sender_role                   as last_sender_role,
    coalesce(u.cnt, 0)              as unread_count
  from latest l
  left join public.profiles p
    on p.id = l.client_id
  left join public.client_projects cp
    on cp.id = l.project_id
  left join unread_counts u
    on  u.client_id  = l.client_id
    and u.project_id is not distinct from l.project_id
  order by l.created_at desc;
end;
$$;

revoke execute on function public.get_thread_summaries() from public;
grant execute on function public.get_thread_summaries() to authenticated;
