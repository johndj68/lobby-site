-- Fecha o item declarado como "fora de escopo" na entrega anterior
-- (20261006130000): aprovação administrativa real de mudança de destino
-- de recebimento. Mesmo padrão já usado em promotions (20261003100000 em
-- diante) — vigente separado de solicitação, fila admin, aprovar/rejeitar
-- com motivo, histórico distinguindo os dois.
--
-- update_partner_payout_destination MUDA DE COMPORTAMENTO: antes escrevia
-- direto em profiles.payout_*; agora só registra uma SOLICITAÇÃO. profiles
-- só é tocado quando um técnico aprova. Mesmo nome/assinatura — o form
-- do parceiro (RecebimentoFormSheet.tsx) não muda a chamada, só o texto
-- de sucesso (ajustado no frontend).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Helpers de máscara — já estavam duplicados 2x em
--    get_partner_payout_destination_detail (20261006130000); reaproveitados
--    aqui pra não triplicar o CASE ao mascarar a proposta pendente também.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.mask_pix_key(p_key text)
returns text
language sql immutable
as $$
  select case
    when p_key is null or trim(p_key) = '' then null
    when p_key like '%@%' then left(split_part(p_key, '@', 1), 2) || '•••@' || split_part(p_key, '@', 2)
    when length(regexp_replace(p_key, '\D', '', 'g')) >= 4 then '••••' || right(regexp_replace(p_key, '\D', '', 'g'), 4)
    else '••••' || right(p_key, 4)
  end;
$$;

create or replace function public.mask_tail(p_value text, p_visible integer default 2)
returns text
language sql immutable
as $$
  select case when p_value is null or trim(p_value) = '' then null else repeat('•', 2) || right(p_value, p_visible) end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Tabela de solicitações — destino vigente (profiles.payout_*) e
--    alteração solicitada ficam SEPARADOS até aprovação, como pedido.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.partner_payout_destination_requests (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),

  payout_method text not null check (payout_method in ('pix', 'bank_transfer')),
  account_holder text not null,
  person_type text check (person_type in ('pf', 'pj')),
  document text,
  pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  pix_key text,
  bank_name text,
  bank_agency text,
  bank_account text,
  bank_account_digit text,
  bank_account_type text check (bank_account_type in ('corrente', 'poupanca')),
  notes text,

  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now()
);

-- No máximo 1 solicitação pendente por parceiro de cada vez — mesmo
-- princípio de promotions_one_pending_per_plan (20261003110000).
create unique index if not exists partner_payout_destination_requests_one_pending
  on public.partner_payout_destination_requests (partner_id) where status = 'pending';

create index if not exists idx_partner_payout_destination_requests_partner
  on public.partner_payout_destination_requests(partner_id, created_at desc);

alter table public.partner_payout_destination_requests enable row level security;

-- SELECT pra técnico (fila admin, lê valor real — precisa decidir aprovar
-- ou rejeitar, mesmo princípio de profiles.payout_* hoje já lido em claro
-- pelo admin em /admin/marketplace/repasses). Nenhuma policy de
-- insert/update/delete pra ninguém — só as RPCs security definer abaixo
-- escrevem (dono nunca lê a própria solicitação direto da tabela, só via
-- RPC mascarada, mesmo padrão do resto desta sessão).
drop policy if exists "technician_select_payout_destination_requests" on public.partner_payout_destination_requests;
create policy "technician_select_payout_destination_requests" on public.partner_payout_destination_requests
  for select to authenticated
  using (public.is_technician(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────
-- 3) update_partner_payout_destination — MUDA DE COMPORTAMENTO: cria
--    solicitação, nunca escreve em profiles. Mesma validação de formato
--    de 20261006130000 (copiada, não há "super-função" compartilhável
--    em plpgsql sem duplicar a assinatura inteira).
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.update_partner_payout_destination(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz);

create or replace function public.update_partner_payout_destination(
  p_partner_id        uuid,
  p_method            text,
  p_account_holder    text,
  p_person_type       text default null,
  p_document          text default null,
  p_pix_key_type      text default null,
  p_pix_key           text default null,
  p_bank_name         text default null,
  p_bank_agency       text default null,
  p_bank_account      text default null,
  p_bank_account_digit text default null,
  p_bank_account_type text default null,
  p_notes             text default null,
  p_expected_updated_at timestamptz default null
)
returns table (ok boolean, request_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_is_self boolean;
  v_current_updated_at timestamptz;
  v_holder text := nullif(trim(coalesce(p_account_holder, '')), '');
  v_doc    text := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
  v_pix    text;
  v_notes  text := nullif(trim(coalesce(p_notes, '')), '');
  v_request_id uuid;
begin
  if v_actor is null then raise exception 'Não autenticado.'; end if;
  v_is_self := (p_partner_id = v_actor);

  if not v_is_self then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = v_actor
        and d.created_by = p_partner_id
        and (tm.role = 'owner' or 'financeiro_configuracoes' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para alterar os dados de recebimento deste parceiro.';
    end if;
  end if;

  if p_method not in ('pix', 'bank_transfer') then raise exception 'Método de recebimento inválido.'; end if;
  if v_holder is null then raise exception 'Informe o nome do titular.'; end if;
  if length(v_holder) > 150 then raise exception 'Nome do titular muito longo.'; end if;
  if p_person_type is not null and p_person_type not in ('pf', 'pj') then raise exception 'Tipo de pessoa inválido.'; end if;

  if p_method = 'pix' then
    if p_pix_key_type not in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria') then raise exception 'Informe o tipo de chave Pix.'; end if;
    v_pix := nullif(trim(coalesce(p_pix_key, '')), '');
    if v_pix is null then raise exception 'Informe a chave Pix.'; end if;
    if p_pix_key_type = 'email' then
      v_pix := lower(v_pix);
      if v_pix !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Chave Pix do tipo e-mail em formato inválido.'; end if;
    elsif p_pix_key_type = 'telefone' then
      v_pix := regexp_replace(v_pix, '[^\d+]', '', 'g');
      if length(regexp_replace(v_pix, '\D', '', 'g')) not between 10 and 13 then raise exception 'Chave Pix do tipo telefone em formato inválido.'; end if;
    elsif p_pix_key_type = 'cpf' then
      v_pix := regexp_replace(v_pix, '\D', '', 'g');
      if length(v_pix) <> 11 then raise exception 'Chave Pix do tipo CPF precisa ter 11 dígitos.'; end if;
    elsif p_pix_key_type = 'cnpj' then
      v_pix := regexp_replace(v_pix, '\D', '', 'g');
      if length(v_pix) <> 14 then raise exception 'Chave Pix do tipo CNPJ precisa ter 14 dígitos.'; end if;
    else
      if length(v_pix) < 8 then raise exception 'Chave Pix aleatória em formato inválido.'; end if;
    end if;
    if length(v_pix) > 140 then raise exception 'Chave Pix muito longa.'; end if;
  else
    if nullif(trim(coalesce(p_bank_name, '')), '') is null then raise exception 'Informe o banco.'; end if;
    if nullif(trim(coalesce(p_bank_agency, '')), '') is null then raise exception 'Informe a agência.'; end if;
    if nullif(trim(coalesce(p_bank_account, '')), '') is null then raise exception 'Informe a conta.'; end if;
    if p_bank_account_type not in ('corrente', 'poupanca') then raise exception 'Informe o tipo de conta.'; end if;
    if length(coalesce(p_bank_name, '')) > 100 then raise exception 'Nome do banco muito longo.'; end if;
  end if;

  if v_doc is not null and p_person_type = 'pf' and length(v_doc) <> 11 then raise exception 'Documento de pessoa física precisa ter 11 dígitos (CPF).'; end if;
  if v_doc is not null and p_person_type = 'pj' and length(v_doc) <> 14 then raise exception 'Documento de pessoa jurídica precisa ter 14 dígitos (CNPJ).'; end if;
  if length(coalesce(v_notes, '')) > 500 then raise exception 'Observação muito longa (máximo 500 caracteres).'; end if;

  select payout_updated_at into v_current_updated_at from public.profiles where id = p_partner_id;
  if p_expected_updated_at is not null
     and v_current_updated_at is not null
     and v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'Os dados vigentes foram atualizados por outra sessão — recarregue antes de enviar.' using errcode = '40001';
  end if;

  if exists (select 1 from public.partner_payout_destination_requests where partner_id = p_partner_id and status = 'pending') then
    raise exception 'Já existe uma alteração aguardando aprovação para este cadastro.' using errcode = '40002';
  end if;

  insert into public.partner_payout_destination_requests (
    partner_id, requested_by, payout_method, account_holder, person_type, document,
    pix_key_type, pix_key, bank_name, bank_agency, bank_account, bank_account_digit, bank_account_type, notes
  ) values (
    p_partner_id, v_actor, p_method, v_holder, p_person_type, v_doc,
    case when p_method = 'pix' then p_pix_key_type else null end,
    case when p_method = 'pix' then v_pix else null end,
    case when p_method = 'bank_transfer' then trim(p_bank_name) else null end,
    case when p_method = 'bank_transfer' then trim(p_bank_agency) else null end,
    case when p_method = 'bank_transfer' then trim(p_bank_account) else null end,
    case when p_method = 'bank_transfer' then nullif(trim(coalesce(p_bank_account_digit, '')), '') else null end,
    case when p_method = 'bank_transfer' then p_bank_account_type else null end,
    v_notes
  )
  returning id into v_request_id;

  insert into public.partner_payout_destination_events (partner_id, actor_id, action, description)
  values (p_partner_id, v_actor, 'updated',
    'Alteração solicitada (' || case when p_method = 'pix' then 'Pix' else 'transferência bancária' end || ') — aguardando aprovação.');

  return query select true, v_request_id;
end;
$$;

revoke execute on function public.update_partner_payout_destination(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.update_partner_payout_destination(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) to authenticated;

comment on function public.update_partner_payout_destination(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) is
  'Cria uma SOLICITAÇÃO de alteração de destino — nunca escreve em profiles direto (ver 20261006140000). profiles só muda quando um técnico aprova via approve_partner_payout_destination_request. Bloqueia 2ª solicitação enquanto uma está pendente (errcode 40002).';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Aprovar/rejeitar — só técnico. Aprovar é o ÚNICO caminho que grava em
--    profiles.payout_* a partir de agora (além do insert inicial da
--    coluna, que não existe — profiles nasce sem payout_* até a 1ª
--    aprovação).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.approve_partner_payout_destination_request(p_request_id uuid)
returns table (ok boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  r public.partner_payout_destination_requests%rowtype;
begin
  if not public.is_technician(v_actor) then
    raise exception 'Sem permissão para aprovar alterações de recebimento.';
  end if;

  select * into r from public.partner_payout_destination_requests where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'Esta solicitação já foi resolvida ou não existe.'; end if;

  update public.profiles set
    payout_method             = r.payout_method,
    payout_account_holder     = r.account_holder,
    payout_person_type        = r.person_type,
    payout_document           = r.document,
    payout_pix_key_type       = r.pix_key_type,
    payout_pix_key            = r.pix_key,
    payout_bank_name          = r.bank_name,
    payout_bank_agency        = r.bank_agency,
    payout_bank_account       = r.bank_account,
    payout_bank_account_digit = r.bank_account_digit,
    payout_bank_account_type  = r.bank_account_type,
    payout_notes              = r.notes,
    payout_updated_at         = now()
  where id = r.partner_id;

  update public.partner_payout_destination_requests
    set status = 'approved', reviewed_by = v_actor, reviewed_at = now()
    where id = p_request_id;

  insert into public.partner_payout_destination_events (partner_id, actor_id, action, description)
  values (r.partner_id, v_actor, 'updated',
    'Alteração aprovada e aplicada (' || case when r.payout_method = 'pix' then 'Pix' else 'transferência bancária' end || ').');

  return query select true;
end;
$$;

revoke execute on function public.approve_partner_payout_destination_request(uuid) from public, anon, authenticated;
grant execute on function public.approve_partner_payout_destination_request(uuid) to authenticated;

create or replace function public.reject_partner_payout_destination_request(p_request_id uuid, p_reason text)
returns table (ok boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  r public.partner_payout_destination_requests%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_technician(v_actor) then
    raise exception 'Sem permissão para rejeitar alterações de recebimento.';
  end if;
  if v_reason is null then raise exception 'Informe o motivo da rejeição.'; end if;

  select * into r from public.partner_payout_destination_requests where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'Esta solicitação já foi resolvida ou não existe.'; end if;

  update public.partner_payout_destination_requests
    set status = 'rejected', reviewed_by = v_actor, reviewed_at = now(), rejection_reason = v_reason
    where id = p_request_id;

  insert into public.partner_payout_destination_events (partner_id, actor_id, action, description)
  values (r.partner_id, v_actor, 'updated', 'Alteração rejeitada — motivo: ' || v_reason);

  return query select true;
end;
$$;

revoke execute on function public.reject_partner_payout_destination_request(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_partner_payout_destination_request(uuid, text) to authenticated;

-- Parceiro cancela a PRÓPRIA solicitação pendente — mesmo princípio de
-- cancelamento de promoção pendente (20261006110000).
create or replace function public.cancel_partner_payout_destination_request(p_partner_id uuid, p_request_id uuid)
returns table (ok boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Não autenticado.'; end if;
  if p_partner_id <> v_actor then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = v_actor and d.created_by = p_partner_id
        and (tm.role = 'owner' or 'financeiro_configuracoes' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para cancelar esta alteração.';
    end if;
  end if;

  update public.partner_payout_destination_requests
    set status = 'cancelled'
    where id = p_request_id and partner_id = p_partner_id and status = 'pending';
  if not found then raise exception 'Esta solicitação já foi resolvida ou não existe.'; end if;

  insert into public.partner_payout_destination_events (partner_id, actor_id, action, description)
  values (p_partner_id, v_actor, 'updated', 'Alteração pendente cancelada.');

  return query select true;
end;
$$;

revoke execute on function public.cancel_partner_payout_destination_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_partner_payout_destination_request(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) get_partner_payout_destination_detail — ganha a proposta pendente
--    (mascarada, mesmo tratamento do destino vigente) + id pra cancelar.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_payout_destination_detail(uuid);

create function public.get_partner_payout_destination_detail(p_partner_id uuid default null)
returns table (
  configured              boolean,
  payout_method           text,
  account_holder          text,
  person_type             text,
  masked_document         text,
  pix_key_type            text,
  masked_pix              text,
  bank_name               text,
  masked_bank_agency      text,
  masked_bank_account     text,
  bank_account_type       text,
  updated_at              timestamptz,
  pending_request_id      uuid,
  pending_method          text,
  pending_account_holder  text,
  pending_masked_pix      text,
  pending_bank_name       text,
  pending_masked_bank_account text,
  pending_created_at      timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  p public.profiles%rowtype;
  req public.partner_payout_destination_requests%rowtype;
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_configuracoes' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver os dados de recebimento deste parceiro.';
    end if;
  end if;

  select * into p from public.profiles where id = v_partner_id;
  select * into req from public.partner_payout_destination_requests
    where partner_id = v_partner_id and status = 'pending'
    order by created_at desc limit 1;

  return query select
    (p.payout_method is not null),
    p.payout_method,
    p.payout_account_holder,
    p.payout_person_type,
    case when p.payout_document is null or trim(p.payout_document) = '' then null else public.mask_tail(regexp_replace(p.payout_document, '\D', '', 'g'), 2) end,
    p.payout_pix_key_type,
    public.mask_pix_key(p.payout_pix_key),
    p.payout_bank_name,
    public.mask_tail(p.payout_bank_agency, 2),
    case when p.payout_bank_account is null then null else public.mask_tail(p.payout_bank_account, 2) || coalesce('-' || p.payout_bank_account_digit, '') end,
    p.payout_bank_account_type,
    p.payout_updated_at,
    req.id,
    req.payout_method,
    req.account_holder,
    public.mask_pix_key(req.pix_key),
    req.bank_name,
    case when req.bank_account is null then null else public.mask_tail(req.bank_account, 2) || coalesce('-' || req.bank_account_digit, '') end,
    req.created_at;
end;
$$;

revoke execute on function public.get_partner_payout_destination_detail(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_payout_destination_detail(uuid) to authenticated;

comment on function public.get_partner_payout_destination_detail(uuid) is
  'View completa mascarada do destino VIGENTE + preview mascarado da solicitação PENDENTE (se houver) — nunca mistura os dois num único "destino". pending_request_id null = nenhuma alteração aguardando aprovação.';
