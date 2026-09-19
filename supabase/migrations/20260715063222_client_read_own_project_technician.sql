-- profiles não tinha NENHUMA policy permitindo um cliente ler o perfil do
-- técnico responsável pelo próprio projeto — só existia own_profile_select
-- (cada um lê só a si mesmo) e technician_read_profiles (técnico lê
-- qualquer perfil). Resultado: app/dashboard/projetos/[id]/page.tsx
-- buscava o nome do lead_technician_id e sempre vinha vazio, então o
-- cliente continuava vendo "Equipe LOBBY" mesmo depois de um técnico
-- aceitar o projeto — a causa raiz exata da confusão relatada.
--
-- Escopo bem restrito: só libera leitura do perfil de um técnico que seja
-- de fato lead_technician_id de algum client_projects daquele cliente
-- específico — não abre leitura geral de perfis de técnico pra cliente.

drop policy if exists "client_read_own_project_technician" on public.profiles;
create policy "client_read_own_project_technician" on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.client_projects cp
      where cp.lead_technician_id = profiles.id
        and cp.client_id = auth.uid()
    )
  );
