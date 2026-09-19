-- Projeto pago no portfólio público (/projetos) — diferente dos e-books:
-- aqui não existe entregável nenhum, é só preço + selo "Projeto pago" na
-- vitrine, com CTA levando pro /contato já com a mensagem preenchida. Não
-- precisa de bucket privado nem de tabela de compras.
--
-- is_paid/price ainda são leader-only, mesmo sem risco de vazamento de
-- arquivo — mantém o mesmo critério já usado em resource_metadata e
-- financial_transactions (só líder mexe em preço). "technician_manage_projects"
-- (all, sem restrição de coluna) segue valendo pros outros campos; RLS não
-- faz checagem coluna-a-coluna nativamente, então o bloqueio de is_paid/price
-- é via trigger — mesmo padrão de profiles_prevent_privilege_escalation
-- (20260704120000).

alter table public.lobby_projects
  add column if not exists is_paid boolean not null default false,
  add column if not exists price   numeric(12,2) check (price is null or price > 0);

create or replace function public.prevent_project_price_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  leader boolean;
begin
  select (role = 'technician' and is_leader = true) into leader
  from public.profiles where id = auth.uid();

  if coalesce(leader, false) then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    if new.is_paid is true or new.price is not null then
      raise exception 'Somente Técnico Líder pode cadastrar projeto como pago.';
    end if;
  elsif TG_OP = 'UPDATE' then
    if new.is_paid is distinct from old.is_paid or new.price is distinct from old.price then
      raise exception 'Somente Técnico Líder pode alterar preço/tipo do projeto.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lobby_projects_prevent_price_escalation on public.lobby_projects;
create trigger lobby_projects_prevent_price_escalation
  before insert or update on public.lobby_projects
  for each row execute function public.prevent_project_price_escalation();
