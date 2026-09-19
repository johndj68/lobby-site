-- Controle financeiro — visível só pro técnico líder (profiles.role =
-- 'technician' AND profiles.is_leader = true). O projeto não tem uma role
-- "tecnico_lider" separada; is_leader já é exatamente esse conceito (é o
-- mesmo campo que já restringe /admin/equipe), reaproveitado aqui em vez
-- de criar uma segunda forma de marcar "é líder" no schema.

create table if not exists public.financial_transactions (
  id                  uuid primary key default gen_random_uuid(),
  type                text not null check (type in ('ebook', 'projeto', 'visita_tecnica', 'consultoria', 'mensalidade', 'outro')),
  client_id           uuid references public.profiles(id) on delete set null,
  client_name         text,
  company_name        text,
  description         text not null,
  amount              numeric(12,2) not null check (amount > 0),
  status              text not null default 'pendente' check (status in ('pago', 'pendente', 'cancelado', 'reembolsado', 'negociacao')),
  payment_method      text check (payment_method in ('pix', 'cartao', 'boleto', 'dinheiro', 'transferencia', 'outro')),
  sale_date           date not null default current_date,
  received_date       date,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists financial_transactions_sale_date_idx on public.financial_transactions (sale_date desc);
create index if not exists financial_transactions_status_idx    on public.financial_transactions (status);
create index if not exists financial_transactions_type_idx      on public.financial_transactions (type);

alter table public.financial_transactions enable row level security;

-- Todas as operações restritas a técnico líder — cliente, técnico comum e
-- anônimo não têm nenhuma policy aqui, então RLS bloqueia por padrão
-- (deny-by-default). Validação de role acontece no banco, não só na UI.
drop policy if exists "leader_select_finance" on public.financial_transactions;
create policy "leader_select_finance" on public.financial_transactions for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true));

drop policy if exists "leader_insert_finance" on public.financial_transactions;
create policy "leader_insert_finance" on public.financial_transactions for insert
  to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true));

drop policy if exists "leader_update_finance" on public.financial_transactions;
create policy "leader_update_finance" on public.financial_transactions for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true));

drop policy if exists "leader_delete_finance" on public.financial_transactions;
create policy "leader_delete_finance" on public.financial_transactions for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true));
