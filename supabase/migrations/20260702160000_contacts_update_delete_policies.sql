-- contacts tinha só policy de INSERT (público) e SELECT (criada manualmente
-- fora de migration). UPDATE/DELETE nunca foram liberados para técnicos —
-- writes falhavam silenciosamente (RLS bloqueia sem erro, só afeta 0 linhas),
-- mascarado pelo estado otimista do client até um reload revelar que nada
-- persistiu de verdade.

drop policy if exists "contacts_update_technician" on contacts;
create policy "contacts_update_technician" on contacts for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician'));

drop policy if exists "contacts_delete_leader" on contacts;
create policy "contacts_delete_leader" on contacts for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true));
