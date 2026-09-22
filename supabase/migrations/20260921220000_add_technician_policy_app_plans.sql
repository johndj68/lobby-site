-- INCIDENTE: endpoint de publicação (/api/admin/apps/[draftId]/publish) rejeita
-- apps com oferta real cadastrada, com "Cadastre pelo menos uma oferta antes de
-- publicar" — mesmo quando app_plans tem a linha. Causa: app_plans nunca teve
-- nenhuma policy de leitura para admin/técnico (diferente das demais tabelas do
-- pipeline, corrigidas em 20260921210000) — só "created_by = auth.uid()" (dono).
-- Um técnico logado nunca é dono do app de um parceiro, então RLS sempre
-- filtrava a oferta pra zero linhas nessa consulta.
--
-- Fix: mesma função public.is_technician(uid) já usada nas outras policies do
-- pipeline (20260704170000_fix_profiles_select_recursion.sql).

create policy "Admins manage all plans"
  on public.app_plans
  using (public.is_technician((select auth.uid())))
  with check (public.is_technician((select auth.uid())));
