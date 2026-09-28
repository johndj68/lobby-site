-- Contas a pagar/receber — item sinalizado no diagnóstico original, nunca
-- construído. Decisão do usuário: unifica numa tela só — lançamentos
-- manuais novos (despesas/recebíveis fora do fluxo automático) JUNTO com
-- o que já existe espalhado (repasse pendente a parceiro, cobrança
-- pendente de crédito/e-book). Não duplica dado: a tela lê
-- partner_payouts/credit_purchases/ebook_purchases direto, só as duas
-- tabelas abaixo são gravação nova.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra
-- revisão e `supabase db push` manual.

create table if not exists public.accounts_payable (
  id          uuid primary key default gen_random_uuid(),
  description text not null,
  amount      numeric(12,2) not null check (amount > 0),
  category    text,
  due_date    date,
  status      text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado')),
  paid_at     timestamptz,
  paid_by     uuid references auth.users(id) on delete set null,
  notes       text,
  created_by  uuid not null references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.accounts_receivable (
  id          uuid primary key default gen_random_uuid(),
  description text not null,
  amount      numeric(12,2) not null check (amount > 0),
  payer_name  text,
  due_date    date,
  status      text not null default 'pendente' check (status in ('pendente', 'recebido', 'cancelado')),
  received_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  notes       text,
  created_by  uuid not null references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists accounts_payable_status_idx on public.accounts_payable (status, due_date);
create index if not exists accounts_receivable_status_idx on public.accounts_receivable (status, due_date);

create trigger accounts_payable_set_updated_at
  before update on public.accounts_payable
  for each row execute function public.update_timestamp();

create trigger accounts_receivable_set_updated_at
  before update on public.accounts_receivable
  for each row execute function public.update_timestamp();

alter table public.accounts_payable enable row level security;
alter table public.accounts_receivable enable row level security;

-- Financeiro sensível — só líder, todas as operações (mesmo padrão de
-- financial_transactions: nenhuma policy pra cliente/técnico comum/
-- anônimo, RLS nega por padrão).
create policy "leader_all_accounts_payable" on public.accounts_payable
  for all to authenticated
  using (public.is_leader(auth.uid()))
  with check (public.is_leader(auth.uid()));

create policy "leader_all_accounts_receivable" on public.accounts_receivable
  for all to authenticated
  using (public.is_leader(auth.uid()))
  with check (public.is_leader(auth.uid()));

comment on table public.accounts_payable is
  'Lançamento manual de despesa (fornecedor, imposto, etc) — fora do fluxo automático de repasse a parceiro (partner_payouts), que já cobre "o que a LOBBY deve pagar" pra vendas via checkout próprio. Tela unificada de contas mostra os dois juntos sem duplicar dado.';

comment on table public.accounts_receivable is
  'Lançamento manual de recebível (contrato de projeto, etc) — fora do fluxo automático de cobrança já rastreado em credit_purchases/ebook_purchases pendentes. Tela unificada de contas mostra os dois juntos sem duplicar dado.';
