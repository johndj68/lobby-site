-- INCIDENTE: login de técnico quebrado com 500 em
-- GET .../profiles?select=role&id=eq.<uuid> logo após
-- 20260704150000 reescrever technician_read_profiles com um subquery
-- direto contra a própria profiles:
--   using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician'))
-- Policy de SELECT referenciando a MESMA tabela onde está definida é o
-- gatilho clássico do Postgres para "infinite recursion detected in
-- policy for relation" (42P17) — a policy solta anterior (using (true))
-- não tinha esse problema por não ter subquery nenhum.
--
-- Fix: mover a checagem para uma função SECURITY DEFINER (mesmo padrão já
-- usado por is_accepted_team_member) — como a função roda com os
-- privilégios do dono, ela ignora RLS na consulta interna e quebra o
-- ciclo, sem abrir mão da restrição (só técnico lê perfil de outra
-- pessoa).

create or replace function public.is_technician(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = uid and role = 'technician');
$$;

drop policy if exists "technician_read_profiles" on public.profiles;
create policy "technician_read_profiles" on public.profiles for select
  to authenticated
  using (public.is_technician(auth.uid()));
