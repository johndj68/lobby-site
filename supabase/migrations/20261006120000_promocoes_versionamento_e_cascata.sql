-- Fecha 3 lacunas declaradas como "fora de escopo" na entrega anterior
-- (20261006110000), agora pedidas de verdade:
--
--   1) Versionamento: editar uma promoção APROVADA nunca sobrescreve a
--      linha vigente — cria uma nova linha (nova versão) presa à antiga
--      via previous_version_id, nasce pendente (ou já aprovada, se quem
--      edita é o admin — mesmo princípio de "admin cria já aprovada" que
--      já existe hoje). A versão antiga continua valendo/vendendo até a
--      nova ser aprovada; só então ela é superseded (nunca cancelada —
--      cancelar e substituir são coisas diferentes).
--
--   2) Drift de preço: nenhuma invalidação automática/silenciosa — só
--      exposição do fato (original_price da promoção != preço atual do
--      plano) pra UI avisar e oferecer a ação certa (cancelar pendente,
--      ou propor nova versão se já aprovada). A aprovação JÁ bloqueava
--      isso (20260923000000/admin route) — aqui só ganhamos visibilidade
--      ANTES da aprovação travar.
--
--   3) Cascata real: pausar (nunca cancelar — motivo errado) toda
--      promoção ativa/programada quando o PLANO é arquivado/pausado ou o
--      APP é suspenso/despublicado. Implementado como trigger — não dá
--      pra esquecer de chamar numa rota futura, e cobre tanto a tela do
--      admin quanto a do parceiro com a mesma fonte de verdade.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Versionamento — colunas novas
-- ─────────────────────────────────────────────────────────────────────────

alter table public.promotions
  add column if not exists previous_version_id uuid references public.promotions(id),
  add column if not exists superseded_at timestamptz;

comment on column public.promotions.previous_version_id is
  'Promoção que esta linha propõe substituir (edição de uma já aprovada) — nunca aponta pra uma promoção de outro plano/dono (RLS). Null = não é uma edição, é um pedido novo.';
comment on column public.promotions.superseded_at is
  'Quando a NOVA versão (que aponta previous_version_id pra esta linha) foi aprovada — a partir daqui esta linha para de valer, mas nunca é apagada nem marcada como cancelada (motivo diferente).';

-- previous_version_id só pode apontar pra uma promoção do MESMO dono e do
-- MESMO plano — sem isso um parceiro malicioso podia tentar linkar a
-- "edição" de uma promoção de outro parceiro só pra, por exemplo, uma
-- aprovação futura mexer indevidamente na linha alheia (ver trigger de
-- supersessão abaixo, que escreve na linha apontada).
--
-- A checagem NÃO pode ser uma subquery inline em FROM public.promotions
-- dentro da própria policy de promotions — Postgres detecta isso como
-- referência circular ("infinite recursion detected in policy for
-- relation 'promotions'", 42P17) mesmo quando a lógica em si é correta.
-- Função security definer separada resolve: é uma chamada de função, não
-- uma subquery inline no plano da policy.
create or replace function public.promotion_version_link_valid(p_previous_version_id uuid, p_plan_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  -- Checa posse E estado — "edita" só pode apontar pra uma versão que
  -- ainda está de pé (aprovada, não cancelada, não já substituída).
  -- Sem isso, a trava real ficaria só no TS (app/api/apps/plans/[id]/
  -- promotions/route.ts), não na fronteira que é pra ser a garantia dura
  -- (RLS) — um caminho de escrita futuro que esqueça de replicar essa
  -- checagem deixaria uma "nova versão" linkada a uma linha morta, sem
  -- erro nenhum (o trigger de supersessão só faz no-op silencioso nesse
  -- caso, via seu próprio "and superseded_at is null and cancelled_at is
  -- null").
  select exists (
    select 1
    from public.promotions pv
    join public.app_plans p2 on p2.id = pv.plan_id
    join public.app_drafts d2 on d2.id = p2.app_draft_id
    where pv.id = p_previous_version_id
      and pv.plan_id = p_plan_id
      and d2.created_by = p_user_id
      and pv.is_approved = true
      and pv.cancelled_at is null
      and pv.superseded_at is null
  );
$$;

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
    and superseded_at is null
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
    and (
      previous_version_id is null
      or public.promotion_version_link_valid(previous_version_id, plan_id, auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Supersessão automática — quando uma linha com previous_version_id é
--    aprovada (is_approved true) E já está dentro da própria janela de
--    vigência (starts_at <= now()), a linha anterior para de valer.
--    Trigger (não lógica espalhada em rota) pra nunca esquecer — vale pra
--    aprovação pelo admin E pra qualquer caminho futuro que aprove.
--
--    A checagem de starts_at <= now() é essencial: aprovar uma edição
--    AGENDADA pro futuro não pode matar a versão vigente imediatamente
--    ("preservando a versão vigente até a mudança autorizada" — a mudança
--    só é "autorizada a valer" quando a janela da nova versão começa de
--    fato, não no momento em que o admin clicou aprovar). A rota de
--    aprovação garante que não existe sobreposição de datas pra esse
--    caso (não exclui a versão anterior do overlap check quando o início
--    é futuro) — então a versão antiga simplesmente encerra pelo próprio
--    ends_at no momento certo, sem precisar de handoff manual aqui.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.supersede_previous_promotion_version()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.is_approved = true and old.is_approved = false and new.previous_version_id is not null and new.starts_at <= now() then
    update public.promotions
      set is_active = false, superseded_at = now()
      where id = new.previous_version_id
        and superseded_at is null
        and cancelled_at is null;

    -- actor_id null de propósito: quem aprovou a nova versão já fica
    -- registrado no próprio evento de aprovação DELA (create_promotion,
    -- actorId = quem de fato aprovou); este é um efeito sistêmico
    -- consequente, não uma ação de quem criou a versão nova (new.created_by
    -- seria o PARCEIRO, atribuição enganosa pra um evento de aprovação).
    insert into public.app_admin_events (app_draft_id, application_id, plan_id, promotion_id, actor_id, action, reason, previous_status, new_status)
    select d.app_draft_id, new.application_id, new.plan_id, new.previous_version_id, null,
           'supersede_promotion', 'Substituída por uma nova versão aprovada (' || new.id || ').', 'ativa_ou_programada', 'substituida'
    from public.app_plans d where d.id = new.plan_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_supersede_previous_promotion_version on public.promotions;
create trigger trg_supersede_previous_promotion_version
  after update on public.promotions
  for each row execute function public.supersede_previous_promotion_version();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Cascata real — pausa (nunca cancela) promoção viva quando o PLANO é
--    arquivado/pausado, ou quando o APP é suspenso/despublicado. actor_id
--    null = evento sistêmico, sem humano por trás (mesmo padrão já
--    documentado em logAppAdminEvent para webhooks).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.cascade_pause_promotions_on_plan_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status in ('archived', 'paused') and old.status is distinct from new.status then
    insert into public.app_admin_events (app_draft_id, application_id, plan_id, promotion_id, actor_id, action, reason, previous_status, new_status)
    select new.app_draft_id, pr.application_id, pr.plan_id, pr.id, null,
           'pause_promotion',
           case when new.status = 'archived' then 'Pausada automaticamente — a oferta foi arquivada.' else 'Pausada automaticamente — a oferta foi pausada.' end,
           'ativa_ou_programada', 'pausada'
    from public.promotions pr
    where pr.plan_id = new.id
      and pr.is_approved = true
      and pr.is_active = true
      and pr.cancelled_at is null
      and pr.paused_at is null
      and pr.superseded_at is null;

    update public.promotions
      set paused_at = now(), paused_by = null
      where plan_id = new.id
        and is_approved = true
        and is_active = true
        and cancelled_at is null
        and paused_at is null
        and superseded_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cascade_pause_promotions_on_plan_status on public.app_plans;
create trigger trg_cascade_pause_promotions_on_plan_status
  after update on public.app_plans
  for each row execute function public.cascade_pause_promotions_on_plan_status();

create or replace function public.cascade_pause_promotions_on_app_suspend()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_just_suspended boolean := (new.suspended_at is not null and old.suspended_at is null);
  v_just_unpublished boolean := (new.is_published = false and old.is_published = true);
begin
  if v_just_suspended or v_just_unpublished then
    insert into public.app_admin_events (app_draft_id, application_id, plan_id, promotion_id, actor_id, action, reason, previous_status, new_status)
    select (select p.app_draft_id from public.app_plans p where p.id = pr.plan_id), pr.application_id, pr.plan_id, pr.id, null,
           'pause_promotion',
           case when v_just_suspended then 'Pausada automaticamente — o aplicativo foi suspenso.' else 'Pausada automaticamente — o aplicativo saiu de publicação.' end,
           'ativa_ou_programada', 'pausada'
    from public.promotions pr
    where pr.application_id = new.id
      and pr.is_approved = true
      and pr.is_active = true
      and pr.cancelled_at is null
      and pr.paused_at is null
      and pr.superseded_at is null;

    update public.promotions
      set paused_at = now(), paused_by = null
      where application_id = new.id
        and is_approved = true
        and is_active = true
        and cancelled_at is null
        and paused_at is null
        and superseded_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cascade_pause_promotions_on_app_suspend on public.applications;
create trigger trg_cascade_pause_promotions_on_app_suspend
  after update on public.applications
  for each row execute function public.cascade_pause_promotions_on_app_suspend();

-- ─────────────────────────────────────────────────────────────────────────
-- 4) get_partner_ofertas_promotions / get_partner_promotion_detail ganham
--    previous_version_id/superseded_at (versionamento) e plan_current_price
--    (drift — UI compara com original_price, nunca recalcula nada aqui).
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
  previous_version_id     uuid,
  superseded_at           timestamptz,
  plan_current_price      numeric(10,2),
  plan_status             text,
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
         pr.paused_at, pr.rejected_at, pr.rejection_reason,
         pr.previous_version_id, pr.superseded_at, p.price as plan_current_price, p.status as plan_status,
         pr.created_at, pr.updated_at
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
  'Pedidos/promoções do parceiro. plan_current_price/plan_status pra UI detectar drift de preço e oferta arquivada/pausada sem recalcular nada — só exibição.';

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
  previous_version_id    uuid,
  superseded_at          timestamptz,
  plan_current_price     numeric(10,2),
  plan_status            text,
  app_suspended          boolean,
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
         pr.rejection_reason, pr.previous_version_id, pr.superseded_at,
         p.price as plan_current_price, p.status as plan_status, (a.suspended_at is not null or a.is_published is false) as app_suspended,
         pr.created_at, pr.created_by
  from public.promotions pr
  join public.app_plans p on p.id = pr.plan_id
  join public.app_drafts d on d.id = p.app_draft_id
  left join public.applications a on a.id = pr.application_id
  where pr.id = p_promotion_id and d.created_by = v_partner_id;
end;
$$;

revoke execute on function public.get_partner_promotion_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_partner_promotion_detail(uuid, uuid) to authenticated;

comment on function public.get_partner_promotion_detail(uuid, uuid) is
  'Resumo + análise de uma promoção, com contexto de drift (plan_current_price vs original_price) e elegibilidade real do plano/app — nunca recalcula desconto, só expõe os fatos pra UI decidir o aviso certo.';
