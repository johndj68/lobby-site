-- Contas a pagar/receber: liquidação parcial, cancelamento vs estorno,
-- auditoria e anexo — item sinalizado pra virar módulo AP/AR de verdade,
-- hoje só um CRUD binário (pendente→pago/cancelado, sem valor parcial).
--
-- Reaproveita o padrão já testado de liquidação com concorrência
-- (refund_credit_purchase/refund_financial_transaction,
-- supabase/migrations/20260927170000_reembolso_parcial.sql): security
-- definer + `select ... for update` + coluna cumulativa com CHECK. E o
-- padrão de auditoria (app_admin_events,
-- 20260922000000_app_suspension_and_events.sql): tabela insert-only,
-- actor_id/action/previous_status/new_status/reason.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual, mesma disciplina das migrations anteriores.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) accounts_payable/accounts_receivable ganham liquidação parcial
-- ─────────────────────────────────────────────────────────────────────────

alter table public.accounts_payable
  add column if not exists amount_settled numeric(12,2) not null default 0,
  add column if not exists attachment_path text,
  add column if not exists reference text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.accounts_payable
  add constraint accounts_payable_amount_settled_check
  check (amount_settled >= 0 and amount_settled <= amount);

alter table public.accounts_payable drop constraint if exists accounts_payable_status_check;
alter table public.accounts_payable
  add constraint accounts_payable_status_check
  check (status in ('pendente', 'pago', 'parcial', 'cancelado'));

alter table public.accounts_receivable
  add column if not exists amount_settled numeric(12,2) not null default 0,
  add column if not exists attachment_path text,
  add column if not exists reference text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.accounts_receivable
  add constraint accounts_receivable_amount_settled_check
  check (amount_settled >= 0 and amount_settled <= amount);

alter table public.accounts_receivable drop constraint if exists accounts_receivable_status_check;
alter table public.accounts_receivable
  add constraint accounts_receivable_status_check
  check (status in ('pendente', 'recebido', 'parcial', 'cancelado'));

comment on column public.accounts_payable.amount_settled is
  'Soma cumulativa já paga (via settle_account). status vira parcial enquanto 0 < amount_settled < amount, pago quando amount_settled = amount.';
comment on column public.accounts_receivable.amount_settled is
  'Soma cumulativa já recebida (via settle_account). status vira parcial enquanto 0 < amount_settled < amount, recebido quando amount_settled = amount.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) account_settlements — uma linha por liquidação (total ou parcial)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.account_settlements (
  id               uuid primary key default gen_random_uuid(),
  account_kind     text not null check (account_kind in ('payable', 'receivable')),
  account_id       uuid not null,
  amount           numeric(12,2) not null check (amount > 0),
  effective_date   date not null,
  payment_method   text,
  reference        text,
  receipt_path     text,
  notes            text,
  created_by       uuid not null references auth.users(id),
  reversed_at      timestamptz,
  reversed_by      uuid references auth.users(id),
  reversal_reason  text,
  created_at       timestamptz not null default now()
);

create index if not exists account_settlements_account_idx on public.account_settlements (account_kind, account_id);

alter table public.account_settlements enable row level security;

create policy "leader_select_account_settlements" on public.account_settlements
  for select to authenticated using (public.is_leader(auth.uid()));
create policy "leader_insert_account_settlements" on public.account_settlements
  for insert to authenticated with check (public.is_leader(auth.uid()));

comment on table public.account_settlements is
  'Liquidação (total ou parcial) de uma conta a pagar/receber. Sempre gravada via função settle_account — nunca INSERT direto do client. reversed_at marca estorno (nunca DELETE, histórico preservado).';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) account_audit_events — trilha de auditoria (modelo app_admin_events)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.account_audit_events (
  id               uuid primary key default gen_random_uuid(),
  account_kind     text not null check (account_kind in ('payable', 'receivable')),
  account_id       uuid not null,
  actor_id         uuid references auth.users(id) on delete set null,
  action           text not null check (action in ('criado', 'editado', 'liquidado', 'estorno_liquidacao', 'cancelado')),
  amount           numeric(12,2),
  previous_status  text,
  new_status       text,
  reason           text,
  created_at       timestamptz not null default now()
);

create index if not exists account_audit_events_account_idx on public.account_audit_events (account_kind, account_id, created_at desc);

alter table public.account_audit_events enable row level security;

-- Só select+insert — sem policy de update/delete, histórico imutável por desenho.
create policy "leader_select_account_audit_events" on public.account_audit_events
  for select to authenticated using (public.is_leader(auth.uid()));
create policy "leader_insert_account_audit_events" on public.account_audit_events
  for insert to authenticated with check (public.is_leader(auth.uid()));

comment on table public.account_audit_events is
  'Trilha de auditoria de accounts_payable/receivable — quem fez o quê, quando, por quê. Insert-only, nunca reescrito.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) settle_account — liquidação total ou parcial, transacional
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.settle_account(
  "p_account_kind"     text,
  "p_account_id"       uuid,
  "p_amount"           numeric,
  "p_effective_date"   date,
  "p_payment_method"   text default null,
  "p_reference"        text default null,
  "p_receipt_path"     text default null,
  "p_notes"            text default null
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  payable_row   public.accounts_payable;
  receivable_row public.accounts_receivable;
  prev_status   text;
  new_status    text;
  new_amount    numeric;
  total_amount  numeric;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode registrar liquidação.';
  end if;
  if p_account_kind not in ('payable', 'receivable') then
    raise exception 'Tipo de conta inválido.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor de liquidação inválido.';
  end if;
  if p_effective_date is null then
    raise exception 'Informe a data efetiva.';
  end if;

  if p_account_kind = 'payable' then
    select * into payable_row from public.accounts_payable where id = p_account_id for update;
    if not found then raise exception 'Conta a pagar não encontrada.'; end if;
    if payable_row.status = 'cancelado' then raise exception 'Não é possível liquidar uma conta cancelada.'; end if;
    if p_amount > (payable_row.amount - payable_row.amount_settled) then
      raise exception 'Valor maior que o saldo em aberto (R$ %).', (payable_row.amount - payable_row.amount_settled);
    end if;

    prev_status  := payable_row.status;
    new_amount   := payable_row.amount_settled + p_amount;
    total_amount := payable_row.amount;
    new_status   := case when new_amount >= total_amount then 'pago' else 'parcial' end;

    update public.accounts_payable
      set amount_settled = new_amount,
          status         = new_status,
          paid_at        = case when new_status = 'pago' then now() else paid_at end,
          paid_by        = case when new_status = 'pago' then auth.uid() else paid_by end,
          updated_by     = auth.uid(),
          updated_at     = now()
      where id = p_account_id
      returning * into payable_row;
  else
    select * into receivable_row from public.accounts_receivable where id = p_account_id for update;
    if not found then raise exception 'Conta a receber não encontrada.'; end if;
    if receivable_row.status = 'cancelado' then raise exception 'Não é possível liquidar uma conta cancelada.'; end if;
    if p_amount > (receivable_row.amount - receivable_row.amount_settled) then
      raise exception 'Valor maior que o saldo em aberto (R$ %).', (receivable_row.amount - receivable_row.amount_settled);
    end if;

    prev_status  := receivable_row.status;
    new_amount   := receivable_row.amount_settled + p_amount;
    total_amount := receivable_row.amount;
    new_status   := case when new_amount >= total_amount then 'recebido' else 'parcial' end;

    update public.accounts_receivable
      set amount_settled = new_amount,
          status         = new_status,
          received_at    = case when new_status = 'recebido' then now() else received_at end,
          received_by    = case when new_status = 'recebido' then auth.uid() else received_by end,
          updated_by     = auth.uid(),
          updated_at     = now()
      where id = p_account_id
      returning * into receivable_row;
  end if;

  insert into public.account_settlements
    (account_kind, account_id, amount, effective_date, payment_method, reference, receipt_path, notes, created_by)
  values
    (p_account_kind, p_account_id, p_amount, p_effective_date, p_payment_method, p_reference, p_receipt_path, p_notes, auth.uid());

  insert into public.account_audit_events
    (account_kind, account_id, actor_id, action, amount, previous_status, new_status)
  values
    (p_account_kind, p_account_id, auth.uid(), 'liquidado', p_amount, prev_status, new_status);

  if p_account_kind = 'payable' then
    return to_jsonb(payable_row);
  else
    return to_jsonb(receivable_row);
  end if;
end;
$$;

revoke execute on function public.settle_account(text, uuid, numeric, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_account(text, uuid, numeric, date, text, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) cancel_account — só permite cancelar obrigação ainda não liquidada
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_account(
  "p_account_kind" text,
  "p_account_id"   uuid,
  "p_reason"       text
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  payable_row    public.accounts_payable;
  receivable_row public.accounts_receivable;
  prev_status    text;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode cancelar lançamento.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  if p_account_kind = 'payable' then
    select * into payable_row from public.accounts_payable where id = p_account_id for update;
    if not found then raise exception 'Conta a pagar não encontrada.'; end if;
    if payable_row.status = 'cancelado' then raise exception 'Conta já está cancelada.'; end if;
    if payable_row.amount_settled > 0 then
      raise exception 'Não é possível cancelar uma conta já liquidada (parcial ou total) — estorne a liquidação primeiro, se aplicável.';
    end if;
    prev_status := payable_row.status;
    update public.accounts_payable
      set status = 'cancelado', notes = coalesce(notes || E'\n', '') || 'Cancelado: ' || p_reason, updated_by = auth.uid(), updated_at = now()
      where id = p_account_id returning * into payable_row;
  elsif p_account_kind = 'receivable' then
    select * into receivable_row from public.accounts_receivable where id = p_account_id for update;
    if not found then raise exception 'Conta a receber não encontrada.'; end if;
    if receivable_row.status = 'cancelado' then raise exception 'Conta já está cancelada.'; end if;
    if receivable_row.amount_settled > 0 then
      raise exception 'Não é possível cancelar uma conta já liquidada (parcial ou total) — estorne a liquidação primeiro, se aplicável.';
    end if;
    prev_status := receivable_row.status;
    update public.accounts_receivable
      set status = 'cancelado', notes = coalesce(notes || E'\n', '') || 'Cancelado: ' || p_reason, updated_by = auth.uid(), updated_at = now()
      where id = p_account_id returning * into receivable_row;
  else
    raise exception 'Tipo de conta inválido.';
  end if;

  insert into public.account_audit_events
    (account_kind, account_id, actor_id, action, previous_status, new_status, reason)
  values
    (p_account_kind, p_account_id, auth.uid(), 'cancelado', prev_status, 'cancelado', p_reason);

  if p_account_kind = 'payable' then
    return to_jsonb(payable_row);
  else
    return to_jsonb(receivable_row);
  end if;
end;
$$;

revoke execute on function public.cancel_account(text, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_account(text, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) reverse_account_settlement — estorna 1 liquidação (nunca chama gateway)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.reverse_account_settlement(
  "p_settlement_id" uuid,
  "p_reason"        text
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  settlement     public.account_settlements;
  payable_row    public.accounts_payable;
  receivable_row public.accounts_receivable;
  prev_status    text;
  new_amount     numeric;
  new_status     text;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode estornar liquidação.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Informe o motivo do estorno.';
  end if;

  select * into settlement from public.account_settlements where id = p_settlement_id for update;
  if not found then raise exception 'Liquidação não encontrada.'; end if;
  if settlement.reversed_at is not null then raise exception 'Esta liquidação já foi estornada.'; end if;

  if settlement.account_kind = 'payable' then
    select * into payable_row from public.accounts_payable where id = settlement.account_id for update;
    if not found then raise exception 'Conta a pagar não encontrada.'; end if;
    prev_status := payable_row.status;
    new_amount  := payable_row.amount_settled - settlement.amount;
    new_status  := case when new_amount <= 0 then 'pendente' else 'parcial' end;
    update public.accounts_payable
      set amount_settled = greatest(new_amount, 0),
          status         = new_status,
          paid_at        = case when new_status <> 'pago' then null else paid_at end,
          updated_by     = auth.uid(), updated_at = now()
      where id = settlement.account_id returning * into payable_row;
  else
    select * into receivable_row from public.accounts_receivable where id = settlement.account_id for update;
    if not found then raise exception 'Conta a receber não encontrada.'; end if;
    prev_status := receivable_row.status;
    new_amount  := receivable_row.amount_settled - settlement.amount;
    new_status  := case when new_amount <= 0 then 'pendente' else 'parcial' end;
    update public.accounts_receivable
      set amount_settled = greatest(new_amount, 0),
          status         = new_status,
          received_at    = case when new_status <> 'recebido' then null else received_at end,
          updated_by     = auth.uid(), updated_at = now()
      where id = settlement.account_id returning * into receivable_row;
  end if;

  update public.account_settlements
    set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = p_reason
    where id = p_settlement_id;

  insert into public.account_audit_events
    (account_kind, account_id, actor_id, action, amount, previous_status, new_status, reason)
  values
    (settlement.account_kind, settlement.account_id, auth.uid(), 'estorno_liquidacao', settlement.amount, prev_status, new_status, p_reason);

  if settlement.account_kind = 'payable' then
    return to_jsonb(payable_row);
  else
    return to_jsonb(receivable_row);
  end if;
end;
$$;

revoke execute on function public.reverse_account_settlement(uuid, text) from public, anon, authenticated;
grant execute on function public.reverse_account_settlement(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) bucket de anexo privado (mesma receita de materials-paid)
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('accounts-attachments', 'accounts-attachments', false)
on conflict (id) do nothing;

drop policy if exists "leader_insert_accounts_attachments" on storage.objects;
create policy "leader_insert_accounts_attachments" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'accounts-attachments' and public.is_leader(auth.uid()));

drop policy if exists "leader_select_accounts_attachments" on storage.objects;
create policy "leader_select_accounts_attachments" on storage.objects for select
  to authenticated
  using (bucket_id = 'accounts-attachments' and public.is_leader(auth.uid()));

drop policy if exists "leader_delete_accounts_attachments" on storage.objects;
create policy "leader_delete_accounts_attachments" on storage.objects for delete
  to authenticated
  using (bucket_id = 'accounts-attachments' and public.is_leader(auth.uid()));
