-- GAP: publicar uma submissão (app_drafts.status='published', endpoint
-- /api/admin/apps/[draftId]/publish) nunca tocava em public.applications —
-- a tabela real que app/page.tsx lê pra montar a home e o catálogo público.
-- Um app "publicado" pelo admin nunca aparecia de fato pro público.
--
-- Fix: coluna de link 1:1 entre app_drafts (pipeline do parceiro) e
-- applications (catálogo público). Nullable porque apps LOBBY-made em
-- applications não têm draft nenhum, e drafts ainda não publicados também
-- não têm applications ainda.

alter table public.app_drafts
  add column if not exists application_id uuid references public.applications(id) on delete set null;

create index if not exists idx_app_drafts_application_id on public.app_drafts(application_id);
