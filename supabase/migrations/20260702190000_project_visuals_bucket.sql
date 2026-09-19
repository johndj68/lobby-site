insert into storage.buckets (id, name, public)
values ('project-visuals', 'project-visuals', true)
on conflict (id) do nothing;

drop policy if exists "project_visuals_select_public" on storage.objects;
create policy "project_visuals_select_public" on storage.objects for select
  using (bucket_id = 'project-visuals');

drop policy if exists "project_visuals_insert_technician" on storage.objects;
create policy "project_visuals_insert_technician" on storage.objects for insert
  with check (bucket_id = 'project-visuals' and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician'));

drop policy if exists "project_visuals_delete_technician" on storage.objects;
create policy "project_visuals_delete_technician" on storage.objects for delete
  using (bucket_id = 'project-visuals' and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician'));
