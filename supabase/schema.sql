-- =============================================
-- LOBBY — Supabase Database Schema
-- =============================================
--
-- ARQUIVO DESATUALIZADO — NÃO É A FONTE DA VERDADE.
-- Este arquivo fica fora de supabase/migrations/, então NUNCA é aplicado
-- por `supabase db push`/`db reset` — é só um snapshot histórico que já
-- ficou obsoleto. O schema real é o resultado de aplicar, em ordem, todos
-- os arquivos em supabase/migrations/ (comece por
-- 20260702100000_baseline_public_schema.sql, que documenta o estado real
-- de profiles/contacts/downloads e o trigger de auto-criação de profile
-- abaixo, que NÃO existe mais em produção).
--
-- Divergências conhecidas entre este arquivo e a produção real:
-- - "resources" e "projects" abaixo não existem mais — foram substituídos
--   por resource_metadata (bucket "materials") e lobby_projects.
-- - profiles ganhou as colunas role, is_leader, phone, document (ver
--   20260702130000_baseline_untracked_schema.sql) e RLS adicional (ver
--   20260702100000_baseline_public_schema.sql).
-- - downloads não tem coluna user_id; contacts ganhou status, priority,
--   assignee_id.
-- - client_projects, client_project_team, messages não existiam aqui.
-- - O trigger handle_new_user/on_auth_user_created no fim deste arquivo
--   não existe em produção — a criação de profile no cadastro é feita
--   pelo próprio client-side (components/forms/RegisterForm.tsx).
--
-- Não edite este arquivo esperando que reflita ou altere produção. Crie
-- uma migration nova em supabase/migrations/ para qualquer mudança real.

-- profiles: extended user data linked to auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  company_name text,
  interest_area text,
  created_at timestamptz default now()
);

-- contacts: inbound leads from the contact form
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  company text,
  interest_area text,
  message text not null,
  created_at timestamptz default now()
);

-- resources: downloadable materials (managed by admin)
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  file_url text,
  cover_url text,
  created_at timestamptz default now()
);

-- downloads: tracks who downloaded what (auth or anonymous)
create table if not exists public.downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  resource_id uuid references public.resources(id) on delete set null,
  name text not null,
  email text not null,
  company text,
  interest_area text,
  created_at timestamptz default now()
);

-- projects: showcase projects (managed by admin)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  image_url text,
  slug text unique,
  created_at timestamptz default now()
);

-- =============================================
-- Row Level Security
-- =============================================

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.resources enable row level security;
alter table public.downloads enable row level security;
alter table public.projects enable row level security;

-- profiles: users can only read/update their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- contacts: anyone can insert (public lead form)
create policy "Anyone can submit contact"
  on public.contacts for insert
  with check (true);

-- resources: anyone can read
create policy "Anyone can view resources"
  on public.resources for select
  using (true);

-- downloads: anyone can insert (anonymous or logged in)
create policy "Anyone can register a download"
  on public.downloads for insert
  with check (true);

create policy "Users can view own downloads"
  on public.downloads for select
  using (auth.uid() = user_id);

-- projects: anyone can read
create policy "Anyone can view projects"
  on public.projects for select
  using (true);

-- =============================================
-- Auto-create profile on signup
-- =============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
