drop policy if exists "client_projects_update_own" on client_projects;
create policy "client_projects_update_own" on client_projects for update
  using (client_id = auth.uid())
  with check (client_id = auth.uid());
