-- Histórico de conciliação Stripe × registros locais — item sinalizado na
-- spec de aprimoramento da tela /admin/financeiro/conciliacao. Até aqui a
-- conciliação era 100% efêmera (calculada e descartada a cada clique,
-- decisão original do usuário). Mantém o caráter "só diagnóstico, nunca
-- side-effect" — estas duas tabelas só recebem INSERT (nunca UPDATE), então
-- toda execução salva é um retrato imutável do que foi observado naquele
-- momento; "Executar novamente" sempre cria uma run nova.
--
-- reconciliation_runs   — cabeçalho de uma execução (quem, quando, período,
--                          filtros, estado final, contadores agregados).
-- reconciliation_items  — uma linha por item checado (não só divergência,
--                          pra "Correspondente" também ser filtrável sem
--                          duplicar lógica de contagem em memória).
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual, mesma disciplina das migrations anteriores.

create table if not exists public.reconciliation_runs (
  id                      uuid primary key default gen_random_uuid(),
  requested_by            uuid not null references public.profiles(id),
  provider                text not null default 'stripe',
  environment             text not null check (environment in ('test', 'live')),
  period_start            date not null,
  period_end              date not null,
  timezone                text not null default 'America/Sao_Paulo',
  operation_types         text[] not null,
  comparison_rule_version text not null default 'v1',
  status                  text not null default 'em_processamento'
                            check (status in ('em_processamento', 'concluido', 'concluido_parcialmente', 'falhou')),
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  checked_count           integer not null default 0,
  matched_count           integer not null default 0,
  divergence_count        integer not null default 0,
  no_local_match_count    integer not null default 0,
  no_provider_match_count integer not null default 0,
  not_verifiable_count    integer not null default 0,
  currency_summary        jsonb not null default '[]',
  coverage                jsonb not null default '{}',
  limitations             jsonb not null default '[]',
  error_message           text,
  created_at              timestamptz not null default now()
);

create table if not exists public.reconciliation_items (
  id                        uuid primary key default gen_random_uuid(),
  run_id                    uuid not null references public.reconciliation_runs(id) on delete cascade,
  result_type               text not null check (result_type in (
                              'correspondente', 'diferenca_valor', 'diferenca_moeda', 'diferenca_status',
                              'sem_registro_local', 'sem_correspondencia_provedor', 'possivel_duplicidade', 'nao_verificavel'
                            )),
  operation_type            text check (operation_type in ('creditos', 'apps', 'destaques', 'assinaturas')),
  stripe_charge_id          text,
  stripe_payment_intent_id  text,
  provider_amount           numeric(12,2),
  provider_currency         text,
  provider_created_at       timestamptz,
  local_table               text,
  local_id                  uuid,
  local_amount              numeric(12,2),
  local_currency            text,
  local_status              text,
  local_refunded_amount     numeric(12,2),
  local_created_at          timestamptz,
  note                      text,
  created_at                timestamptz not null default now()
);

create index if not exists reconciliation_items_run_idx       on public.reconciliation_items (run_id, provider_created_at desc);
create index if not exists reconciliation_items_result_idx    on public.reconciliation_items (run_id, result_type);
create index if not exists reconciliation_items_operation_idx on public.reconciliation_items (run_id, operation_type);
create index if not exists reconciliation_items_local_idx     on public.reconciliation_items (local_table, local_id);
create index if not exists reconciliation_runs_started_idx    on public.reconciliation_runs (started_at desc);

alter table public.reconciliation_runs  enable row level security;
alter table public.reconciliation_items enable row level security;

-- Financeiro sensível — só líder, mesmo padrão de accounts_payable/
-- financial_transactions. Só select+insert: não há fluxo de update/delete
-- (histórico é imutável por desenho, não por policy ausente por acidente).
create policy "leader_select_reconciliation_runs" on public.reconciliation_runs
  for select to authenticated using (public.is_leader(auth.uid()));
create policy "leader_insert_reconciliation_runs" on public.reconciliation_runs
  for insert to authenticated with check (public.is_leader(auth.uid()));

create policy "leader_select_reconciliation_items" on public.reconciliation_items
  for select to authenticated using (public.is_leader(auth.uid()));
create policy "leader_insert_reconciliation_items" on public.reconciliation_items
  for insert to authenticated with check (public.is_leader(auth.uid()));

comment on table public.reconciliation_runs is
  'Cabeçalho de uma execução de conciliação Stripe × registros locais. Só INSERT (nunca UPDATE) — cada run é um retrato imutável do que foi observado no momento em que rodou.';
comment on table public.reconciliation_items is
  'Um item checado por execução de conciliação (correspondente ou não) — result_type cobre as 8 categorias da tela; operation_type só cobre os 4 tipos de operação realmente casáveis via Stripe (créditos/apps/destaques/assinaturas — e-books não têm identificador Stripe, ficam de fora).';
