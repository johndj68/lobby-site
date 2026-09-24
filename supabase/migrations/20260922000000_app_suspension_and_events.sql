-- Suporte a suspensão de publicação (independente de revisão) e log de
-- auditoria das ações administrativas do marketplace — nenhum dos dois
-- existia. Aditivo: não altera nem remove nada existente.

alter table public.applications
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null,
  add column if not exists suspended_reason text;

-- app_admin_events: trilha de auditoria das ações administrativas sobre um
-- app do marketplace (publicar, suspender, reativar...). Guarda estado
-- anterior/posterior e motivo, nunca segredos/códigos de ativação.
create table if not exists public.app_admin_events (
  id uuid primary key default gen_random_uuid(),
  app_draft_id uuid not null references public.app_drafts(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null, -- 'publish', 'suspend', 'reactivate'
  reason text,
  previous_status text,
  new_status text,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_admin_events_draft on public.app_admin_events(app_draft_id, created_at desc);

alter table public.app_admin_events enable row level security;

create policy "Admins manage admin events"
  on public.app_admin_events
  using (public.is_technician((select auth.uid())))
  with check (public.is_technician((select auth.uid())));
