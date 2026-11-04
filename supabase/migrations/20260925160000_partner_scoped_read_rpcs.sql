-- Três funções SECURITY DEFINER de leitura estreita — cada uma resolve um
-- gap deixado de propósito na melhoria de "Meus aplicativos"
-- (/dashboard/meus-app): dados que o parceiro precisa ver mas que abrir via
-- policy direta na tabela vazaria mais do que o necessário pra qualquer
-- autenticado. Todas checam acesso internamente (dono OU app_team_members
-- OU técnico) antes de devolver qualquer linha — nenhuma abre a tabela de
-- verdade, só uma função que decide o que mostrar.

-- 1) Nome do dono de um app, pra distinguir apps na listagem quando o
--    usuário está vendo via app_team_members (não é ele o dono). Batched
--    por array de ids — uma chamada pra tela inteira, não uma por linha.
--    NÃO abre profiles geral: só devolve owner de apps que o caller já tem
--    acesso a; ids sem acesso simplesmente não aparecem no resultado.
create or replace function public.get_app_owners(p_app_draft_ids uuid[])
returns table (app_draft_id uuid, owner_id uuid, full_name text, company_name text)
language sql
security definer
set search_path = public
stable
as $$
  select d.id, p.id, p.full_name, p.company_name
  from public.app_drafts d
  join public.profiles p on p.id = d.created_by
  where d.id = any(p_app_draft_ids)
    and (
      d.created_by = auth.uid()
      or public.is_app_team_member(d.id, auth.uid())
      or public.is_technician(auth.uid())
    );
$$;

-- 2) Checklist de uma submissão, só os campos seguros pro parceiro ver
--    (item_label / status / description) — nunca `note` (anotação de
--    trabalho do analista) nem `blocked`/`marked_by`. review_checklist_items
--    continua admin-only na tabela; isso é uma janela estreita por cima.
create or replace function public.get_submission_checklist_public(p_submission_id uuid)
returns table (section text, item_key text, item_label text, item_description text, status text)
language sql
security definer
set search_path = public
stable
as $$
  select c.section, c.item_key, c.item_label, c.item_description, c.status
  from public.review_checklist_items c
  join public.app_submissions s on s.id = c.submission_id
  where c.submission_id = p_submission_id
    and (
      s.app_draft_id in (select id from public.app_drafts where created_by = auth.uid())
      or public.is_app_team_member(s.app_draft_id, auth.uid())
      or public.is_technician(auth.uid())
    )
  order by c.section;
$$;

grant execute on function public.get_app_owners(uuid[]) to authenticated;
grant execute on function public.get_submission_checklist_public(uuid) to authenticated;
