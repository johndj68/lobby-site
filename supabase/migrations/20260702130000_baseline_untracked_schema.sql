-- BASELINE — captura objetos que já existiam no banco de produção mas
-- nunca foram versionados em nenhuma migration (foram criados direto pelo
-- Supabase Studio): colunas de profiles.role/is_leader/phone/document, as
-- tabelas client_projects, client_project_team, messages, resource_metadata,
-- e os buckets de storage "materials"/"project-images". Sem isso, o schema
-- rastreado no repo não refletia a superfície real de dados usada pelo app
-- (middleware.ts, app/dashboard/**, app/admin/** dependem de tudo isso).
--
-- Datada antes de 20260702140000 (a migration mais antiga já existente)
-- porque aquela já referencia profiles.role/is_leader em suas policies —
-- ou seja, na produção real essas colunas já existiam antes daquele ponto,
-- e uma migration nova precisa respeitar essa ordem para funcionar num
-- ambiente do zero.
--
-- Importante: technician_update/technician_delete de client_projects e a
-- policy solta "technician_manage_all" (removida em
-- 20260704140000_client_projects_team_scoped_writes.sql) não são recriadas
-- aqui — são de responsabilidade exclusiva daquela migration, que já é
-- idempotente (drop if exists + create). Recriar a versão antiga aqui
-- reintroduziria a falha de segurança já corrigida.
--
-- schema.sql (fora da pasta migrations/) continua não sendo aplicado pelo
-- CLI — profiles/contacts/resources/downloads/projects (definidos lá)
-- também não são reproduzíveis do zero só com `supabase db reset`. Isso é
-- uma limitação separada, pré-existente, não coberta por esta migration.

alter table public.profiles
  add column if not exists role      text not null default 'client',
  add column if not exists phone     text,
  add column if not exists document  text,
  add column if not exists is_leader boolean default false;

-- client_projects ---------------------------------------------------------

create table if not exists public.client_projects (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references auth.users(id) on delete cascade,
  title              text not null,
  description        text,
  category           text,
  status             text default 'solicitado',
  progress           integer default 0,
  priority           text default 'normal',
  notes              text,
  deadline           date,
  client_name        text,
  client_email       text,
  client_phone       text,
  client_company     text,
  client_document    text,
  lead_technician_id uuid references public.profiles(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table public.client_projects enable row level security;

drop policy if exists "client_insert_own" on public.client_projects;
create policy "client_insert_own" on public.client_projects for insert
  to authenticated
  with check (client_id = auth.uid());

drop policy if exists "client_read_own" on public.client_projects;
create policy "client_read_own" on public.client_projects for select
  to authenticated
  using (client_id = auth.uid());

-- Redundante com client_read_own (mesma regra, roles diferentes) — mantida
-- só porque é o que existe em produção hoje; considerar consolidar depois.
drop policy if exists "client_view_own" on public.client_projects;
create policy "client_view_own" on public.client_projects for select
  using (auth.uid() = client_id);

drop policy if exists "technician_insert" on public.client_projects;
create policy "technician_insert" on public.client_projects for insert
  to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician'));

drop policy if exists "technician_select" on public.client_projects;
create policy "technician_select" on public.client_projects for select
  to authenticated
  using (
    client_id = auth.uid()
    or exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
  );

-- client_project_team -------------------------------------------------------

create table if not exists public.client_project_team (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.client_projects(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'accepted',
  invited_by    uuid references public.profiles(id),
  added_at      timestamptz default now(),
  unique (project_id, technician_id)
);

alter table public.client_project_team enable row level security;

create or replace function public.is_accepted_team_member(p_project_id uuid, p_technician_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_project_team
    where project_id = p_project_id and technician_id = p_technician_id and status = 'accepted'
  );
$$;

drop policy if exists "team_select" on public.client_project_team;
create policy "team_select" on public.client_project_team for select
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician'));

drop policy if exists "team_insert" on public.client_project_team;
create policy "team_insert" on public.client_project_team for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
    and (
      (technician_id = auth.uid() and status = 'accepted')
      or (invited_by = auth.uid() and status = 'pending' and is_accepted_team_member(project_id, auth.uid()))
    )
  );

drop policy if exists "team_update" on public.client_project_team;
create policy "team_update" on public.client_project_team for update
  to authenticated
  using (technician_id = auth.uid())
  with check (technician_id = auth.uid() and status = 'accepted');

drop policy if exists "team_delete" on public.client_project_team;
create policy "team_delete" on public.client_project_team for delete
  to authenticated
  using (technician_id = auth.uid() or is_accepted_team_member(project_id, auth.uid()));

-- messages ------------------------------------------------------------------

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles(id) on delete cascade,
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  sender_role   text not null,
  content       text not null,
  technician_id uuid references public.profiles(id),
  read_at       timestamptz,
  created_at    timestamptz default now()
);

alter table public.messages enable row level security;

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select
  to authenticated
  using (
    client_id = auth.uid()
    or (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
      and (technician_id is null or technician_id = auth.uid())
    )
  );

-- sender_role já é amarrado à role real do autor (não confia em valor
-- vindo do cliente): branch 'client' exige client_id = auth.uid(), branch
-- 'technician' exige profiles.role = 'technician' pra quem está enviando.
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      (client_id = auth.uid() and sender_role = 'client' and technician_id is null)
      or (
        sender_role = 'technician' and technician_id = auth.uid()
        and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
      )
    )
  );

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages for update
  to authenticated
  using (
    client_id = auth.uid()
    or (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
      and (technician_id is null or technician_id = auth.uid())
    )
  )
  with check (
    client_id = auth.uid()
    or (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
      and (technician_id is null or technician_id = auth.uid())
    )
  );

-- resource_metadata -----------------------------------------------------------

create table if not exists public.resource_metadata (
  id          uuid primary key default gen_random_uuid(),
  file_name   text not null unique,
  title       text not null,
  description text,
  category    text not null,
  format      text default 'PDF',
  read_time   text,
  level       text,
  created_at  timestamptz default now()
);

alter table public.resource_metadata enable row level security;

drop policy if exists "public_read_metadata" on public.resource_metadata;
create policy "public_read_metadata" on public.resource_metadata for select
  using (true);

drop policy if exists "technician_manage_metadata" on public.resource_metadata;
create policy "technician_manage_metadata" on public.resource_metadata for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician'));

-- storage: materials / project-images ----------------------------------------
-- (project-visuals já é tratado por 20260702190000 + 20260704130000)

insert into storage.buckets (id, name, public)
values ('materials', 'materials', true), ('project-images', 'project-images', true)
on conflict (id) do nothing;

drop policy if exists "public_read_materials" on storage.objects;
create policy "public_read_materials" on storage.objects for select
  using (bucket_id = 'materials');

drop policy if exists "technician_upload_materials" on storage.objects;
create policy "technician_upload_materials" on storage.objects for insert
  with check (bucket_id = 'materials' and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'technician'));

drop policy if exists "technician_delete_materials" on storage.objects;
create policy "technician_delete_materials" on storage.objects for delete
  using (bucket_id = 'materials' and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'technician'));

drop policy if exists "public_read_project_images" on storage.objects;
create policy "public_read_project_images" on storage.objects for select
  using (bucket_id = 'project-images');

drop policy if exists "technician_upload_project_images" on storage.objects;
create policy "technician_upload_project_images" on storage.objects for insert
  with check (bucket_id = 'project-images' and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'technician'));

drop policy if exists "technician_delete_project_images" on storage.objects;
create policy "technician_delete_project_images" on storage.objects for delete
  using (bucket_id = 'project-images' and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'technician'));
