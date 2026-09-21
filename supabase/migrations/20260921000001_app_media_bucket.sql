-- =============================================
-- App Media Storage Bucket
-- =============================================

-- Create bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app_media',
  'app_media',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

-- Public read access for uploaded media
create policy "Public read access for app media"
  on storage.objects for select
  using (bucket_id = 'app_media');

-- Developer upload access
create policy "Developers upload own app media"
  on storage.objects for insert
  with check (
    bucket_id = 'app_media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] in (
      select id::text from public.app_drafts where created_by = auth.uid()
    )
  );

-- Developer delete access
create policy "Developers delete own app media"
  on storage.objects for delete
  using (
    bucket_id = 'app_media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] in (
      select id::text from public.app_drafts where created_by = auth.uid()
    )
  );

-- Admin access
create policy "Admins manage all app media"
  on storage.objects
  using (bucket_id = 'app_media' and auth.jwt() ->> 'role' = 'admin')
  with check (bucket_id = 'app_media' and auth.jwt() ->> 'role' = 'admin');
