-- Sistema de créditos: carteira por cliente, pacotes vendáveis, ledger de
-- movimentações e compras de pacote. Mesma filosofia dos e-books pagos —
-- sem gateway real (lib/stripe.ts é só um stub), então compra de pacote
-- fica "pending" até o Técnico Líder confirmar manualmente em
-- /admin/financeiro, e SÓ nesse momento os créditos entram na carteira.
--
-- Diferente das outras features pagas desta sessão: aqui as mutações de
-- saldo são concentradas em funções SECURITY DEFINER (spend_credits,
-- add_credits, confirm_credit_purchase, admin_adjust_credits,
-- redeem_credits_for_ebook, redeem_credits_for_project) em vez de só RLS —
-- débito de crédito precisa ser atômico (não permitir saldo negativo sob
-- concorrência) e RLS sozinho não faz "UPDATE condicional + INSERT em
-- outra tabela" numa única operação. As tabelas em si não têm NENHUMA
-- policy de insert/update pro cliente comum — todo write passa pelas
-- funções, que rodam com privilégio de dono e fazem a própria checagem de
-- autorização (auth.uid() / is_leader).

create or replace function public.is_leader(p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'technician' and is_leader = true
  );
$$;

-- ── Tabelas ──────────────────────────────────────────────────────────

create table if not exists public.credit_packages (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  credits_amount integer not null check (credits_amount > 0),
  price          numeric(12,2) not null check (price > 0),
  currency       text not null default 'BRL',
  is_active      boolean not null default true,
  is_featured    boolean not null default false,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.client_credit_wallets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.profiles(id) on delete cascade,
  balance         integer not null default 0 check (balance >= 0),
  total_purchased integer not null default 0,
  total_spent     integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id             uuid primary key default gen_random_uuid(),
  wallet_id      uuid not null references public.client_credit_wallets(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  type           text not null check (type in ('purchase','ebook_purchase','project_payment','technical_visit','manual_adjustment','refund','bonus','expiration')),
  amount         integer not null check (amount > 0),
  direction      text not null check (direction in ('credit','debit')),
  balance_after  integer not null,
  description    text not null,
  status         text not null default 'completed' check (status in ('pending','completed','canceled','failed','refunded')),
  reference_type text,
  reference_id   uuid,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create table if not exists public.credit_purchases (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  package_id         uuid not null references public.credit_packages(id),
  credits_amount     integer not null check (credits_amount > 0),
  amount_paid        numeric(12,2) not null check (amount_paid > 0),
  currency           text not null default 'BRL',
  status             text not null default 'pending' check (status in ('pending','paid','canceled','failed','refunded')),
  payment_provider   text,
  payment_reference  text,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists credit_transactions_user_idx      on public.credit_transactions (user_id, created_at desc);
create index if not exists credit_transactions_wallet_idx    on public.credit_transactions (wallet_id);
create index if not exists credit_purchases_user_idx         on public.credit_purchases (user_id, created_at desc);
create index if not exists credit_purchases_status_idx       on public.credit_purchases (status);

alter table public.credit_packages       enable row level security;
alter table public.client_credit_wallets enable row level security;
alter table public.credit_transactions   enable row level security;
alter table public.credit_purchases      enable row level security;

-- credit_packages: todo autenticado vê os ativos; líder vê e gerencia tudo.
drop policy if exists "read_active_packages" on public.credit_packages;
create policy "read_active_packages" on public.credit_packages for select
  to authenticated using (is_active = true);

drop policy if exists "leader_manage_packages" on public.credit_packages;
create policy "leader_manage_packages" on public.credit_packages for all
  to authenticated
  using (public.is_leader(auth.uid()))
  with check (public.is_leader(auth.uid()));

-- client_credit_wallets: só leitura da própria carteira (ou todas, se
-- líder) — NENHUMA policy de write; saldo só muda via função.
drop policy if exists "read_own_wallet" on public.client_credit_wallets;
create policy "read_own_wallet" on public.client_credit_wallets for select
  to authenticated using (user_id = auth.uid() or public.is_leader(auth.uid()));

-- credit_transactions: só leitura do próprio histórico (ou todos, se
-- líder) — NENHUMA policy de write; ledger só é escrito pelas funções.
drop policy if exists "read_own_transactions" on public.credit_transactions;
create policy "read_own_transactions" on public.credit_transactions for select
  to authenticated using (user_id = auth.uid() or public.is_leader(auth.uid()));

-- credit_purchases: cliente cria e lê as próprias (só como 'pending' —
-- confirmar como paga é privilégio da função confirm_credit_purchase,
-- que roda com auth.uid() do líder e ignora RLS); líder lê todas.
drop policy if exists "read_own_purchases" on public.credit_purchases;
create policy "read_own_purchases" on public.credit_purchases for select
  to authenticated using (user_id = auth.uid() or public.is_leader(auth.uid()));

drop policy if exists "client_insert_own_purchase" on public.credit_purchases;
create policy "client_insert_own_purchase" on public.credit_purchases for insert
  to authenticated with check (user_id = auth.uid() and status = 'pending');

-- ── Funções ──────────────────────────────────────────────────────────

create or replace function public.get_or_create_wallet(p_user_id uuid)
returns public.client_credit_wallets
language plpgsql
security definer set search_path = public
as $$
declare
  w public.client_credit_wallets;
begin
  select * into w from public.client_credit_wallets where user_id = p_user_id;
  if not found then
    insert into public.client_credit_wallets (user_id) values (p_user_id)
    on conflict (user_id) do update set user_id = excluded.user_id
    returning * into w;
  end if;
  return w;
end;
$$;

-- Débito atômico na PRÓPRIA carteira (auth.uid()) — o UPDATE condicional
-- (balance >= p_amount) é o que garante que nunca fica negativo mesmo sob
-- duas chamadas concorrentes; se a linha não bater a condição, "not found"
-- vira exceção, nada é debitado nem lançado no ledger.
create or replace function public.spend_credits(
  p_amount integer,
  p_type text,
  p_description text,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns public.credit_transactions
language plpgsql
security definer set search_path = public
as $$
declare
  w  public.client_credit_wallets;
  tx public.credit_transactions;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Quantidade de créditos inválida.';
  end if;

  perform public.get_or_create_wallet(auth.uid());

  update public.client_credit_wallets
    set balance = balance - p_amount,
        total_spent = total_spent + p_amount,
        updated_at = now()
    where user_id = auth.uid() and balance >= p_amount
    returning * into w;

  if not found then
    raise exception 'Saldo de créditos insuficiente.';
  end if;

  insert into public.credit_transactions
    (wallet_id, user_id, type, amount, direction, balance_after, description, status, reference_type, reference_id, created_by)
  values
    (w.id, auth.uid(), p_type, p_amount, 'debit', w.balance, p_description, 'completed', p_reference_type, p_reference_id, auth.uid())
  returning * into tx;

  return tx;
end;
$$;

-- Crédito atômico — nunca chamada direto pelo cliente (grant não é
-- concedido a authenticated), só usada de dentro de confirm_credit_purchase
-- e admin_adjust_credits, ambas já leader-gated.
create or replace function public.add_credits(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_created_by uuid default null
) returns public.credit_transactions
language plpgsql
security definer set search_path = public
as $$
declare
  w  public.client_credit_wallets;
  tx public.credit_transactions;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Quantidade de créditos inválida.';
  end if;

  perform public.get_or_create_wallet(p_user_id);

  update public.client_credit_wallets
    set balance = balance + p_amount,
        total_purchased = case when p_type = 'purchase' then total_purchased + p_amount else total_purchased end,
        updated_at = now()
    where user_id = p_user_id
    returning * into w;

  insert into public.credit_transactions
    (wallet_id, user_id, type, amount, direction, balance_after, description, status, reference_type, reference_id, created_by)
  values
    (w.id, p_user_id, p_type, p_amount, 'credit', w.balance, p_description, 'completed', p_reference_type, p_reference_id, p_created_by)
  returning * into tx;

  return tx;
end;
$$;
revoke execute on function public.add_credits(uuid, integer, text, text, text, uuid, uuid) from authenticated, anon;

-- Confirma pagamento de um pacote de créditos (líder) — atômico: marca a
-- compra como paga, credita a carteira e lança a entrada correspondente
-- em financial_transactions, tudo ou nada.
create or replace function public.confirm_credit_purchase(p_purchase_id uuid)
returns public.credit_purchases
language plpgsql
security definer set search_path = public
as $$
declare
  purchase   public.credit_purchases;
  buyer_name text;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode confirmar pagamento de créditos.';
  end if;

  select * into purchase from public.credit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  if purchase.status <> 'pending' then
    raise exception 'Esta compra já foi processada.';
  end if;

  update public.credit_purchases
    set status = 'paid', paid_at = now(), updated_at = now()
    where id = p_purchase_id
    returning * into purchase;

  perform public.add_credits(
    purchase.user_id, purchase.credits_amount, 'purchase',
    'Compra de créditos confirmada', 'credit_purchases', purchase.id, auth.uid()
  );

  select full_name into buyer_name from public.profiles where id = purchase.user_id;

  insert into public.financial_transactions
    (type, client_id, client_name, description, amount, status, sale_date, received_date, responsible_user_id)
  values
    ('creditos', purchase.user_id, buyer_name,
     'Venda de créditos — ' || purchase.credits_amount || ' créditos',
     purchase.amount_paid, 'pago', current_date, current_date, auth.uid());

  return purchase;
end;
$$;

create or replace function public.cancel_credit_purchase(p_purchase_id uuid)
returns public.credit_purchases
language plpgsql
security definer set search_path = public
as $$
declare
  purchase public.credit_purchases;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode cancelar compras de créditos.';
  end if;

  update public.credit_purchases
    set status = 'canceled', updated_at = now()
    where id = p_purchase_id and status = 'pending'
    returning * into purchase;

  if not found then
    raise exception 'Compra não encontrada ou já processada.';
  end if;

  return purchase;
end;
$$;

-- Ajuste manual de crédito (líder) — justificativa obrigatória, nunca
-- deixa saldo negativo no caso de débito.
create or replace function public.admin_adjust_credits(
  p_user_id uuid,
  p_amount integer,
  p_direction text,
  p_reason text
) returns public.credit_transactions
language plpgsql
security definer set search_path = public
as $$
declare
  w  public.client_credit_wallets;
  tx public.credit_transactions;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode ajustar créditos manualmente.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Quantidade inválida.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Justificativa obrigatória para ajuste manual.';
  end if;

  if p_direction = 'credit' then
    tx := public.add_credits(p_user_id, p_amount, 'manual_adjustment', p_reason, null, null, auth.uid());
  elsif p_direction = 'debit' then
    perform public.get_or_create_wallet(p_user_id);
    update public.client_credit_wallets
      set balance = balance - p_amount, total_spent = total_spent + p_amount, updated_at = now()
      where user_id = p_user_id and balance >= p_amount
      returning * into w;
    if not found then
      raise exception 'Saldo insuficiente para este ajuste de débito.';
    end if;
    insert into public.credit_transactions
      (wallet_id, user_id, type, amount, direction, balance_after, description, status, created_by)
    values
      (w.id, p_user_id, 'manual_adjustment', p_amount, 'debit', w.balance, p_reason, 'completed', auth.uid())
    returning * into tx;
  else
    raise exception 'Direção inválida.';
  end if;

  return tx;
end;
$$;

-- Resgate de créditos por e-book pago — débito + liberação de download
-- na mesma transação (se uma falhar, a outra desfaz junto).
create or replace function public.redeem_credits_for_ebook(p_ebook_id uuid)
returns public.ebook_purchases
language plpgsql
security definer set search_path = public
as $$
declare
  ebook    public.resource_metadata;
  purchase public.ebook_purchases;
begin
  select * into ebook from public.resource_metadata where id = p_ebook_id;
  if not found or ebook.is_paid is not true then
    raise exception 'E-book não encontrado ou não é pago.';
  end if;
  if ebook.credit_price is null then
    raise exception 'Este e-book não pode ser comprado com créditos.';
  end if;
  if exists (
    select 1 from public.ebook_purchases
    where ebook_id = p_ebook_id and user_id = auth.uid() and status = 'paid'
  ) then
    raise exception 'Você já possui este e-book.';
  end if;

  perform public.spend_credits(
    ebook.credit_price, 'ebook_purchase',
    'Compra do e-book "' || ebook.title || '" com créditos',
    'resource_metadata', p_ebook_id
  );

  insert into public.ebook_purchases (ebook_id, user_id, amount, currency, status, payment_provider, paid_at)
  values (p_ebook_id, auth.uid(), ebook.credit_price, 'CREDITS', 'paid', 'credits', now())
  returning * into purchase;

  return purchase;
end;
$$;

-- Resgate de créditos por projeto — débito + marca o pagamento do
-- projeto como quitado via créditos. Não lança em financial_transactions
-- de propósito: a receita em R$ já foi contabilizada quando o cliente
-- comprou os créditos (confirm_credit_purchase); lançar de novo aqui
-- duplicaria a receita.
create or replace function public.redeem_credits_for_project(p_project_id uuid)
returns public.client_projects
language plpgsql
security definer set search_path = public
as $$
declare
  proj public.client_projects;
begin
  select * into proj from public.client_projects
    where id = p_project_id and client_id = auth.uid();
  if not found then
    raise exception 'Projeto não encontrado.';
  end if;
  if proj.allow_credit_payment is not true or proj.credit_cost is null then
    raise exception 'Este projeto não aceita pagamento com créditos.';
  end if;
  if proj.credit_payment_status = 'pago' then
    raise exception 'Este projeto já foi pago com créditos.';
  end if;

  perform public.spend_credits(
    proj.credit_cost, 'project_payment',
    'Pagamento do projeto "' || proj.title || '" com créditos',
    'client_projects', p_project_id
  );

  update public.client_projects
    set credit_payment_status = 'pago', updated_at = now()
    where id = p_project_id
    returning * into proj;

  return proj;
end;
$$;

-- ── Integração com e-books e projetos ──────────────────────────────

alter table public.resource_metadata
  add column if not exists credit_price integer check (credit_price is null or credit_price > 0);

alter table public.client_projects
  add column if not exists credit_cost           integer check (credit_cost is null or credit_cost > 0),
  add column if not exists allow_credit_payment   boolean not null default false,
  add column if not exists credit_payment_status  text not null default 'nao_aplicavel'
    check (credit_payment_status in ('nao_aplicavel', 'pendente', 'pago'));

-- credit_cost/allow_credit_payment de um projeto são financeiros — mesmo
-- critério leader-only já usado em resource_metadata.price e
-- lobby_projects.price (trigger, não RLS, porque as outras colunas de
-- client_projects continuam editáveis por qualquer técnico da equipe via
-- technician_update).
create or replace function public.prevent_project_credit_cost_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_leader(auth.uid()) then
    if new.credit_cost is distinct from old.credit_cost
       or new.allow_credit_payment is distinct from old.allow_credit_payment then
      raise exception 'Somente Técnico Líder pode definir pagamento com créditos neste projeto.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists client_projects_prevent_credit_cost_escalation on public.client_projects;
create trigger client_projects_prevent_credit_cost_escalation
  before update on public.client_projects
  for each row execute function public.prevent_project_credit_cost_escalation();

-- financial_transactions.type precisa aceitar 'creditos' (venda de pacote).
alter table public.financial_transactions drop constraint if exists financial_transactions_type_check;
alter table public.financial_transactions add constraint financial_transactions_type_check
  check (type in ('ebook', 'projeto', 'visita_tecnica', 'consultoria', 'mensalidade', 'creditos', 'outro'));
