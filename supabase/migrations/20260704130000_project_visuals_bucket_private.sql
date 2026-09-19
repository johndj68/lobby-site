-- O bucket project-visuals era público com SELECT sem autenticação
-- (using (bucket_id = 'project-visuals'), ver 20260702190000). O toggle
-- "Oculto ao cliente" (visibleToClient) em client_progress.clientVisualAssets
-- só filtra o que aparece na tela do cliente — a URL pública do arquivo
-- continuava válida e sem autenticação para qualquer pessoa com o link,
-- inclusive documentos marcados como ocultos.
--
-- Fix: bucket vira privado; SELECT passa a exigir que o requisitante seja
-- técnico (mesma regra já usada em insert/delete), ou o cliente dono do
-- projeto cujo client_progress.clientVisualAssets referencia aquele arquivo
-- E o item não esteja marcado visibleToClient = false. O app troca a URL
-- pública armazenada por uma signed URL gerada sob demanda (ver
-- lib/project-visuals-upload.ts:resolveProjectVisualUrl), então nenhuma
-- migração de dados é necessária — o path já usado como chave de objeto
-- continua o mesmo, só passa a exigir autorização para ser lido.

update storage.buckets set public = false where id = 'project-visuals';

drop policy if exists "project_visuals_select_public" on storage.objects;

create policy "project_visuals_select_authorized" on storage.objects for select
  using (
    bucket_id = 'project-visuals'
    and (
      exists (
        select 1 from profiles p
        where p.id = auth.uid() and p.role = 'technician'
      )
      or exists (
        select 1 from client_projects cp
        where cp.client_id = auth.uid()
        and (
          exists (
            select 1
            from jsonb_array_elements(coalesce(cp.client_progress->'clientVisualAssets'->'images', '[]'::jsonb)) as img
            where coalesce((img->>'visibleToClient')::boolean, true)
              and right(img->>'url', length(storage.objects.name) + 1) = '/' || storage.objects.name
          )
          or exists (
            select 1
            from jsonb_array_elements(coalesce(cp.client_progress->'clientVisualAssets'->'documents', '[]'::jsonb)) as doc
            where coalesce((doc->>'visibleToClient')::boolean, true)
              and right(doc->>'fileUrl', length(storage.objects.name) + 1) = '/' || storage.objects.name
          )
          or exists (
            select 1
            from jsonb_array_elements(coalesce(cp.client_progress->'clientVisualAssets'->'deliverables', '[]'::jsonb)) as del
            where coalesce((del->>'visibleToClient')::boolean, true)
              and del->>'imageUrl' is not null
              and right(del->>'imageUrl', length(storage.objects.name) + 1) = '/' || storage.objects.name
          )
        )
      )
    )
  );
