-- BASELINE — supabase/schema.sql (fora da pasta migrations/) nunca foi
-- aplicado por `supabase db push`/`db reset`; é só um arquivo de referência
-- solto que ficou desatualizado. Esta migration substitui esse papel para
-- profiles/contacts/downloads, e para o que schema.sql chamava de
-- "resources"/"projects" — que na produção real NÃO EXISTEM MAIS. Foram
-- substituídos por resource_metadata (bucket "materials",
-- ArquivosClient.tsx) e lobby_projects (ProjetosAdminClient.tsx) sem
-- nunca atualizar schema.sql. As definições antigas de resources/projects
-- em schema.sql são lixo morto — não são recriadas aqui de propósito.
--
-- Datada antes de 20260702130000 (que já teria referências a profiles) e
-- de 20260702140000 (a mais antiga originalmente rastreada, que já
-- referencia contacts via FK em contact_responses/contact_activity) —
-- ambas exigem que profiles/contacts já existam antes de rodar.
--
-- Captura fielmente o que está em produção HOJE, inclusive duplicidades e
-- pontos que merecem atenção à parte (não corrigidos aqui, só documentados):
--
-- 1) profiles tem 3 policies próprias redundantes com nomes diferentes das
--    de schema.sql (own_profile_select/insert/update vs "Users can view/
--    update/insert own profile") — mesmo efeito, nomeação duplicada.
-- 2) "technician_read_profiles" dá SELECT em TODAS as profiles pra
--    qualquer usuário autenticado (qual = true), não só técnicos — mais
--    amplo do que qualquer policy documentada até aqui. Qualquer cliente
--    logado consegue ler nome/e-mail/telefone/documento de qualquer outro
--    usuário. Vale revisão à parte.
-- 3) "technician_assign_client" dá UPDATE em QUALQUER profile pra qualquer
--    técnico (não só a própria), sem restringir quais colunas — o trigger
--    profiles_prevent_privilege_escalation (20260704120000) já impede
--    troca de role/is_leader por esse caminho, mas nome/telefone/e-mail/
--    documento de qualquer cliente podem ser sobrescritos por qualquer
--    técnico sem vínculo com aquele cliente. Vale revisão à parte.
-- 4) downloads não tem nenhuma policy de SELECT para o próprio cliente
--    (só "technician_read_downloads") — e a coluna user_id de schema.sql
--    nunca existiu de fato. app/dashboard/downloads/page.tsx filtra por
--    e-mail, mas sem uma policy de SELECT liberando isso pro dono, a
--    tela "Meus downloads" do cliente provavelmente sempre retorna vazio.
--    Bug funcional plausível — não corrigido aqui, só documentado.
-- 5) contacts tem policies de SELECT/UPDATE duplicadas (nomes diferentes,
--    mesmo efeito) além das já rastreadas em 20260702160000.

-- profiles ------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  email         text,
  company_name  text,
  interest_area text,
  created_at    timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own_profile_select" on public.profiles;
create policy "own_profile_select" on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "own_profile_insert" on public.profiles;
create policy "own_profile_insert" on public.profiles for insert
  with check (auth.uid() = id);

-- Sem WITH CHECK — a coluna role/is_leader é protegida separadamente pelo
-- trigger profiles_prevent_privilege_escalation (20260704120000), não por
-- esta policy.
drop policy if exists "own_profile_update" on public.profiles;
create policy "own_profile_update" on public.profiles for update
  using (auth.uid() = id);

-- Ver nota (2) acima — libera leitura de qualquer profile pra qualquer
-- autenticado, não só técnico.
drop policy if exists "technician_read_profiles" on public.profiles;
create policy "technician_read_profiles" on public.profiles for select
  to authenticated
  using (true);

-- Ver nota (3) acima — libera update de qualquer profile pra qualquer
-- técnico, sem checar vínculo com o cliente-alvo.
drop policy if exists "technician_assign_client" on public.profiles;
create policy "technician_assign_client" on public.profiles for update
  to authenticated
  using (
    id = auth.uid()
    or exists (select 1 from public.profiles profiles_1 where profiles_1.id = auth.uid() and profiles_1.role = 'technician')
  )
  with check (
    id = auth.uid()
    or exists (select 1 from public.profiles profiles_1 where profiles_1.id = auth.uid() and profiles_1.role = 'technician')
  );

-- contacts --------------------------------------------------------------

create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  phone         text,
  company       text,
  interest_area text,
  message       text not null,
  status        text default 'novo' check (status in ('novo','em_analise','respondido','arquivado')),
  priority      text default 'media' check (priority in ('alta','media','baixa')),
  assignee_id   uuid references public.profiles(id),
  created_at    timestamptz default now()
);

alter table public.contacts enable row level security;

drop policy if exists "insert_contacts" on public.contacts;
create policy "insert_contacts" on public.contacts for insert
  with check (true);

-- Duplicada com technician_read_contacts abaixo (mesmo efeito, nomes
-- diferentes) — mantida por ser o que existe em produção hoje.
drop policy if exists "Technicians can view contacts" on public.contacts;
create policy "Technicians can view contacts" on public.contacts for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician'));

drop policy if exists "technician_read_contacts" on public.contacts;
create policy "technician_read_contacts" on public.contacts for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician'));

-- Duplicada com contacts_update_technician (20260702160000, que já tem
-- WITH CHECK) — mantida por ser o que existe em produção hoje.
drop policy if exists "technician_update_contacts" on public.contacts;
create policy "technician_update_contacts" on public.contacts for update
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician'));

-- downloads -----------------------------------------------------------------

create table if not exists public.downloads (
  id            uuid primary key default gen_random_uuid(),
  resource_id   text not null,
  name          text not null,
  email         text not null,
  company       text,
  interest_area text,
  created_at    timestamptz default now()
);

alter table public.downloads enable row level security;

drop policy if exists "insert_downloads" on public.downloads;
create policy "insert_downloads" on public.downloads for insert
  with check (true);

drop policy if exists "technician_read_downloads" on public.downloads;
create policy "technician_read_downloads" on public.downloads for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician'));

-- lobby_projects (showcase público, substitui "projects" de schema.sql) -----

create table if not exists public.lobby_projects (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  title       text not null,
  description text not null,
  category    text not null check (category in ('Software','Automação','Dados','Cibersegurança')),
  slug        text not null unique,
  impact      text,
  tags        text[] default '{}'::text[],
  mockup_type text default 'default',
  image_url   text
);

alter table public.lobby_projects enable row level security;

drop policy if exists "public_read_projects" on public.lobby_projects;
create policy "public_read_projects" on public.lobby_projects for select
  using (true);

drop policy if exists "technician_manage_projects" on public.lobby_projects;
create policy "technician_manage_projects" on public.lobby_projects for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician'));
