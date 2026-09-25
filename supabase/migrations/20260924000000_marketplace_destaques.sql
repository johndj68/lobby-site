-- /admin/marketplace/destaques — campanhas de destaque patrocinado (carrossel
-- da home). Estende public.sponsored_campaigns (ela continua sendo "a
-- campanha", seu id = campaignId) em vez de criar uma tabela paralela; as
-- tabelas novas (espaço, pacote, versão de anúncio, reserva, pagamento,
-- evento de métrica) não têm nenhum equivalente hoje no projeto. Aditivo:
-- nada é removido, renomeado ou tem tipo alterado; linhas existentes de
-- sponsored_campaigns continuam válidas (backfill abaixo).

-- =============================================
-- ad_spaces — espaços de publicidade (começa só com o carrossel da home)
-- =============================================

create table if not exists public.ad_spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  max_concurrent_campaigns integer not null default 6,
  max_simultaneous_display integer not null default 1,
  rotation_rule text not null default 'equal_weight',
  swap_interval_seconds integer not null default 6,
  accepted_formats jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ad_spaces (slug, name, description, max_concurrent_campaigns, max_simultaneous_display, swap_interval_seconds, accepted_formats)
values (
  'home_carousel',
  'Carrossel principal da home',
  'Seção "Apps em destaque" na página inicial — mostra um anúncio por vez, alternando entre campanhas elegíveis.',
  6, 1, 6,
  '{"aspect_ratio": "16:9", "min_width": 800, "min_height": 450, "max_size_mb": 5}'::jsonb
)
on conflict (slug) do nothing;

-- =============================================
-- ad_packages — condições comerciais reais do espaço (sem preço inventado;
-- nascem em rascunho, o admin cadastra valores reais antes de ativar)
-- =============================================

create table if not exists public.ad_packages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.ad_spaces(id) on delete cascade,
  name text not null,
  description text,
  duration_days integer not null check (duration_days > 0),
  price numeric(10,2),
  currency text not null default 'BRL',
  participation_weight numeric(6,2) not null default 1,
  cancellation_policy text,
  pause_policy text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ad_packages_space on public.ad_packages(space_id, status);

-- =============================================
-- sponsored_campaigns — estende a tabela existente (não substitui)
-- =============================================

alter table public.sponsored_campaigns
  add column if not exists app_draft_id uuid references public.app_drafts(id) on delete cascade,
  add column if not exists space_id uuid references public.ad_spaces(id) on delete set null,
  add column if not exists package_id uuid references public.ad_packages(id) on delete set null,
  add column if not exists internal_name text,
  add column if not exists image_alt text,
  add column if not exists cta_href text,
  add column if not exists review_status text not null default 'aprovado',
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by uuid references auth.users(id) on delete set null,
  add column if not exists paused_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_reason text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

do $$ begin
  alter table public.sponsored_campaigns
    add constraint valid_campaign_review_status check (review_status in ('rascunho', 'em_revisao', 'ajustes_solicitados', 'aprovado', 'rejeitado'));
exception when duplicate_object then null;
end $$;

-- Backfill: linhas existentes (criadas antes deste módulo) já estão no ar —
-- ficam 'aprovado' (default acima) pra não regredir o que já está publicado.
-- app_draft_id via join em application_id; space_id = carrossel da home;
-- cta_href derivado do slug do app (nunca link livre, mesmo nas antigas).
update public.sponsored_campaigns c
set app_draft_id = d.id
from public.app_drafts d
where c.app_draft_id is null and d.application_id = c.application_id;

update public.sponsored_campaigns c
set space_id = s.id
from public.ad_spaces s
where c.space_id is null and s.slug = 'home_carousel';

update public.sponsored_campaigns c
set cta_href = '/app/' || a.slug
from public.applications a
where c.cta_href is null and a.id = c.application_id;

create index if not exists idx_sponsored_campaigns_app_draft on public.sponsored_campaigns(app_draft_id);
create index if not exists idx_sponsored_campaigns_space on public.sponsored_campaigns(space_id, starts_at, ends_at);

-- =============================================
-- ad_creatives — versões do anúncio, sujeitas a revisão (mirror de
-- app_drafts/app_submissions: a campanha aponta pra uma versão "no ar"
-- enquanto outra pode estar em análise, sem substituir silenciosamente)
-- =============================================

create table if not exists public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sponsored_campaigns(id) on delete cascade,
  version integer not null,
  title text,
  description text,
  image_url text,
  image_alt text,
  cta_label text default 'Conhecer aplicativo',
  cta_href text,
  internal_notes text,
  review_status text not null default 'rascunho' check (review_status in ('rascunho', 'em_revisao', 'ajustes_solicitados', 'aprovado', 'rejeitado')),
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_notes text,
  partner_feedback text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (campaign_id, version)
);

create index if not exists idx_ad_creatives_campaign on public.ad_creatives(campaign_id, version desc);

alter table public.sponsored_campaigns
  add column if not exists live_creative_id uuid references public.ad_creatives(id) on delete set null;

-- =============================================
-- ad_reservations — reserva transacional de capacidade do espaço
-- =============================================

create table if not exists public.ad_reservations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sponsored_campaigns(id) on delete cascade,
  space_id uuid not null references public.ad_spaces(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'held' check (status in ('held', 'confirmed', 'released')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_reservation_period check (ends_at > starts_at)
);

create index if not exists idx_ad_reservations_space_period on public.ad_reservations(space_id, status, starts_at, ends_at);
create index if not exists idx_ad_reservations_campaign on public.ad_reservations(campaign_id);

-- =============================================
-- campaign_purchases — pagamento da publicidade (mirror de credit_purchases,
-- provedor real via Stripe — mesmo webhook, sem sistema paralelo)
-- =============================================

create table if not exists public.campaign_purchases (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sponsored_campaigns(id) on delete cascade,
  package_id uuid references public.ad_packages(id) on delete set null,
  payer_user_id uuid references auth.users(id) on delete set null,
  amount numeric(10,2) not null,
  currency text not null default 'BRL',
  kind text not null default 'stripe' check (kind in ('stripe', 'isento', 'manual_externo')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded', 'isento')),
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  isento_reason text,
  isento_granted_by uuid references auth.users(id) on delete set null,
  isento_granted_at timestamptz,
  manual_reference text,
  manual_authorized_by uuid references auth.users(id) on delete set null,
  refund_status text,
  refund_reason text,
  refunded_at timestamptz,
  refunded_by uuid references auth.users(id) on delete set null,
  accepted_terms_at timestamptz,
  accepted_terms_version text,
  package_terms_snapshot text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_campaign_purchases_campaign on public.campaign_purchases(campaign_id, created_at desc);
create index if not exists campaign_purchases_stripe_session_idx on public.campaign_purchases(stripe_session_id) where stripe_session_id is not null;

-- =============================================
-- ad_events — impressões e cliques (nada disso existe hoje pra nenhuma
-- feature do projeto). Deduplicação de impressão por visualização de
-- página via índice único parcial.
-- =============================================

create table if not exists public.ad_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sponsored_campaigns(id) on delete cascade,
  creative_id uuid references public.ad_creatives(id) on delete set null,
  event_type text not null check (event_type in ('impression', 'click')),
  view_id text not null,
  device_type text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_ad_events_impression_dedup
  on public.ad_events(view_id, campaign_id)
  where event_type = 'impression';

create index if not exists idx_ad_events_campaign_time on public.ad_events(campaign_id, created_at desc);

-- =============================================
-- app_admin_events — rastrear campanhas na mesma trilha de auditoria já
-- usada por apps/ofertas/promoções (action já é text livre, sem migration
-- de constraint necessária pros novos valores)
-- =============================================

alter table public.app_admin_events
  add column if not exists campaign_id uuid references public.sponsored_campaigns(id) on delete set null;

create index if not exists idx_app_admin_events_campaign on public.app_admin_events(campaign_id, created_at desc);

-- =============================================
-- RPCs: reserva/confirmação transacional de capacidade
-- =============================================

create or replace function public.reserve_ad_capacity(
  p_campaign_id uuid,
  p_space_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_hold_minutes integer default 30
)
returns public.ad_reservations
language plpgsql
security definer set search_path = public
as $$
declare
  v_max   integer;
  v_count integer;
  v_res   public.ad_reservations;
begin
  if p_ends_at <= p_starts_at then
    raise exception 'INVALID_PERIOD';
  end if;

  -- Serializa concorrência por espaço — duas contratações simultâneas pra
  -- a última vaga nunca passam ambas.
  perform pg_advisory_xact_lock(hashtext(p_space_id::text));

  select max_concurrent_campaigns into v_max from public.ad_spaces where id = p_space_id and is_active;
  if v_max is null then
    raise exception 'SPACE_UNAVAILABLE';
  end if;

  select count(*) into v_count
  from public.ad_reservations
  where space_id = p_space_id
    and campaign_id <> p_campaign_id
    and status in ('held', 'confirmed')
    and (status <> 'held' or expires_at > now())
    and starts_at < p_ends_at
    and ends_at > p_starts_at;

  if v_count >= v_max then
    raise exception 'CAPACITY_EXCEEDED';
  end if;

  update public.ad_reservations
  set status = 'released', updated_at = now()
  where campaign_id = p_campaign_id and status in ('held', 'confirmed');

  insert into public.ad_reservations (campaign_id, space_id, starts_at, ends_at, status, expires_at)
  values (p_campaign_id, p_space_id, p_starts_at, p_ends_at, 'held', now() + (p_hold_minutes || ' minutes')::interval)
  returning * into v_res;

  return v_res;
end;
$$;

create or replace function public.confirm_ad_reservation(p_campaign_id uuid)
returns public.ad_reservations
language plpgsql
security definer set search_path = public
as $$
declare
  v_hold_id    uuid;
  v_space_id   uuid;
  v_max        integer;
  v_count      integer;
  v_res        public.ad_reservations;
  v_confirmed  public.ad_reservations;
begin
  select id, space_id into v_hold_id, v_space_id
  from public.ad_reservations
  where campaign_id = p_campaign_id and status = 'held'
  order by created_at desc
  limit 1;

  if v_hold_id is null then
    -- já pode ter sido confirmada antes (redelivery do webhook) — idempotente
    select * into v_confirmed from public.ad_reservations
    where campaign_id = p_campaign_id and status = 'confirmed'
    order by created_at desc limit 1;
    if v_confirmed.id is not null then
      return v_confirmed;
    end if;
    raise exception 'NO_HOLD_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_space_id::text));

  select max_concurrent_campaigns into v_max from public.ad_spaces where id = v_space_id;

  select count(*) into v_count
  from public.ad_reservations
  where space_id = v_space_id
    and campaign_id <> p_campaign_id
    and status in ('held', 'confirmed')
    and (status <> 'held' or expires_at > now());

  if v_count >= v_max then
    raise exception 'CAPACITY_LOST_ON_CONFIRM';
  end if;

  update public.ad_reservations
  set status = 'confirmed', expires_at = null, updated_at = now()
  where id = v_hold_id
  returning * into v_res;

  return v_res;
end;
$$;

-- Execução restrita a service_role: nenhuma verificação de dono/permissão
-- vive dentro da função (ela é security definer e recebe só um UUID de
-- espaço) — quem chama já validou dono/técnico antes, mesmo padrão de
-- app/api/apps/plans/route.ts. Autenticado direto via supabase-js poderia
-- reservar capacidade pra QUALQUER campanha se tivesse EXECUTE.
revoke all on function public.reserve_ad_capacity(uuid, uuid, timestamptz, timestamptz, integer) from public;
revoke all on function public.confirm_ad_reservation(uuid) from public;
grant execute on function public.reserve_ad_capacity(uuid, uuid, timestamptz, timestamptz, integer) to service_role;
grant execute on function public.confirm_ad_reservation(uuid) to service_role;

-- =============================================
-- RLS
-- =============================================

alter table public.ad_spaces enable row level security;
alter table public.ad_packages enable row level security;
alter table public.ad_creatives enable row level security;
alter table public.ad_reservations enable row level security;
alter table public.campaign_purchases enable row level security;
alter table public.ad_events enable row level security;

create policy "Anyone can view active spaces" on public.ad_spaces for select using (is_active = true);
create policy "Admins manage spaces" on public.ad_spaces using (public.is_technician((select auth.uid()))) with check (public.is_technician((select auth.uid())));

create policy "Anyone can view active packages" on public.ad_packages for select using (status = 'active');
create policy "Admins manage packages" on public.ad_packages using (public.is_technician((select auth.uid()))) with check (public.is_technician((select auth.uid())));

create policy "Owners view own creatives" on public.ad_creatives for select
  using (
    exists (
      select 1 from public.sponsored_campaigns c
      join public.app_drafts d on d.id = c.app_draft_id
      where c.id = ad_creatives.campaign_id and d.created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );
create policy "Owners manage own draft creatives" on public.ad_creatives for insert
  with check (
    public.is_technician((select auth.uid()))
    or (
      review_status in ('rascunho', 'em_revisao')
      and reviewer_id is null
      and reviewed_at is null
      and reviewer_notes is null
      and exists (
        select 1 from public.sponsored_campaigns c
        join public.app_drafts d on d.id = c.app_draft_id
        where c.id = ad_creatives.campaign_id and d.created_by = (select auth.uid())
      )
    )
  );
-- with check impede que o próprio dono, via PostgREST direto, escreva
-- review_status='aprovado'/'rejeitado' ou preencha campos de revisor —
-- isso só pode acontecer pela rota de revisão do admin (service role).
create policy "Owners update own draft creatives" on public.ad_creatives for update
  using (
    review_status in ('rascunho', 'ajustes_solicitados')
    and exists (
      select 1 from public.sponsored_campaigns c
      join public.app_drafts d on d.id = c.app_draft_id
      where c.id = ad_creatives.campaign_id and d.created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  )
  with check (
    public.is_technician((select auth.uid()))
    or (
      review_status in ('rascunho', 'em_revisao')
      and reviewer_id is null
      and reviewed_at is null
      and reviewer_notes is null
      and exists (
        select 1 from public.sponsored_campaigns c
        join public.app_drafts d on d.id = c.app_draft_id
        where c.id = ad_creatives.campaign_id and d.created_by = (select auth.uid())
      )
    )
  );

create policy "Owners view own reservations" on public.ad_reservations for select
  using (
    exists (
      select 1 from public.sponsored_campaigns c
      join public.app_drafts d on d.id = c.app_draft_id
      where c.id = ad_reservations.campaign_id and d.created_by = (select auth.uid())
    )
    or public.is_technician((select auth.uid()))
  );
-- Sem policy de insert/update direto — só via RPC security definer acima.

create policy "Owners view own purchases" on public.campaign_purchases for select
  using (
    payer_user_id = (select auth.uid())
    or public.is_technician((select auth.uid()))
  );
create policy "Admins manage purchases" on public.campaign_purchases for update using (public.is_technician((select auth.uid())));
-- Sem policy de insert pro cliente — toda escrita passa pelo servidor
-- (client admin), mesmo padrão de credit_purchases.

-- ad_events: nenhuma policy de select/insert pra anon/authenticated —
-- o endpoint público usa o client admin (service_role) depois de validar
-- elegibilidade no servidor.

-- =============================================
-- sponsored_campaigns: policies adicionais pro autoatendimento do parceiro
-- (somam às duas policies já existentes — admin full via is_technician() e
-- leitura pública de campanhas aprovadas+ativas+no período). O "with check"
-- impede que o próprio dono aprove/ative/marque como pago a campanha por
-- uma escrita direta; o allowlist fino de campos editáveis (datas, nome
-- interno, pacote) fica na rota Next.js, mesmo padrão de
-- app/api/admin/offers/[planId]/route.ts (EDITABLE_FIELDS).
-- =============================================

create policy "Owners view own campaigns" on public.sponsored_campaigns for select
  using (
    exists (select 1 from public.app_drafts d where d.id = sponsored_campaigns.app_draft_id and d.created_by = (select auth.uid()))
  );

create policy "Owners create own draft campaigns" on public.sponsored_campaigns for insert
  with check (
    review_status = 'rascunho'
    and is_approved = false and is_active = false and is_paid = false
    and live_creative_id is null
    and exists (select 1 from public.app_drafts d where d.id = sponsored_campaigns.app_draft_id and d.created_by = (select auth.uid()))
  );

create policy "Owners update own draft campaigns" on public.sponsored_campaigns for update
  using (
    review_status in ('rascunho', 'ajustes_solicitados')
    and exists (select 1 from public.app_drafts d where d.id = sponsored_campaigns.app_draft_id and d.created_by = (select auth.uid()))
  )
  with check (
    is_approved = false and is_active = false and is_paid = false
  );
