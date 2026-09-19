-- INCIDENTE: a policy client_read_own_project_technician (migration
-- anterior, 20260715063222) causou "infinite recursion detected in policy
-- for relation profiles" (42P17) — mesmo gatilho clássico já documentado
-- em 20260704170000: a policy consulta client_projects, e client_projects
-- tem sua própria policy (technician_select) que consulta profiles de
-- volta, formando um ciclo na hora do Postgres resolver RLS.
--
-- Isso quebrou QUALQUER select em profiles feito por um cliente (inclusive
-- ler o PRÓPRIO perfil via own_profile_select), porque todas as policies
-- de uma tabela são avaliadas e uma exceção em qualquer uma derruba a
-- query inteira — não é algo que "falha silenciosamente" só pra essa
-- policy nova. Corrigido no mesmo push que quebrou, sem deixar em produção.
--
-- Fix: mesmo padrão de is_technician() — mover a checagem pra função
-- SECURITY DEFINER, que roda com privilégio do dono e não reaciona RLS de
-- client_projects durante a consulta interna, quebrando o ciclo.

create or replace function public.is_client_project_technician(p_technician_id uuid, p_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.client_projects cp
    where cp.lead_technician_id = p_technician_id and cp.client_id = p_client_id
  );
$$;

drop policy if exists "client_read_own_project_technician" on public.profiles;
create policy "client_read_own_project_technician" on public.profiles for select
  to authenticated
  using (public.is_client_project_technician(profiles.id, auth.uid()));
