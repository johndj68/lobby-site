-- Suporte real a "Bloquear novos cadastros" por parceiro (seção 17 da
-- página /admin/marketplace/parceiros) — hoje "parceiro" é o próprio
-- profile dono dos app_drafts (created_by); não existe tabela de
-- organizações no projeto, então a restrição vive no profile mesmo.
-- Aditivo, não mexe em nada existente.

alter table public.profiles
  add column if not exists marketplace_new_apps_blocked boolean not null default false,
  add column if not exists marketplace_blocked_at timestamptz,
  add column if not exists marketplace_blocked_by uuid references auth.users(id) on delete set null,
  add column if not exists marketplace_blocked_reason text;

-- Generaliza o log de auditoria (antes só de ações por app_draft) pra
-- também registrar ações no nível do parceiro (bloquear/desbloquear
-- novos cadastros), que não têm um app_draft específico associado.
alter table public.app_admin_events alter column app_draft_id drop not null;
alter table public.app_admin_events add column if not exists partner_id uuid references auth.users(id) on delete set null;

-- Leitura de equipe/convites por app pra técnicos — só existia policy de
-- "owner e membros" (mesmo padrão de bug já corrigido em outras tabelas
-- do pipeline: nenhuma dessas duas nunca teve acesso de admin).
create policy "Admins view team members"
  on public.app_team_members for select
  using (public.is_technician((select auth.uid())));

create policy "Admins view team invitations"
  on public.app_team_invitations for select
  using (public.is_technician((select auth.uid())));
