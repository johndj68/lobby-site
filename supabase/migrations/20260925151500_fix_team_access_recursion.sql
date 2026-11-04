-- INCIDENTE: 20260925150000 quebrou toda leitura de app_drafts pro cliente
-- (42P17 "infinite recursion detected in policy for relation
-- app_team_members"). Causa: a nova policy de app_drafts consulta
-- app_team_members num subquery direto; a policy JÁ EXISTENTE de
-- app_team_members ("View members - owner and team") consulta app_drafts
-- de volta (pro caso do dono) — ciclo entre as duas tabelas.
--
-- Mesmo padrão de 20260704170000_fix_profiles_select_recursion.sql: mover a
-- checagem de membership pra uma função SECURITY DEFINER. Rodando com os
-- privilégios do dono da função, a consulta interna a app_team_members
-- ignora RLS daquela tabela — quebra o ciclo sem abrir a tabela pra mais
-- ninguém (a função só devolve true/false, nunca linhas).

create or replace function public.is_app_team_member(p_app_draft_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_team_members
    where app_draft_id = p_app_draft_id and user_id = p_user_id
  );
$$;

drop policy if exists "Team members view accessible drafts" on public.app_drafts;
create policy "Team members view accessible drafts"
  on public.app_drafts for select
  using (public.is_app_team_member(id, auth.uid()));

drop policy if exists "Team members view accessible submissions" on public.app_submissions;
create policy "Team members view accessible submissions"
  on public.app_submissions for select
  using (public.is_app_team_member(app_draft_id, auth.uid()));

drop policy if exists "Team members view accessible plans" on public.app_plans;
create policy "Team members view accessible plans"
  on public.app_plans for select
  using (public.is_app_team_member(app_draft_id, auth.uid()));

drop policy if exists "Owners and team view own application" on public.applications;
create policy "Owners and team view own application"
  on public.applications for select
  using (
    id in (
      select application_id from public.app_drafts
      where application_id is not null
      and (created_by = auth.uid() or public.is_app_team_member(id, auth.uid()))
    )
  );
