-- Checkout próprio de app na LOBBY — pré-requisito de dinheiro real
-- confirmado pelo usuário (decisão: "cria checkout próprio na LOBBY", ver
-- plano em /home/john/.claude/plans/proud-nibbling-sphinx.md, peça 3).
--
-- Achado no caminho: app_plans não tinha NENHUMA policy de SELECT pública
-- — só Admins/Developers(dono)/Team members liam plano/preço. Uma vitrine
-- pública não conseguia nem mostrar o preço sem essa policy nova.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_public_app_plans — planos ativos de um app publicado, pra vitrine
--    pública mostrar preço.
--
-- app_plans não tem policy de SELECT pública (só dono/time/admin), e o
-- caminho até lá passa por app_drafts, que também não tem policy pública
-- nenhuma — um cliente anônimo não teria como ler app_draft_id nem pra
-- montar o filtro. Em vez de abrir RLS de app_plans/app_drafts pra
-- qualquer authenticated (superfície maior que o necessário: exporia
-- limits/activation_instructions/etc via PostgREST direto), uma função
-- SECURITY DEFINER escopada retorna só o que a vitrine precisa — mesmo
-- padrão de get_app_owners/get_submission_checklist_public já usado no
-- projeto pra esse exato problema de visibilidade em cascata.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_public_app_plans(p_application_id uuid)
returns setof public.app_plans
language sql stable security definer
set search_path to 'public'
as $$
  select p.*
  from public.app_plans p
  join public.app_drafts d on d.id = p.app_draft_id
  join public.applications a on a.id = d.application_id
  where a.id = p_application_id
    and a.is_published = true
    and a.suspended_at is null
    and p.status = 'active'
  order by p.display_order, p.price nulls last;
$$;

revoke execute on function public.get_public_app_plans(uuid) from public;
grant execute on function public.get_public_app_plans(uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 1b) get_public_marketplace_apps — lista de apps publicados com preço
--    inicial, numa chamada só (evita N+1 de get_public_app_plans por app
--    numa tela de listagem).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_public_marketplace_apps()
returns table (
  id                       uuid,
  name                     text,
  slug                     text,
  short_description        text,
  logo_url                 text,
  developer_name           text,
  is_lobby_made            boolean,
  category                 text,
  starting_price           numeric,
  starting_price_currency  text
)
language sql stable security definer
set search_path to 'public'
as $$
  select
    a.id, a.name, a.slug, a.short_description, a.logo_url,
    a.developer_name, a.is_lobby_made, a.category,
    min(p.price) filter (where p.billing_period in ('one-time', 'lifetime'))    as starting_price,
    min(p.currency) filter (where p.billing_period in ('one-time', 'lifetime')) as starting_price_currency
  from public.applications a
  left join public.app_drafts d on d.application_id = a.id
  left join public.app_plans p on p.app_draft_id = d.id and p.status = 'active'
  where a.is_published = true and a.suspended_at is null
  group by a.id
  order by a.name;
$$;

revoke execute on function public.get_public_marketplace_apps() from public;
grant execute on function public.get_public_marketplace_apps() to anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 2) financial_transactions ganha o tipo 'app' e a origem 'app_purchases'
--    (constraints já existiam desde 20260712100000/20260927160000 —
--    ALTER pra adicionar valor novo ao enum, não recriar do zero).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.financial_transactions
  drop constraint financial_transactions_type_check;
alter table public.financial_transactions
  add constraint financial_transactions_type_check
  check (type = any (array['ebook','projeto','visita_tecnica','consultoria','mensalidade','creditos','app','outro']));

alter table public.financial_transactions
  drop constraint financial_transactions_source_type_check;
alter table public.financial_transactions
  add constraint financial_transactions_source_type_check
  check (source_type is null or source_type = any (array['credit_purchases','ebook_purchases','client_projects','campaign_purchases','app_purchases']));


-- ─────────────────────────────────────────────────────────────────────────
-- 3) app_purchases — pedido de compra de app, espelha credit_purchases/
--    campaign_purchases (mesmo padrão: status pending→paid via webhook,
--    insert/update só via admin client, sem policy de escrita pra
--    authenticated).
--
-- commission_percent/commission_amount são SNAPSHOT do que
-- get_partner_commission_percent() resolveu no momento da venda — nunca
-- recalculado depois, mesmo princípio de package_terms_snapshot em
-- campaign_purchases (seção 9: "não recalcular vendas antigas com a
-- comissão atual"). partner_id nulo = app da própria LOBBY
-- (applications.is_lobby_made=true) — nesse caso commission_amount=amount
-- inteiro, sem repasse (não existe "parceiro" pra pagar).
--
-- CHECK garante que a divisão sempre soma o valor total: partner_amount é
-- sempre amount - commission_amount calculado por subtração no código
-- (nunca arredondado independente), então a soma nunca diverge por
-- arredondamento.
--
-- financial_transactions (que registra RECEITA PRÓPRIA da LOBBY, não
-- vendas brutas — seção 17: "não chamar vendas brutas de receita
-- própria") usa commission_amount aqui, nunca o amount bruto — o resto é
-- dinheiro do parceiro, rastreado aqui pra alimentar o repasse (peça 4),
-- não é receita da LOBBY.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.app_purchases (
  id                        uuid primary key default gen_random_uuid(),
  application_id            uuid not null references public.applications(id),
  plan_id                   uuid not null references public.app_plans(id),
  -- Snapshot de nome no momento da compra — nem só "cache pra evitar
  -- join": app_plans não tem policy pública nenhuma (só dono/time/admin),
  -- então o comprador não conseguiria ler app_plans.name pelo próprio
  -- RLS mesmo se quisesse. O nome fica gravado aqui, ponto final — reflete
  -- o que foi comprado, não o que o app se chama hoje se for renomeado.
  application_name          text not null,
  plan_name                 text not null,
  buyer_user_id             uuid not null references public.profiles(id) on delete cascade,
  partner_id                uuid references public.profiles(id) on delete set null,
  amount                    numeric(12,2) not null,
  currency                  text not null default 'BRL',
  commission_percent        numeric(5,2) not null default 0,
  commission_amount         numeric(12,2) not null default 0,
  partner_amount            numeric(12,2) not null default 0,
  status                    text not null default 'pending',
  stripe_session_id         text,
  stripe_payment_intent_id  text,
  paid_at                   timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint app_purchases_status_check
    check (status = any (array['pending', 'paid', 'canceled', 'failed', 'refunded'])),
  constraint app_purchases_amount_check check (amount > 0),
  constraint app_purchases_split_check
    check (commission_amount + partner_amount = amount)
);

create unique index if not exists app_purchases_stripe_session_uidx
  on public.app_purchases (stripe_session_id) where stripe_session_id is not null;
create unique index if not exists app_purchases_stripe_pi_uidx
  on public.app_purchases (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists app_purchases_buyer_idx on public.app_purchases (buyer_user_id, created_at desc);
create index if not exists app_purchases_partner_idx on public.app_purchases (partner_id, created_at desc);
create index if not exists app_purchases_application_idx on public.app_purchases (application_id);

create trigger app_purchases_set_updated_at
  before update on public.app_purchases
  for each row execute function public.update_timestamp();

comment on table public.app_purchases is
  'Compra de app de parceiro/LOBBY via checkout próprio (Stripe). commission_percent/commission_amount são snapshot no momento da venda, nunca recalculados. financial_transactions registra só commission_amount como receita própria da LOBBY — partner_amount alimenta o repasse (peça 4 do roadmap), ainda não implementado.';

alter table public.app_purchases enable row level security;

grant select on table public.app_purchases to authenticated;
grant all on table public.app_purchases to service_role;

create policy "buyer_select_own_app_purchases" on public.app_purchases
  for select to authenticated
  using (buyer_user_id = auth.uid());

create policy "partner_select_own_app_purchases" on public.app_purchases
  for select to authenticated
  using (partner_id = auth.uid());

create policy "leader_select_app_purchases" on public.app_purchases
  for select to authenticated
  using (public.is_leader(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- 4) get_my_app_purchase_access — instruções de acesso (link/e-mail de
--    suporte/instruções) de uma compra própria já paga. app_plans e
--    app_activation_config não têm policy pública/de comprador — só dono/
--    time/admin — então o comprador não teria como ler isso direto. A
--    função valida posse (buyer_user_id = auth.uid()) e status='paid'
--    antes de devolver qualquer coisa.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_my_app_purchase_access(p_purchase_id uuid)
returns table (activation_link text, support_email text, instructions jsonb)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_plan_id uuid;
begin
  select plan_id into v_plan_id
  from public.app_purchases
  where id = p_purchase_id and buyer_user_id = auth.uid() and status = 'paid';

  if v_plan_id is null then
    raise exception 'Compra não encontrada ou não confirmada.';
  end if;

  return query
  select c.activation_link, c.support_email, c.instructions
  from public.app_plans p
  join public.app_activation_config c on c.app_draft_id = p.app_draft_id
  where p.id = v_plan_id;
end;
$$;

revoke execute on function public.get_my_app_purchase_access(uuid) from public;
grant execute on function public.get_my_app_purchase_access(uuid) to authenticated;
