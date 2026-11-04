-- Parceiros convidados (app_team_members) não conseguiam ver os apps em que
-- foram adicionados: as policies de SELECT em app_drafts/app_submissions/
-- app_plans só liberavam created_by = auth.uid(), nunca checavam
-- app_team_members. O convite existe e é aceito, mas o app nunca aparecia
-- pra quem foi convidado — só pro dono. Aditivo: cria policies extras
-- (múltiplas policies permissivas no Postgres se combinam com OR), não
-- remove nenhuma das existentes.

create policy "Team members view accessible drafts"
  on public.app_drafts for select
  using (
    id in (select app_draft_id from public.app_team_members where user_id = auth.uid())
  );

create policy "Team members view accessible submissions"
  on public.app_submissions for select
  using (
    app_draft_id in (select app_draft_id from public.app_team_members where user_id = auth.uid())
  );

create policy "Team members view accessible plans"
  on public.app_plans for select
  using (
    app_draft_id in (select app_draft_id from public.app_team_members where user_id = auth.uid())
  );

-- applications só tinha a policy pública (is_published = true). Suspender um
-- app seta is_published = false (ver app/api/admin/apps/[appId]/suspend) —
-- então, hoje, o próprio dono de um app suspenso não consegue ler a linha de
-- applications dele: a listagem do parceiro não tem como saber/mostrar que
-- o app está suspenso. Adiciona leitura própria (dono ou membro do time),
-- independente do estado de publicação.
create policy "Owners and team view own application"
  on public.applications for select
  using (
    id in (
      select application_id from public.app_drafts
      where application_id is not null
      and (
        created_by = auth.uid()
        or id in (select app_draft_id from public.app_team_members where user_id = auth.uid())
      )
    )
  );
