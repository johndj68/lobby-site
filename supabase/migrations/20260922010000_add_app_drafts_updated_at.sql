-- app_drafts nunca teve updated_at (só created_at) — types/app.ts declarava
-- o campo, mas a coluna real nunca existiu na tabela (achado ao consultar
-- a listagem administrativa de aplicativos, que ordena por "atualizado
-- recentemente"). Aditivo: coluna nova + trigger reaproveitando
-- update_timestamp() (20260914000000), já usada em outras tabelas do
-- projeto para o mesmo fim.

alter table public.app_drafts add column if not exists updated_at timestamptz;
update public.app_drafts set updated_at = created_at where updated_at is null;
alter table public.app_drafts alter column updated_at set default now();
alter table public.app_drafts alter column updated_at set not null;

drop trigger if exists set_app_drafts_updated_at on public.app_drafts;
create trigger set_app_drafts_updated_at
  before update on public.app_drafts
  for each row execute function update_timestamp();
