-- Assinatura recorrente via Stripe Billing (decisão comercial confirmada
-- 2026-09-27: "sim, Stripe Billing", pros dois produtos — app_plans
-- mensal/anual e mensalidade de consultoria/serviço). Etapa 5, peça 5
-- (última) do roadmap (plano em
-- /home/john/.claude/plans/proud-nibbling-sphinx.md) — depende de peça 2
-- (comissão, reaproveitada aqui pra app_plan) e peça 3 (padrão de
-- checkout/webhook já estabelecido).
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) profiles ganha stripe_customer_id — assinatura precisa de um Customer
--    Stripe persistente por usuário (billing/retry/portal dependem disso;
--    checkout avulso de crédito/campanha/app nunca precisou porque eram
--    pagamentos únicos, sem relação continuada com o provedor).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists stripe_customer_id text unique;


-- ─────────────────────────────────────────────────────────────────────────
-- 2) client_projects ganha monthly_fee — não existe NENHUM campo de preço
--    recorrente hoje (só credit_cost, que é pagamento único em créditos).
--    Nullable, só o líder define (mesmo padrão de credit_cost — protegido
--    pela mesma trigger prevent_project_credit_cost_escalation? Não: essa
--    trigger é só pra credit_cost. monthly_fee fica protegido por RLS
--    (client_projects já restringe update de campos sensíveis a técnico),
--    não por uma trigger nova — não inventando mecanismo além do
--    necessário pra um campo nullable que só o admin edita hoje.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.client_projects
  add column if not exists monthly_fee numeric(12,2);

alter table public.client_projects
  add constraint client_projects_monthly_fee_check check (monthly_fee is null or monthly_fee > 0);

-- Achado ao conectar a tela admin: client_projects só tem a policy RLS
-- "technician_update" (QUALQUER técnico atribuído, não só líder) — o
-- comentário que eu ia escrever aqui ("protegido por RLS") estava errado.
-- credit_cost/allow_credit_payment/credit_payment_status já precisaram de
-- uma trigger própria por causa exatamente disso
-- (prevent_project_credit_cost_escalation) — monthly_fee é o mesmo tipo
-- de campo (dinheiro, decisão do líder), então entra na mesma trigger em
-- vez de ganhar uma nova função pra a mesma regra.
create or replace function public.prevent_project_credit_cost_escalation() returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.is_leader(auth.uid())
     and coalesce(current_setting('lobby.allow_credit_payment_status_change', true), 'false') <> 'true' then
    if tg_op = 'INSERT' then
      if new.credit_cost is not null
         or new.allow_credit_payment is true
         or new.credit_payment_status <> 'nao_aplicavel'
         or new.monthly_fee is not null then
        raise exception 'Somente Técnico Líder pode definir pagamento/mensalidade neste projeto.';
      end if;
    else
      if new.credit_cost is distinct from old.credit_cost
         or new.allow_credit_payment is distinct from old.allow_credit_payment
         or new.credit_payment_status is distinct from old.credit_payment_status
         or new.monthly_fee is distinct from old.monthly_fee then
        raise exception 'Somente Técnico Líder pode alterar o pagamento/mensalidade deste projeto.';
      end if;
    end if;
  end if;
  return new;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- 3) financial_transactions ganha a origem 'subscription_invoices'
-- ─────────────────────────────────────────────────────────────────────────

alter table public.financial_transactions
  drop constraint financial_transactions_source_type_check;
alter table public.financial_transactions
  add constraint financial_transactions_source_type_check
  check (source_type is null or source_type = any (array['credit_purchases','ebook_purchases','client_projects','campaign_purchases','app_purchases','subscription_invoices']));


-- ─────────────────────────────────────────────────────────────────────────
-- 4) subscriptions — uma assinatura Stripe (app_plan mensal/anual OU
--    mensalidade de projeto). Duas FKs nullable em vez de um id
--    polimórfico — mesmo padrão de app_admin_events (várias colunas
--    *_id nullable, uma preenchida por vez) — dá integridade referencial
--    real (a linha referenciada precisa existir), o que um id genérico
--    não garante.
--
-- commission_percent é snapshot no momento da assinatura (mesmo princípio
-- de app_purchases/campaign_purchases — nunca recalculado depois, nem se
-- a condição comercial do parceiro mudar no meio do caminho). partner_id
-- só se aplica a product_type='app_plan' de app que não é da LOBBY —
-- mensalidade nunca tem parceiro (é relação direta LOBBY-cliente).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  stripe_subscription_id  text unique,
  product_type            text not null,
  app_plan_id             uuid references public.app_plans(id),
  client_project_id       uuid references public.client_projects(id),
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  partner_id              uuid references public.profiles(id) on delete set null,
  plan_name               text not null,
  amount                  numeric(12,2) not null,
  currency                text not null default 'BRL',
  billing_interval        text not null,
  commission_percent      numeric(5,2) not null default 0,
  status                  text not null default 'incomplete',
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  canceled_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint subscriptions_product_type_check check (product_type = any (array['app_plan', 'mensalidade'])),
  constraint subscriptions_billing_interval_check check (billing_interval = any (array['month', 'year'])),
  -- Enum completo do Stripe (Subscription.Status) — sincronizado 1:1 via
  -- customer.subscription.updated, então precisa aceitar todo valor que o
  -- Stripe realmente manda, não só os que o checkout hoje produz.
  constraint subscriptions_status_check check (status = any (array['incomplete', 'incomplete_expired', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'trialing'])),
  constraint subscriptions_amount_check check (amount > 0),
  constraint subscriptions_product_ref_check check (
    (product_type = 'app_plan'   and app_plan_id is not null       and client_project_id is null)
    or
    (product_type = 'mensalidade' and client_project_id is not null and app_plan_id is null)
  )
);

create index if not exists subscriptions_user_idx    on public.subscriptions (user_id, created_at desc);
create index if not exists subscriptions_partner_idx  on public.subscriptions (partner_id) where partner_id is not null;
create index if not exists subscriptions_status_idx   on public.subscriptions (status);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.update_timestamp();

comment on table public.subscriptions is
  'Assinatura recorrente via Stripe Billing — app_plan (mensal/anual de app de parceiro/LOBBY) ou mensalidade (projeto de cliente). commission_percent é snapshot na criação. status espelha o objeto Subscription do Stripe, sincronizado via webhook (customer.subscription.updated/deleted) — nunca definido do lado de cá além da criação inicial.';

alter table public.subscriptions enable row level security;

grant select on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

create policy "user_select_own_subscriptions" on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy "partner_select_own_app_subscriptions" on public.subscriptions
  for select to authenticated
  using (partner_id = auth.uid());

create policy "leader_select_subscriptions" on public.subscriptions
  for select to authenticated
  using (public.is_leader(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- 5) subscription_invoices — um ciclo de cobrança pago (invoice.paid do
--    Stripe). Cada renovação gera uma linha nova — nunca conta o valor
--    total previsto da assinatura de uma vez (seção 12: "não contar toda
--    a duração prevista como dinheiro recebido"). stripe_invoice_id é a
--    chave de idempotência — redelivery do webhook não duplica.
--
-- financial_transactions.source_id é uuid — não dá pra apontar direto pro
-- id de fatura do Stripe (texto tipo "in_xxx"). Por isso essa tabela
-- intermedia: tem seu próprio uuid, e É esse uuid que vira
-- financial_transactions.source_id (mesmo papel que app_purchases já tem
-- pra checkout avulso).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.subscription_invoices (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid not null references public.subscriptions(id),
  stripe_invoice_id   text not null unique,
  amount              numeric(12,2) not null,
  currency            text not null default 'BRL',
  commission_percent  numeric(5,2) not null default 0,
  commission_amount   numeric(12,2) not null default 0,
  partner_amount      numeric(12,2) not null default 0,
  paid_at             timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  constraint subscription_invoices_amount_check check (amount > 0),
  constraint subscription_invoices_split_check check (commission_amount + partner_amount = amount)
);

create index if not exists subscription_invoices_subscription_idx on public.subscription_invoices (subscription_id, paid_at desc);

comment on table public.subscription_invoices is
  'Um ciclo de cobrança pago de uma assinatura — cada renovação gera uma linha. Financeiro (financial_transactions) usa só commission_amount, nunca o amount bruto — mesmo princípio de app_purchases. partner_amount ainda não entra na fila de repasse (peça 4 só olha app_purchases hoje) — extensão pendente, não coberta aqui.';

alter table public.subscription_invoices enable row level security;

grant select on table public.subscription_invoices to authenticated;
grant all on table public.subscription_invoices to service_role;

create policy "leader_select_subscription_invoices" on public.subscription_invoices
  for select to authenticated
  using (public.is_leader(auth.uid()));

create policy "user_select_own_subscription_invoices" on public.subscription_invoices
  for select to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));

create policy "partner_select_own_subscription_invoices" on public.subscription_invoices
  for select to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id and s.partner_id = auth.uid()));
