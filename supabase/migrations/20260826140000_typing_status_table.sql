-- Substitui a tentativa anterior (20260826130000_typing_channel_authorization.sql,
-- nunca aplicada) de autorizar os canais Presence "typing:*" via RLS em
-- realtime.messages. Aquilo esbarrou num limite de plataforma: a role usada
-- pelo `db push` (postgres) não é dona de realtime.messages nesse projeto e
-- a Supabase reserva membership em supabase_realtime_admin só pra
-- superusuário — confirmado ao vivo (`must be owner of table messages` na
-- ALTER TABLE, e depois `role memberships are reserved` ao tentar
-- `grant supabase_realtime_admin to postgres`). Sem alternativa por SQL.
--
-- Solução: trocar Presence (que só a Supabase pode proteger com RLS) por uma
-- tabela normal com RLS nossa + Realtime via postgres_changes, que já
-- respeita RLS automaticamente — sem precisar tocar em nada fora do schema
-- public. Mesmo indicador "digitando" pro usuário final, transporte diferente.

create table if not exists public.typing_status (
  client_id   uuid not null references auth.users(id) on delete cascade,
  -- Sentinela fixa pra thread "Suporte geral" (sem projeto) — não pode ser
  -- null porque colunas de PK não aceitam null, e um valor sentinela mantém
  -- o upsert com ON CONFLICT simples (client_id, project_id, role).
  project_id  uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  role        text not null check (role in ('client', 'technician')),
  typing      boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (client_id, project_id, role)
);

comment on table public.typing_status is
  'Estado efêmero de "digitando" por thread de chat (client_id+project_id) e papel de quem digita. Substitui Presence — ver 20260826140000.';
comment on column public.typing_status.project_id is
  '00000000-0000-0000-0000-000000000000 = thread "Suporte geral" (sem projeto vinculado).';

alter table public.typing_status enable row level security;

revoke all on public.typing_status from public, anon;

-- SELECT: mesma regra de visibilidade de public.messages — o próprio cliente
-- dono da conversa, ou um técnico (thread geral é aberta a qualquer técnico;
-- thread de projeto exige líder ou o técnico responsável).
create policy typing_status_select
  on public.typing_status
  for select
  to authenticated
  using (
    client_id = auth.uid()
    or (
      public.is_technician(auth.uid())
      and (
        project_id = '00000000-0000-0000-0000-000000000000'::uuid
        or public.is_leader(auth.uid())
        or exists (
          select 1 from public.client_projects cp
          where cp.id = project_id
            and cp.lead_technician_id = auth.uid()
        )
      )
    )
  );

-- INSERT/UPDATE: mesma visibilidade acima, MAIS o campo `role` precisa bater
-- com o papel de quem está escrevendo — impede um cliente inserir uma linha
-- role='technician' (ou vice-versa) fingindo ser a outra parte da conversa.
create policy typing_status_insert
  on public.typing_status
  for insert
  to authenticated
  with check (
    (role = 'client' and client_id = auth.uid())
    or (
      role = 'technician'
      and public.is_technician(auth.uid())
      and (
        project_id = '00000000-0000-0000-0000-000000000000'::uuid
        or public.is_leader(auth.uid())
        or exists (
          select 1 from public.client_projects cp
          where cp.id = project_id
            and cp.lead_technician_id = auth.uid()
        )
      )
    )
  );

create policy typing_status_update
  on public.typing_status
  for update
  to authenticated
  using (
    (role = 'client' and client_id = auth.uid())
    or (
      role = 'technician'
      and public.is_technician(auth.uid())
      and (
        project_id = '00000000-0000-0000-0000-000000000000'::uuid
        or public.is_leader(auth.uid())
        or exists (
          select 1 from public.client_projects cp
          where cp.id = project_id
            and cp.lead_technician_id = auth.uid()
        )
      )
    )
  )
  with check (
    (role = 'client' and client_id = auth.uid())
    or (
      role = 'technician'
      and public.is_technician(auth.uid())
      and (
        project_id = '00000000-0000-0000-0000-000000000000'::uuid
        or public.is_leader(auth.uid())
        or exists (
          select 1 from public.client_projects cp
          where cp.id = project_id
            and cp.lead_technician_id = auth.uid()
        )
      )
    )
  );

-- Sem policy de DELETE — linhas só transicionam typing true/false via
-- upsert/update; não há necessidade de excluir.

grant select, insert, update on public.typing_status to authenticated;

create index if not exists typing_status_client_idx on public.typing_status (client_id);
