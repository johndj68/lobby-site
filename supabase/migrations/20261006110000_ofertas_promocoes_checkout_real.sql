-- Reforma de "Ofertas e promoções" do parceiro + aplicação REAL do desconto
-- no checkout (compra única e assinatura). Hoje `promotions` é só decorativo
-- — nenhuma rota de checkout lê essa tabela, o preço cobrado é sempre
-- app_plans.price bruto (confirmado por leitura de
-- app/api/apps/[appId]/checkout/route.ts e
-- app/api/subscriptions/checkout/route.ts). Esta migration fecha essa
-- lacuna sem criar livro de preço paralelo — só estende o que já existe.
--
-- Desconto em assinatura usa Stripe Coupon (amount_off + duration), não
-- recálculo manual: subscription_invoices.amount já vem direto de
-- invoice.amount_paid do Stripe (app/api/stripe/webhook/route.ts:668),
-- então a Stripe aplicando o coupon já basta — nenhuma lógica nova de
-- proration aqui.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) promotions: duração do benefício em assinatura + cache do coupon
-- ─────────────────────────────────────────────────────────────────────────

alter table public.promotions
  add column if not exists discount_duration_type text
    check (discount_duration_type in ('primeira_cobranca', 'ciclos_fixos')),
  add column if not exists discount_cycles integer
    check (discount_cycles is null or discount_cycles > 0),
  add column if not exists stripe_coupon_id text;

do $$ begin
  alter table public.promotions add constraint promotions_cycles_requires_type
    check (discount_duration_type = 'ciclos_fixos' or discount_cycles is null);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.promotions add constraint promotions_ciclos_fixos_requires_cycles
    check (discount_duration_type is distinct from 'ciclos_fixos' or discount_cycles is not null);
exception when duplicate_object then null; end $$;

comment on column public.promotions.discount_duration_type is
  'Só relevante para plano monthly/yearly (seção 9): primeira_cobranca = desconto só na 1ª fatura (Stripe coupon duration=once); ciclos_fixos = desconto nos N primeiros ciclos (duration=repeating). Null/ignorado para one-time/lifetime, onde o desconto é só o preço final da venda única.';
comment on column public.promotions.stripe_coupon_id is
  'Cache do Stripe Coupon criado pra esta promoção (assinatura only) — criado e gravado só pelo checkout server-side (admin client), nunca pelo parceiro. Reusado em checkouts seguintes da mesma promoção pra não proliferar coupons.';

-- partner nunca pode setar stripe_coupon_id na criação (só nosso server,
-- via client admin, grava depois) — mesma filosofia de
-- 20261003120000_promocoes_insert_check_hardening.sql.
drop policy if exists "owner_insert_own_promotions" on public.promotions;

create policy "owner_insert_own_promotions" on public.promotions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and is_approved = false
    and is_active = false
    and rejected_at is null
    and rejected_by is null
    and rejection_reason is null
    and internal_note is null
    and cancelled_at is null
    and paused_at is null
    and stripe_coupon_id is null
    and original_price = (select p.price from public.app_plans p where p.id = plan_id)
    and promo_price < (select p.price from public.app_plans p where p.id = plan_id)
    and application_id = (
      select d.application_id
      from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id
    )
    and exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  );

-- promotions.updated_at nunca foi mantido por trigger (default now() só na
-- criação) — toda transição (aprovar/rejeitar/pausar/cancelar/reativar)
-- ficava com updated_at == created_at pra sempre. "Ordenação: atualizadas
-- recentemente" (seção 5) depende disso de verdade — reaproveita a mesma
-- função genérica já usada em app_plans (20260914000000_create_update_timestamp_function.sql).
drop trigger if exists set_promotions_updated_at on public.promotions;
create trigger set_promotions_updated_at
  before update on public.promotions
  for each row execute function update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Cancelamento pelo próprio parceiro (pendente/programada) — hoje só
--    admin pode (role=technician). Trigger garante que uma transição de
--    cancelamento só mexe em cancelled_at/cancelled_by/is_active, nunca
--    nos campos comerciais — vale pra QUALQUER caminho de update (admin
--    E parceiro), fecha o mesmo vetor de fraude já documentado em
--    20261003120000 (um client malicioso tentando "cancelar" e trocar
--    promo_price na mesma chamada).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_promotion_cancel_only_fields()
returns trigger
language plpgsql
as $$
begin
  if old.cancelled_at is null and new.cancelled_at is not null then
    if new.promo_price            is distinct from old.promo_price
       or new.original_price      is distinct from old.original_price
       or new.discount_percentage is distinct from old.discount_percentage
       or new.starts_at           is distinct from old.starts_at
       or new.ends_at             is distinct from old.ends_at
       or new.plan_id             is distinct from old.plan_id
       or new.application_id      is distinct from old.application_id
       or new.discount_duration_type is distinct from old.discount_duration_type
       or new.discount_cycles     is distinct from old.discount_cycles
       or new.is_approved         is distinct from old.is_approved
       or new.created_by          is distinct from old.created_by
    then
      raise exception 'Cancelamento só pode alterar cancelled_at/cancelled_by/is_active.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_promotion_cancel_only_fields on public.promotions;
create trigger trg_promotion_cancel_only_fields
  before update on public.promotions
  for each row execute function public.enforce_promotion_cancel_only_fields();

drop policy if exists "owner_cancel_own_pending_or_scheduled_promotion" on public.promotions;

create policy "owner_cancel_own_pending_or_scheduled_promotion" on public.promotions
  for update to authenticated
  using (
    cancelled_at is null
    and (
      is_approved = false
      or (is_approved = true and starts_at > now())
    )
    and exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  )
  with check (
    cancelled_at is not null
    and cancelled_by = auth.uid()
    and is_active = false
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3) app_purchases.promotion_id — a linha nasce pré-criada na própria rota
--    de checkout (status 'pending'), então é gravado direto no insert,
--    sem passar por webhook/metadata.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.app_purchases
  add column if not exists promotion_id uuid references public.promotions(id) on delete set null;

comment on column public.app_purchases.promotion_id is
  'Promoção aplicada nesta venda, se houver — gravada no momento do checkout (nunca retroativa). Null = preço cheio.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) subscriptions: snapshot do benefício concedido. A linha só nasce no
--    webhook (handleSubscriptionCheckoutCompleted), a partir de metadata
--    da Checkout Session — por isso estas colunas vêm via metadata, não
--    direto de uma FK resolvida no servidor de checkout.
--    "Nunca retirar retroativamente o benefício adquirido" (seção 9): o
--    coupon já fica anexado à Subscription na Stripe no momento da
--    criação; estas colunas são só espelho local pra exibição/auditoria,
--    cancelar/editar a promoção depois NUNCA as altera (sem trigger de
--    propagação nenhum — ausência deliberada).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.subscriptions
  add column if not exists promotion_id uuid references public.promotions(id) on delete set null,
  add column if not exists promo_discount_type text
    check (promo_discount_type in ('primeira_cobranca', 'ciclos_fixos')),
  add column if not exists promo_discount_cycles integer,
  add column if not exists promo_amount_off numeric(10,2);

comment on column public.subscriptions.promo_amount_off is
  'Valor (não percentual) descontado por fatura durante o benefício, snapshot no momento da assinatura — mesma moeda da assinatura. Nunca recalculado depois.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) get_partner_ofertas_plans — ganha application_id e category_id (pra
--    resolver comissão estimada no preview do formulário e pra "duplicar
--    como rascunho" saber o app de origem). Mesma assinatura, troca o
--    retorno → precisa DROP antes do CREATE (mesmo motivo já documentado
--    em 20260930120000/20261004100000).
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_ofertas_plans(uuid);

create function public.get_partner_ofertas_plans(p_partner_id uuid default null)
returns table (
  id              uuid,
  app_draft_id    uuid,
  application_id  uuid,
  category_id     uuid,
  app_name        text,
  plan_name       text,
  price           numeric(10,2),
  currency        text,
  billing_period  text,
  plan_status     text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_ofertas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver as ofertas deste parceiro.';
    end if;
  end if;

  return query
  select p.id, p.app_draft_id, d.application_id, a.category_id,
         d.name as app_name, p.name as plan_name, p.price, p.currency, p.billing_period, p.status
  from public.app_plans p
  join public.app_drafts d on d.id = p.app_draft_id
  left join public.applications a on a.id = d.application_id
  where d.created_by = v_partner_id;
end;
$$;

revoke execute on function public.get_partner_ofertas_plans(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_ofertas_plans(uuid) to authenticated;

comment on function public.get_partner_ofertas_plans(uuid) is
  'Planos (app_plans) do parceiro, com application_id/category_id pra resolver comissão estimada e duplicar promoção. Mesma checagem de permissão de sempre.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5b) get_partner_ofertas_promotions — ganha updated_at (pra ordenação
--     "atualizadas recentemente") e discount_duration_type/discount_cycles
--     (exibição da duração do benefício em assinatura, seção 9/6).
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_ofertas_promotions(uuid);

create function public.get_partner_ofertas_promotions(p_partner_id uuid default null)
returns table (
  id                      uuid,
  plan_id                 uuid,
  name                    text,
  promo_price             numeric(10,2),
  original_price          numeric(10,2),
  discount_percentage     integer,
  discount_duration_type  text,
  discount_cycles         integer,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  is_approved             boolean,
  is_active               boolean,
  cancelled_at            timestamptz,
  paused_at               timestamptz,
  rejected_at             timestamptz,
  rejection_reason        text,
  created_at              timestamptz,
  updated_at              timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_ofertas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver as ofertas deste parceiro.';
    end if;
  end if;

  return query
  select pr.id, pr.plan_id, pr.name, pr.promo_price, pr.original_price, pr.discount_percentage,
         pr.discount_duration_type, pr.discount_cycles,
         pr.starts_at, pr.ends_at, pr.is_approved, pr.is_active, pr.cancelled_at,
         pr.paused_at, pr.rejected_at, pr.rejection_reason, pr.created_at, pr.updated_at
  from public.promotions pr
  join public.app_plans p on p.id = pr.plan_id
  join public.app_drafts d on d.id = p.app_draft_id
  where d.created_by = v_partner_id
  order by pr.created_at desc;
end;
$$;

revoke execute on function public.get_partner_ofertas_promotions(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_ofertas_promotions(uuid) to authenticated;

comment on function public.get_partner_ofertas_promotions(uuid) is
  'Pedidos/promoções (promotions) do parceiro, por plano — mesma checagem de permissão de get_partner_ofertas_plans. updated_at pra ordenação "atualizadas recentemente".';

-- ─────────────────────────────────────────────────────────────────────────
-- 6) get_partner_promotion_detail — resumo + análise de UMA promoção.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_promotion_detail(uuid, uuid);

create or replace function public.get_partner_promotion_detail(p_promotion_id uuid, p_partner_id uuid default null)
returns table (
  id                     uuid,
  plan_id                uuid,
  application_id         uuid,
  name                   text,
  app_name               text,
  plan_name              text,
  currency               text,
  billing_period         text,
  promo_price            numeric(10,2),
  original_price         numeric(10,2),
  discount_percentage    integer,
  discount_duration_type text,
  discount_cycles        integer,
  unit_limit             integer,
  eligible_for_daily_deals boolean,
  timezone               text,
  starts_at              timestamptz,
  ends_at                timestamptz,
  is_approved            boolean,
  is_active              boolean,
  cancelled_at           timestamptz,
  paused_at              timestamptz,
  rejected_at            timestamptz,
  rejection_reason       text,
  created_at             timestamptz,
  created_by             uuid
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_ofertas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver as ofertas deste parceiro.';
    end if;
  end if;

  return query
  select pr.id, pr.plan_id, pr.application_id, pr.name, d.name as app_name, p.name as plan_name,
         p.currency, p.billing_period, pr.promo_price, pr.original_price, pr.discount_percentage,
         pr.discount_duration_type, pr.discount_cycles, pr.unit_limit, pr.eligible_for_daily_deals,
         pr.timezone, pr.starts_at, pr.ends_at,
         pr.is_approved, pr.is_active, pr.cancelled_at, pr.paused_at, pr.rejected_at,
         pr.rejection_reason, pr.created_at, pr.created_by
  from public.promotions pr
  join public.app_plans p on p.id = pr.plan_id
  join public.app_drafts d on d.id = p.app_draft_id
  where pr.id = p_promotion_id and d.created_by = v_partner_id;
end;
$$;

revoke execute on function public.get_partner_promotion_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_promotion_detail(uuid, uuid) to authenticated;

comment on function public.get_partner_promotion_detail(uuid, uuid) is
  'Resumo + análise de uma promoção do parceiro — não retorna linha nenhuma se a promoção não for dele (sem raise, pra não vazar existência de id de outro parceiro).';

-- ─────────────────────────────────────────────────────────────────────────
-- 7) get_partner_promotion_history — eventos de app_admin_events, só o que
--    é seguro mostrar ao parceiro (nunca internal_note de promotions, que
--    nem é selecionado aqui; reason de evento É a mesma info que já vira
--    rejection_reason/revert_reason pro parceiro nas telas existentes).
--    app_admin_events tem RLS "Admins manage admin events" (só
--    is_technician) — por isso precisa ser security definer.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_promotion_history(uuid, uuid);

create or replace function public.get_partner_promotion_history(p_promotion_id uuid, p_partner_id uuid default null)
returns table (
  action      text,
  reason      text,
  created_at  timestamptz,
  actor_role  text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_ofertas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver as ofertas deste parceiro.';
    end if;
  end if;

  if not exists (
    select 1 from public.promotions pr
    join public.app_plans p on p.id = pr.plan_id
    join public.app_drafts d on d.id = p.app_draft_id
    where pr.id = p_promotion_id and d.created_by = v_partner_id
  ) then
    return;
  end if;

  return query
  select e.action, e.reason, e.created_at,
         case when e.actor_id is null then 'sistema' when pr2.role = 'technician' then 'equipe_lobby' else 'parceiro' end as actor_role
  from public.app_admin_events e
  left join public.profiles pr2 on pr2.id = e.actor_id
  where e.promotion_id = p_promotion_id
  order by e.created_at asc;
end;
$$;

revoke execute on function public.get_partner_promotion_history(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_promotion_history(uuid, uuid) to authenticated;

comment on function public.get_partner_promotion_history(uuid, uuid) is
  'Histórico de eventos (app_admin_events) de uma promoção, filtrado pra quem é dono dela — actor_role é só "equipe_lobby"/"parceiro", nunca identifica o funcionário específico. internal_note de promotions nunca é exposto aqui.';

-- ─────────────────────────────────────────────────────────────────────────
-- 8) get_partner_promotion_results — vendas vinculadas de verdade via
--    promotion_id (coluna nova nesta migration — por construção, só tem
--    dado pra promoções usadas a partir de agora, nunca retroativo).
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_promotion_results(uuid, uuid);

create or replace function public.get_partner_promotion_results(p_promotion_id uuid, p_partner_id uuid default null)
returns table (
  currency              text,
  sales_count           integer,
  gross_amount          numeric(12,2),
  discount_granted      numeric(12,2),
  refunded_amount       numeric(12,2),
  partner_amount        numeric(12,2)
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_owns boolean;
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_ofertas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver as ofertas deste parceiro.';
    end if;
  end if;

  select exists (
    select 1 from public.promotions pr
    join public.app_plans p on p.id = pr.plan_id
    join public.app_drafts d on d.id = p.app_draft_id
    where pr.id = p_promotion_id and d.created_by = v_partner_id
  ) into v_owns;
  if not v_owns then
    return;
  end if;

  return query
  select
    coalesce(ap.currency, 'BRL') as currency,
    count(*)::integer as sales_count,
    coalesce(sum(ap.amount), 0) as gross_amount,
    coalesce(sum(greatest(ap.original_promo_delta, 0)), 0) as discount_granted,
    coalesce(sum(ap.refunded_amount), 0) as refunded_amount,
    coalesce(sum(ap.partner_amount), 0) as partner_amount
  from (
    select ap.*, (pr.original_price - pr.promo_price) as original_promo_delta
    from public.app_purchases ap
    join public.promotions pr on pr.id = ap.promotion_id
    where ap.promotion_id = p_promotion_id and ap.status in ('paid', 'refunded')
  ) ap
  group by ap.currency;
end;
$$;

revoke execute on function public.get_partner_promotion_results(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_promotion_results(uuid, uuid) to authenticated;

comment on function public.get_partner_promotion_results(uuid, uuid) is
  'Resultados reais de uma promoção — só compras com promotion_id = esta promoção (coluna nova, sem vínculo retroativo). Assinatura (subscription_invoices) ainda não entra aqui — pode ser estendido quando houver necessidade real, não antecipado.';
