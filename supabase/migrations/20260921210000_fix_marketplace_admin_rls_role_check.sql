-- INCIDENTE: nenhum técnico consegue ver/gerenciar apps de parceiros hoje —
-- confirmado em /admin/marketplace/solicitacoes (central de revisão, mostra
-- "0" em tudo) e em /admin/marketplace (visão geral) mesmo havendo
-- submissões reais no banco.
--
-- Causa: todas as policies "admin" do pipeline de marketplace (apps de
-- parceiro, ofertas, ativação, checklist de revisão, campanhas) foram
-- escritas como `auth.jwt() ->> 'role' = 'admin'`. Isso está errado em dois
-- níveis:
--   1. `auth.jwt() ->> 'role'` lê o claim de topo do JWT (o papel do
--      Postgres/PostgREST, sempre 'authenticated'), não o app_metadata
--      sincronizado por 20260720140000_sync_role_to_jwt.sql.
--   2. Mesmo lendo o claim certo, nenhum profile tem role = 'admin' neste
--      projeto — o papel de admin/técnico é sempre 'technician'
--      (profiles.role), conferido em requireTechnicianSession().
-- Resultado: a cláusula "admin" nunca é verdadeira, então cada policy dessas
-- vira, na prática, "só o dono vê" — e a central de revisão do admin não
-- enxerga nada de ninguém.
--
-- Fix: trocar pela função public.is_technician(uid), já existente desde
-- 20260704170000_fix_profiles_select_recursion.sql (SECURITY DEFINER,
-- consulta profiles.role='technician' sem reacionar RLS — mesmo padrão já
-- usado em profiles e client_projects). Sem tabela nova, sem policy nova de
-- conceito — só corrige a condição quebrada nas policies já existentes.

-- =============================================
-- app_drafts / app_submissions / app_review_checklist / app_plans
-- (20260921000000_app_developer_marketplace.sql)
-- =============================================

drop policy if exists "Admins manage all drafts" on public.app_drafts;
create policy "Admins manage all drafts"
  on public.app_drafts
  using (public.is_technician((select auth.uid())))
  with check (public.is_technician((select auth.uid())));

drop policy if exists "Developers view own submissions" on public.app_submissions;
create policy "Developers view own submissions"
  on public.app_submissions for select
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );

drop policy if exists "Admins manage submissions" on public.app_submissions;
create policy "Admins manage submissions"
  on public.app_submissions
  using (public.is_technician((select auth.uid())))
  with check (public.is_technician((select auth.uid())));

drop policy if exists "Only admins manage checklists" on public.app_review_checklist;
create policy "Only admins manage checklists"
  on public.app_review_checklist
  using (public.is_technician((select auth.uid())))
  with check (public.is_technician((select auth.uid())));

-- =============================================
-- app_activation_config / app_activation_codes_batch / app_activation_codes
-- (20260921000002_app_activation.sql)
-- =============================================

drop policy if exists "Developers view own activation config" on public.app_activation_config;
create policy "Developers view own activation config"
  on public.app_activation_config for select
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );

drop policy if exists "Developers update own activation config" on public.app_activation_config;
create policy "Developers update own activation config"
  on public.app_activation_config for update
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );

drop policy if exists "Developers insert own activation config" on public.app_activation_config;
create policy "Developers insert own activation config"
  on public.app_activation_config for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );

drop policy if exists "Developers view own code batches" on public.app_activation_codes_batch;
create policy "Developers view own code batches"
  on public.app_activation_codes_batch for select
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );

drop policy if exists "Developers insert own code batches" on public.app_activation_codes_batch;
create policy "Developers insert own code batches"
  on public.app_activation_codes_batch for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );

drop policy if exists "Developers view own codes" on public.app_activation_codes;
create policy "Developers view own codes"
  on public.app_activation_codes for select
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );

drop policy if exists "Developers insert own codes" on public.app_activation_codes;
create policy "Developers insert own codes"
  on public.app_activation_codes for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );

-- =============================================
-- app_review_acceptances (20260921000004_app_review_acceptances.sql)
-- =============================================

drop policy if exists "View acceptances - owner" on public.app_review_acceptances;
create policy "View acceptances - owner"
  on public.app_review_acceptances for select
  using (
    app_draft_id in (
      select id from public.app_drafts where created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );

-- =============================================
-- review_checklist_items / review_issues (20260921000006_admin_review_checklist.sql)
-- =============================================

drop policy if exists "admin_view_checklist" on public.review_checklist_items;
create policy "admin_view_checklist" on public.review_checklist_items for select
  using (public.is_technician((select auth.uid())));

drop policy if exists "admin_manage_checklist" on public.review_checklist_items;
create policy "admin_manage_checklist" on public.review_checklist_items for insert
  with check (public.is_technician((select auth.uid())));

drop policy if exists "admin_update_checklist" on public.review_checklist_items;
create policy "admin_update_checklist" on public.review_checklist_items for update
  using (public.is_technician((select auth.uid())));

drop policy if exists "admin_view_issues" on public.review_issues;
create policy "admin_view_issues" on public.review_issues for select
  using (public.is_technician((select auth.uid())));

drop policy if exists "admin_manage_issues" on public.review_issues;
create policy "admin_manage_issues" on public.review_issues for insert
  with check (public.is_technician((select auth.uid())));

drop policy if exists "admin_update_issues" on public.review_issues;
create policy "admin_update_issues" on public.review_issues for update
  using (public.is_technician((select auth.uid())));

-- =============================================
-- storage.objects — bucket app_media (20260921000001_app_media_bucket.sql)
-- =============================================

drop policy if exists "Admins manage all app media" on storage.objects;
create policy "Admins manage all app media"
  on storage.objects
  using (bucket_id = 'app_media' and public.is_technician((select auth.uid())))
  with check (bucket_id = 'app_media' and public.is_technician((select auth.uid())));

-- =============================================
-- applications / promotions / sponsored_campaigns
-- (20260920225514_marketplace_apps_promotions.sql)
-- =============================================

drop policy if exists "Admins can manage applications" on public.applications;
create policy "Admins can manage applications"
  on public.applications
  using (public.is_technician((select auth.uid())))
  with check (public.is_technician((select auth.uid())));

drop policy if exists "Admins can manage promotions" on public.promotions;
create policy "Admins can manage promotions"
  on public.promotions
  using (public.is_technician((select auth.uid())))
  with check (public.is_technician((select auth.uid())));

drop policy if exists "Admins can manage sponsored campaigns" on public.sponsored_campaigns;
create policy "Admins can manage sponsored campaigns"
  on public.sponsored_campaigns
  using (public.is_technician((select auth.uid())))
  with check (public.is_technician((select auth.uid())));
