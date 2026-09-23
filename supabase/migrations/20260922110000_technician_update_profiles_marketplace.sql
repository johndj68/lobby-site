-- INCIDENTE: /api/admin/partners/[partnerId]/block sempre retornava 409
-- "não foi possível bloquear agora" pra qualquer parceiro. Causa: a única
-- policy de UPDATE em profiles é "own_profile_update" (auth.uid() = id) —
-- a policy que permitia técnico atualizar perfil de terceiros
-- ("technician_assign_client") foi removida de propósito em
-- 20260704150000 por estar sem nenhum uso na época ("dead policy"). Não
-- havia caso de uso legítimo até agora.
--
-- Bloquear/desbloquear novos cadastros de parceiro (seção 17 de
-- /admin/marketplace/parceiros) É um caso de uso legítimo: precisa que um
-- técnico grave marketplace_new_apps_blocked/blocked_at/by/reason na linha
-- de OUTRO usuário. Reintroduzir como policy ampla ("technician updates
-- anything") repetiria o problema apontado na remoção anterior — em vez
-- disso, a policy libera update pra técnico, e quem trava role/is_leader
-- continua sendo o trigger já existente
-- (prevent_profile_privilege_escalation, 20260704120000), que roda pra
-- QUALQUER update independente da policy e já bloqueia essas duas colunas
-- fora do service_role.

create policy "technician_update_profiles" on public.profiles for update
  to authenticated
  using (public.is_technician((select auth.uid())))
  with check (public.is_technician((select auth.uid())));
