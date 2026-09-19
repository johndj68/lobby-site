-- profiles: a policy de UPDATE ("Users can update own profile", schema.sql:76-78)
-- só verifica auth.uid() = id — sem WITH CHECK de coluna, nada impede um
-- usuário autenticado de alterar role/is_leader na própria linha via
-- update direto do browser (ex.: supabase.from('profiles').update({role:'technician'})),
-- já que toda checagem de autorização do app (middleware, páginas, actions)
-- lê exatamente esses dois campos. RLS não faz checagem coluna-a-coluna
-- nativamente, então o bloqueio precisa ser em trigger.
--
-- Escrita legítima de role/is_leader só acontece hoje via lib/supabase-admin.ts
-- (service_role key, em app/admin/equipe/actions.ts), então o trigger libera
-- quando auth.role() = 'service_role' e bloqueia qualquer outra sessão.

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.role is distinct from old.role
       or new.is_leader is distinct from old.is_leader then
      raise exception 'Alterar role ou is_leader não é permitido por este canal.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();
