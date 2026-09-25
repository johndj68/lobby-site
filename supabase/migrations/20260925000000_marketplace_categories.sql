-- /admin/marketplace/categorias — categorias e subcategorias reais de
-- aplicativos. Hoje applications.category/app_drafts.category são texto
-- livre, sem tabela nenhuma por trás — dois fluxos de cadastro ao vivo
-- gravam formatos incompatíveis na mesma coluna (StageTwo.tsx grava códigos
-- fixos 'ia'/'automacao'/etc; EditorClient.tsx aceita texto livre digitado).
-- Esta migração cria a tabela real (2 níveis, auto-referenciada — uma
-- subcategoria é só uma linha com parent_id preenchido, não outra tabela),
-- liga applications/app_drafts a ela via category_id (aditivo — a coluna
-- category antiga continua existindo, intacta, só não é mais escrita pelos
-- fluxos ao vivo depois desta entrega) e faz o backfill dos 6 códigos
-- conhecidos do StageTwo (decisão confirmada — texto livre do outro fluxo
-- fica sem categoria válida de propósito, vira pendência real).

-- =============================================
-- app_categories
-- =============================================

create table if not exists public.app_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.app_categories(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null check (char_length(slug) between 2 and 100),
  description text check (description is null or char_length(description) <= 300),
  icon text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  show_in_nav boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nível de profundidade travado em 2 (categoria + subcategoria) — impede
-- que uma subcategoria vire pai de outra (checado de novo no backend antes
-- de qualquer update, seção 11, mas a constraint documenta a regra aqui).
do $$ begin
  alter table public.app_categories
    add constraint no_self_parent check (id <> parent_id);
exception when duplicate_object then null;
end $$;

-- Slug global e único (a URL pública usa só o slug, sem caminho
-- hierárquico — decisão de escopo confirmada, seção 9).
create unique index if not exists idx_app_categories_slug on public.app_categories(slug);

-- Duplicata por nome no mesmo nível — versão case-insensitive garantida no
-- banco (proteção real contra corrida); a normalização mais rica
-- (acento/espaço, mesmo critério de slugify() já usado no projeto) fica no
-- backend antes do insert, evitando depender de unaccent() em índice.
create unique index if not exists idx_app_categories_name_per_parent
  on public.app_categories(coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create index if not exists idx_app_categories_parent on public.app_categories(parent_id, display_order);
create index if not exists idx_app_categories_status on public.app_categories(status);

drop trigger if exists set_app_categories_updated_at on public.app_categories;
create trigger set_app_categories_updated_at
  before update on public.app_categories
  for each row execute function update_timestamp();

-- =============================================
-- category_slug_redirects — preserva link antigo quando o slug muda
-- =============================================

create table if not exists public.category_slug_redirects (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.app_categories(id) on delete cascade,
  old_slug text not null,
  created_at timestamptz not null default now()
);

-- Um slug antigo nunca pode ser reclamado por duas categorias diferentes —
-- unicidade global, mesmo espaço de nomes do slug atual.
create unique index if not exists idx_category_slug_redirects_old_slug on public.category_slug_redirects(old_slug);
create index if not exists idx_category_slug_redirects_category on public.category_slug_redirects(category_id);

-- =============================================
-- applications / app_drafts: category_id aditivo — coluna category (texto)
-- antiga fica intacta, só deixa de ser a fonte de verdade
-- =============================================

alter table public.applications
  add column if not exists category_id uuid references public.app_categories(id) on delete set null;
alter table public.app_drafts
  add column if not exists category_id uuid references public.app_categories(id) on delete set null;

create index if not exists idx_applications_category_id on public.applications(category_id);
create index if not exists idx_app_drafts_category_id on public.app_drafts(category_id);

-- =============================================
-- app_admin_events: auditoria de categorias no mesmo trilho já usado por
-- ofertas/campanhas (plan_id/promotion_id/campaign_id)
-- =============================================

alter table public.app_admin_events
  add column if not exists category_id uuid references public.app_categories(id) on delete set null;

create index if not exists idx_app_admin_events_category on public.app_admin_events(category_id, created_at desc);

-- =============================================
-- Backfill: só os 6 códigos conhecidos do StageTwo.tsx (decisão
-- confirmada) — texto livre do outro fluxo (EditorClient.tsx) e o fallback
-- 'Outros' do publish route ficam category_id null, viram pendência real.
-- =============================================

insert into public.app_categories (name, slug, description, icon, status, show_in_nav, display_order)
values
  ('Inteligência Artificial', 'inteligencia-artificial', 'Aplicativos de IA generativa, automação inteligente e assistentes.', 'Sparkles', 'active', true, 0),
  ('Automação', 'automacao', 'Fluxos de trabalho, integrações e automação de tarefas.', 'Settings2', 'active', true, 1),
  ('Marketing', 'marketing', 'Ferramentas de marketing digital, campanhas e conteúdo.', 'TrendingUp', 'active', true, 2),
  ('Gestão e Finanças', 'gestao-e-financas', 'Gestão financeira, cobrança e controle de negócio.', 'BarChart3', 'active', true, 3),
  ('Dados e BI', 'dados-e-bi', 'Análise de dados, relatórios e business intelligence.', 'Zap', 'active', true, 4),
  ('Segurança', 'seguranca', 'Segurança digital, proteção de dados e conformidade.', 'Shield', 'active', true, 5)
on conflict (slug) do nothing;

update public.app_drafts d
set category_id = c.id
from public.app_categories c
where d.category_id is null
  and (
    (d.category = 'ia' and c.slug = 'inteligencia-artificial') or
    (d.category = 'automacao' and c.slug = 'automacao') or
    (d.category = 'marketing' and c.slug = 'marketing') or
    (d.category = 'financeiro' and c.slug = 'gestao-e-financas') or
    (d.category = 'dados' and c.slug = 'dados-e-bi') or
    (d.category = 'seguranca' and c.slug = 'seguranca')
  );

update public.applications a
set category_id = c.id
from public.app_categories c
where a.category_id is null
  and (
    (a.category = 'ia' and c.slug = 'inteligencia-artificial') or
    (a.category = 'automacao' and c.slug = 'automacao') or
    (a.category = 'marketing' and c.slug = 'marketing') or
    (a.category = 'financeiro' and c.slug = 'gestao-e-financas') or
    (a.category = 'dados' and c.slug = 'dados-e-bi') or
    (a.category = 'seguranca' and c.slug = 'seguranca')
  );

-- =============================================
-- RLS
-- =============================================

alter table public.app_categories enable row level security;
alter table public.category_slug_redirects enable row level security;

create policy "Anyone can view active categories" on public.app_categories for select using (status = 'active');
create policy "Admins manage categories" on public.app_categories using (public.is_technician((select auth.uid()))) with check (public.is_technician((select auth.uid())));

create policy "Admins manage slug redirects" on public.category_slug_redirects using (public.is_technician((select auth.uid()))) with check (public.is_technician((select auth.uid())));
