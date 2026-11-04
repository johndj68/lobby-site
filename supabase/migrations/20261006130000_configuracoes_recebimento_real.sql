-- Reforma de "Configurações de recebimento" do parceiro — hoje profiles.
-- payout_pix_key/payout_account_holder/payout_notes é editado via upsert
-- CRU no browser (app/dashboard/conta/AccountForm.tsx), sem validação, sem
-- rastro, e a RLS technician_update_profiles (20260922110000) libera
-- UPDATE nessas colunas pra QUALQUER technician, não só líder — brecha
-- real, fechada aqui movendo toda escrita pra uma RPC security definer e
-- revogando UPDATE direto nas colunas sensíveis pra todo mundo.
--
-- get_partner_payout_destination (20261006100000) JÁ ESTÁ EM PRODUÇÃO
-- (usada pelo card "Conta de recebimento" em Repasses e extrato) — não
-- mexida aqui pra não quebrar o que já está no ar. RPCs novas, separadas,
-- pro detalhe completo desta tela.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Colunas novas — TED estruturado vira primeira classe (hoje só existia
--    como texto livre dentro de payout_notes, que o comentário original já
--    dizia ser "pra TED"). payout_notes muda de propósito: instrução
--    adicional opcional, nunca mais o lugar de dado bancário estruturado.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists payout_method text
    check (payout_method in ('pix', 'bank_transfer')),
  add column if not exists payout_pix_key_type text
    check (payout_pix_key_type in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  add column if not exists payout_person_type text
    check (payout_person_type in ('pf', 'pj')),
  add column if not exists payout_document text,
  add column if not exists payout_bank_name text,
  add column if not exists payout_bank_agency text,
  add column if not exists payout_bank_account text,
  add column if not exists payout_bank_account_digit text,
  add column if not exists payout_bank_account_type text
    check (payout_bank_account_type in ('corrente', 'poupanca')),
  add column if not exists payout_updated_at timestamptz;

comment on column public.profiles.payout_notes is
  'Instrução adicional opcional do parceiro (ex.: "só processar após dia 5") — NUNCA mais o lugar de dado bancário estruturado (ver payout_bank_*). Não altera destino nem condições de repasse por si só.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Histórico — nenhuma tabela de auditoria hoje é gravável por parceiro
--    comum (app_admin_events exige is_technician). Tabela nova, sem policy
--    de insert pra ninguém — só a RPC security definer grava.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.partner_payout_destination_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created', 'updated')),
  -- Descrição curta ("Chave Pix atualizada.") — NUNCA o valor do campo.
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_payout_destination_events_partner on public.partner_payout_destination_events(partner_id, created_at desc);

alter table public.partner_payout_destination_events enable row level security;
-- Sem nenhuma policy de select/insert/update/delete pra authenticated —
-- deny-all por padrão de RLS habilitada sem policy. Leitura só via RPC
-- security definer (get_partner_payout_destination_history), escrita só
-- via update_partner_payout_destination (também security definer).

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Fecha a brecha: ninguém mais dá UPDATE direto nas colunas payout_* —
--    nem o dono (AccountForm.tsx hoje faz upsert cru), nem qualquer
--    technician via technician_update_profiles (20260922110000), que não
--    restringe coluna. Só a RPC abaixo (roda como owner da função,
--    ignora grants de coluna) consegue escrever.
--
--    ATENÇÃO (achado só na hora de testar): Supabase concede
--    `grant all on all tables in schema public to authenticated, anon`
--    — um grant de TABELA INTEIRA. `revoke update (coluna) ... from
--    authenticated` sozinho NÃO basta: grant de tabela e grant de coluna
--    são ACLs independentes e permissivamente somadas — a presença do
--    grant de tabela inteira continua liberando QUALQUER coluna mesmo
--    depois de revogar só a coluna específica (testado e confirmado
--    localmente: o revoke "funcionava" sem erro mas o UPDATE direto
--    continuava passando). Só fecha de verdade revogando UPDATE da
--    TABELA inteira e reconcedendo explicitamente nas colunas que devem
--    continuar editáveis direto (tudo, exceto payout_*).
-- ─────────────────────────────────────────────────────────────────────────

revoke update on public.profiles from authenticated, anon;

grant update (
  full_name, email, company_name, interest_area, phone, document,
  notification_prefs, onboarded, stripe_customer_id,
  role, is_leader,
  marketplace_new_apps_blocked, marketplace_blocked_at, marketplace_blocked_by, marketplace_blocked_reason
) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) get_partner_payout_destination_detail — view completa mascarada pra
--    tela de Configurações de recebimento (e pro resumo em /dashboard/
--    conta, mesma fonte). Exige financeiro_configuracoes quando não é o
--    próprio usuário — capacidade já reservada em
--    app/dashboard/meus-app/novo/[appId]/equipe/TeamClient.tsx ("ainda
--    não disponível"), nunca antes checada em nenhuma RPC/rota.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_payout_destination_detail(p_partner_id uuid default null)
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
  updated_at              timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  p public.profiles%rowtype;
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

  return query select
    (p.payout_method is not null),
    p.payout_method,
    p.payout_account_holder,
    p.payout_person_type,
    case
      when p.payout_document is null or trim(p.payout_document) = '' then null
      else '•••' || right(regexp_replace(p.payout_document, '\D', '', 'g'), 2)
    end,
    p.payout_pix_key_type,
    case
      when p.payout_pix_key is null or trim(p.payout_pix_key) = '' then null
      when p.payout_pix_key like '%@%' then left(split_part(p.payout_pix_key, '@', 1), 2) || '•••@' || split_part(p.payout_pix_key, '@', 2)
      when length(regexp_replace(p.payout_pix_key, '\D', '', 'g')) >= 4 then '••••' || right(regexp_replace(p.payout_pix_key, '\D', '', 'g'), 4)
      else '••••' || right(p.payout_pix_key, 4)
    end,
    p.payout_bank_name,
    case when p.payout_bank_agency is null then null else '••' || right(p.payout_bank_agency, 2) end,
    case when p.payout_bank_account is null then null else '••••' || right(p.payout_bank_account, 2) || coalesce('-' || p.payout_bank_account_digit, '') end,
    p.payout_bank_account_type,
    p.payout_updated_at;
end;
$$;

revoke execute on function public.get_partner_payout_destination_detail(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_payout_destination_detail(uuid) to authenticated;

comment on function public.get_partner_payout_destination_detail(uuid) is
  'View completa mascarada de recebimento pra Configurações de recebimento e resumo em /dashboard/conta — nunca chave/documento/conta em texto puro. p_partner_id default null = próprio usuário; exige financeiro_configuracoes (ou owner) pra ver de outro.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) update_partner_payout_destination — ÚNICO caminho de escrita. Valida
--    por método, normaliza sem corromper, nunca confunde formato válido
--    com titularidade confirmada (não existe verificação externa — ver
--    comentário em payout_pix_key original, 20260927220000).
-- ─────────────────────────────────────────────────────────────────────────

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
  -- Trava de conflito (seção 7/13): client manda o updated_at que leu;
  -- se já mudou no banco nesse meio-tempo, rejeita em vez de sobrescrever
  -- sem avisar ("Atualização feita por outra pessoa durante a edição").
  p_expected_updated_at timestamptz default null
)
returns table (ok boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_is_self boolean;
  v_had_data boolean;
  v_current_updated_at timestamptz;
  v_holder text := nullif(trim(coalesce(p_account_holder, '')), '');
  v_doc    text := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
  v_pix    text;
  v_notes  text := nullif(trim(coalesce(p_notes, '')), '');
  v_desc   text;
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

  if p_method not in ('pix', 'bank_transfer') then
    raise exception 'Método de recebimento inválido.';
  end if;
  if v_holder is null then
    raise exception 'Informe o nome do titular.';
  end if;
  if length(v_holder) > 150 then raise exception 'Nome do titular muito longo.'; end if;
  if p_person_type is not null and p_person_type not in ('pf', 'pj') then
    raise exception 'Tipo de pessoa inválido.';
  end if;

  -- Formato — nunca confirma titularidade, só a forma do dado.
  if p_method = 'pix' then
    if p_pix_key_type not in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria') then
      raise exception 'Informe o tipo de chave Pix.';
    end if;
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
    else -- aleatoria — formato EVP (uuid), nunca mexe nos caracteres (corromperia a chave)
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

  if v_doc is not null and p_person_type = 'pf' and length(v_doc) <> 11 then
    raise exception 'Documento de pessoa física precisa ter 11 dígitos (CPF).';
  end if;
  if v_doc is not null and p_person_type = 'pj' and length(v_doc) <> 14 then
    raise exception 'Documento de pessoa jurídica precisa ter 14 dígitos (CNPJ).';
  end if;
  if length(coalesce(v_notes, '')) > 500 then raise exception 'Observação muito longa (máximo 500 caracteres).'; end if;

  select (payout_method is not null), payout_updated_at
    into v_had_data, v_current_updated_at
  from public.profiles where id = p_partner_id;

  if p_expected_updated_at is not null
     and v_current_updated_at is not null
     and v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'Os dados foram atualizados por outra sessão — recarregue antes de salvar.' using errcode = '40001';
  end if;

  update public.profiles set
    payout_method            = p_method,
    payout_account_holder    = v_holder,
    payout_person_type       = p_person_type,
    payout_document          = v_doc,
    payout_pix_key_type      = case when p_method = 'pix' then p_pix_key_type else null end,
    payout_pix_key           = case when p_method = 'pix' then v_pix else null end,
    payout_bank_name         = case when p_method = 'bank_transfer' then trim(p_bank_name) else null end,
    payout_bank_agency       = case when p_method = 'bank_transfer' then trim(p_bank_agency) else null end,
    payout_bank_account      = case when p_method = 'bank_transfer' then trim(p_bank_account) else null end,
    payout_bank_account_digit= case when p_method = 'bank_transfer' then nullif(trim(coalesce(p_bank_account_digit, '')), '') else null end,
    payout_bank_account_type = case when p_method = 'bank_transfer' then p_bank_account_type else null end,
    payout_notes             = v_notes,
    payout_updated_at        = now()
  where id = p_partner_id;

  v_desc := case
    when not v_had_data then 'Cadastro de recebimento criado (' || case when p_method = 'pix' then 'Pix' else 'transferência bancária' end || ').'
    else 'Dados de recebimento atualizados (' || case when p_method = 'pix' then 'Pix' else 'transferência bancária' end || ').'
  end;

  insert into public.partner_payout_destination_events (partner_id, actor_id, action, description)
  values (p_partner_id, v_actor, case when v_had_data then 'updated' else 'created' end, v_desc);

  return query select true;
end;
$$;

revoke execute on function public.update_partner_payout_destination(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.update_partner_payout_destination(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) to authenticated;

comment on function public.update_partner_payout_destination(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) is
  'Único caminho de escrita pros campos payout_* de profiles — UPDATE direto nessas colunas foi revogado de authenticated/anon. Valida formato (nunca titularidade), normaliza sem corromper chave aleatória, grava payout_updated_at e evento de histórico (nunca o valor). p_expected_updated_at opcional detecta edição concorrente.';

-- ─────────────────────────────────────────────────────────────────────────
-- 6) get_partner_payout_destination_history — eventos, mesmo padrão
--    3-vias (equipe_lobby/parceiro/sistema) de get_partner_promotion_history.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_payout_destination_history(p_partner_id uuid default null, p_limit integer default 20)
returns table (
  action      text,
  description text,
  created_at  timestamptz,
  actor_role  text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_configuracoes' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o histórico de recebimento deste parceiro.';
    end if;
  end if;

  return query
  select e.action, e.description, e.created_at,
         case when e.actor_id is null then 'sistema'
              when e.actor_id = v_partner_id then 'parceiro'
              when pr.role = 'technician' then 'equipe_lobby'
              else 'parceiro' end as actor_role
  from public.partner_payout_destination_events e
  left join public.profiles pr on pr.id = e.actor_id
  where e.partner_id = v_partner_id
  order by e.created_at desc
  limit least(coalesce(p_limit, 20), 100);
end;
$$;

revoke execute on function public.get_partner_payout_destination_history(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_partner_payout_destination_history(uuid, integer) to authenticated;

comment on function public.get_partner_payout_destination_history(uuid, integer) is
  'Histórico de alterações do destino de recebimento — descrições curtas, nunca valores. actor_role distingue parceiro (incluindo delegado da própria equipe) / equipe_lobby (technician alheio) / sistema (actor_id null).';
