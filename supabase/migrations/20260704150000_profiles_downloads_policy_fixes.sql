-- 3 achados da versionamento do schema (20260702100000):
--
-- 1) technician_read_profiles dava SELECT em profiles pra QUALQUER
--    autenticado (using (true)), não só técnico — qualquer cliente logado
--    lia nome/e-mail/telefone/documento de qualquer outro usuário.
-- 2) technician_assign_client dava UPDATE em QUALQUER profile pra
--    qualquer técnico, sem checar vínculo com o cliente-alvo. Grep em
--    todo app/ e components/ não encontrou nenhum caminho de código que
--    de fato use essa policy (criação/exclusão de técnico usa
--    lib/supabase-admin.ts, que bypassa RLS via service_role) — é policy
--    morta, removida em vez de restringida.
-- 3) downloads não tinha nenhuma policy de SELECT pro próprio cliente e
--    nunca teve coluna user_id — app/dashboard/downloads/page.tsx:18-22
--    filtra por e-mail (`.eq('email', user.email)`), mas RLS nunca
--    liberava isso, então a tela "Meus downloads" do cliente sempre
--    retornava vazio. Fix usa auth.email() (mesmo dado que o app já
--    filtra), sem precisar adicionar coluna nem migrar dados.

drop policy if exists "technician_read_profiles" on public.profiles;
create policy "technician_read_profiles" on public.profiles for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician'));

drop policy if exists "technician_assign_client" on public.profiles;

drop policy if exists "client_read_own_downloads" on public.downloads;
create policy "client_read_own_downloads" on public.downloads for select
  to authenticated
  using (email = auth.email());
