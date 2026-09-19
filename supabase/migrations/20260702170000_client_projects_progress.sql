alter table client_projects
  add column if not exists client_progress jsonb not null default '{}'::jsonb;
