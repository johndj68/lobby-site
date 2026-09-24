-- /admin/marketplace/ofertas — gestão administrativa de planos, preços e
-- promoções do catálogo. Só colunas novas em tabelas existentes (app_plans,
-- promotions, app_admin_events) — nenhuma tabela nova de "oferta" paralela
-- a app_plans (um plano já É a oferta vendável) e nenhuma tabela de
-- pedidos/assinaturas/checkout (não existem no projeto; ver relatório de
-- entrega). Aditivo: nada é removido, renomeado ou tem o tipo alterado.
--
-- RLS: app_plans, promotions e app_admin_events já têm policy de admin via
-- public.is_technician() ("Admins manage all plans", "Admins can manage
-- promotions", "Admins manage admin events") — cobre as colunas novas sem
-- precisar de policy adicional.

-- =============================================
-- app_plans: pausar/retomar/arquivar uma oferta específica (hoje só existe
-- suspender o app inteiro, em applications.suspended_*)
-- =============================================

alter table public.app_plans
  add column if not exists status text not null default 'draft',
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by uuid references auth.users(id) on delete set null,
  add column if not exists paused_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  -- "Descrição comercial" (seção 9) — o editor do parceiro nunca teve esse
  -- campo; texto próprio da oferta, distinto da descrição de marketing do
  -- app em app_drafts.short_description/full_description.
  add column if not exists description text;

-- app_plans nunca teve updated_at (só created_at) — mesma lacuna já
-- encontrada e corrigida em app_drafts (20260922010000), mesmo fix: coluna
-- + trigger reaproveitando update_timestamp() (20260914000000). Necessário
-- pra "Última atualização" na listagem de ofertas refletir preço/pausa/
-- promoção editados por aqui, não só a criação do plano.
alter table public.app_plans add column if not exists updated_at timestamptz;
update public.app_plans set updated_at = created_at where updated_at is null;
alter table public.app_plans alter column updated_at set default now();
alter table public.app_plans alter column updated_at set not null;

drop trigger if exists set_app_plans_updated_at on public.app_plans;
create trigger set_app_plans_updated_at
  before update on public.app_plans
  for each row execute function update_timestamp();

do $$ begin
  alter table public.app_plans
    add constraint valid_plan_status check (status in ('draft', 'active', 'paused', 'archived'));
exception when duplicate_object then null;
end $$;

-- Planos existentes já publicados (o app tem application_id e já foi
-- publicado ao menos uma vez) começam 'active' — os demais continuam
-- 'draft'. Não promove planos de apps nunca publicados.
update public.app_plans p
set status = 'active'
where status = 'draft'
  and exists (
    select 1 from public.app_drafts d
    where d.id = p.app_draft_id and d.application_id is not null
  );

create index if not exists idx_app_plans_status on public.app_plans(status);

-- =============================================
-- promotions: mirar um plano específico (hoje só mira o app inteiro) +
-- campos de vigência/pausa/cancelamento/destaque que a spec pede
-- =============================================

alter table public.promotions
  add column if not exists plan_id uuid references public.app_plans(id) on delete cascade,
  add column if not exists name text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by uuid references auth.users(id) on delete set null,
  add column if not exists eligible_for_daily_deals boolean not null default false,
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists unit_limit integer,
  add column if not exists internal_note text;

create index if not exists idx_promotions_plan on public.promotions(plan_id);

-- =============================================
-- app_admin_events: rastrear plan_id/promotion_id nas novas ações de oferta
-- e promoção (pause_offer, resume_offer, archive_offer, update_plan_price,
-- create_promotion, update_promotion, pause_promotion, cancel_promotion,
-- reactivate_promotion — 'action' já era text livre, sem check constraint)
-- =============================================

alter table public.app_admin_events
  add column if not exists plan_id uuid references public.app_plans(id) on delete set null,
  add column if not exists promotion_id uuid references public.promotions(id) on delete set null;

create index if not exists idx_app_admin_events_plan on public.app_admin_events(plan_id, created_at desc);
create index if not exists idx_app_admin_events_promotion on public.app_admin_events(promotion_id, created_at desc);
