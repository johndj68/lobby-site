-- client_projects tinha uma policy "technician_manage_all" (for all, sem
-- checagem de equipe, role public) coexistindo com "technician_update" e
-- "technician_delete". Como policies de RLS são OR'd entre si, a policy
-- solta ("qualquer técnico pode fazer qualquer coisa nesta tabela") na
-- prática anulava a restrição de equipe que "technician_update" já tentava
-- impor — e "technician_delete" nunca teve essa restrição em primeiro
-- lugar. O botão "Editar"/"Excluir" ficava escondido na UI
-- (ProjetosClientesClient.tsx:974, canEdit = !isProjectClaimed || isMember),
-- mas a chamada direta ao Supabase (handleSave/handleDelete) não tinha o
-- mesmo bloqueio no banco — qualquer técnico podia editar/excluir projeto
-- de outro só reabrindo o devtools.
--
-- Fix: remove a policy solta e alinha technician_update/technician_delete
-- com a mesma regra já usada pela UI: projeto sem lead_technician_id pode
-- ser editado/excluído por qualquer técnico (ainda não reivindicado);
-- projeto já reivindicado só por membro aceito da equipe
-- (is_accepted_team_member, já usada pelas policies de client_project_team).
-- technician_update também ganha a mesma condição no WITH CHECK — antes só
-- verificava a role, não a equipe, na linha resultante do update.

drop policy if exists "technician_manage_all" on client_projects;

drop policy if exists "technician_delete" on client_projects;
create policy "technician_delete" on client_projects for delete
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician')
    and (lead_technician_id is null or is_accepted_team_member(id, auth.uid()))
  );

drop policy if exists "technician_update" on client_projects;
create policy "technician_update" on client_projects for update
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician')
    and (lead_technician_id is null or is_accepted_team_member(id, auth.uid()))
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician')
    and (lead_technician_id is null or is_accepted_team_member(id, auth.uid()))
  );
