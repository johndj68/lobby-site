-- =============================================
-- Marketplace: Apps, Promotions, and Campaigns
-- =============================================

-- applications: catalog of apps (LOBBY-made and third-party partners)
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  -- Basic info
  name text not null,
  slug text not null unique,
  description text,
  short_description text,
  category text not null, -- 'Inteligência artificial', 'Automação', 'Marketing', 'Gestão e finanças', 'Dados e BI', 'Segurança'
  developer_name text not null,
  -- Visuals
  logo_url text,
  preview_image_url text,
  -- Pricing
  price numeric(10,2),
  price_currency text default 'BRL',
  billing_period text, -- 'one-time', 'monthly', 'yearly'
  is_free boolean default false,
  -- Metadata
  is_published boolean default false,
  is_lobby_made boolean default false, -- true only for LOBBY's own apps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- promotions: temporary price reductions with date ranges
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  -- Discount info
  promo_price numeric(10,2) not null,
  original_price numeric(10,2), -- null means current price is the base
  discount_percentage integer,
  -- Scheduling
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Status
  is_approved boolean default false,
  is_active boolean default false,
  -- Sort order for display (lower = higher priority)
  display_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- sponsored_campaigns: paid highlights in the "Apps em destaque" carousel
create table if not exists public.sponsored_campaigns (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  -- Content
  title text,
  description text,
  campaign_image_url text,
  call_to_action text default 'Conhecer aplicativo',
  -- Scheduling
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Status and payment
  is_approved boolean default false,
  is_active boolean default false,
  is_paid boolean default false,
  payment_status text default 'pending', -- 'pending', 'completed', 'refunded'
  -- Sort order for carousel (lower = earlier in rotation)
  display_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================
-- Row Level Security
-- =============================================

alter table public.applications enable row level security;
alter table public.promotions enable row level security;
alter table public.sponsored_campaigns enable row level security;

-- applications: public can read published apps
create policy "Anyone can view published applications"
  on public.applications for select
  using (is_published = true);

create policy "Admins can manage applications"
  on public.applications
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

-- promotions: public can read approved and active ones within date range
create policy "Anyone can view active promotions"
  on public.promotions for select
  using (
    is_approved = true
    and is_active = true
    and now() between starts_at and ends_at
  );

create policy "Admins can manage promotions"
  on public.promotions
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

-- sponsored_campaigns: public can read approved and active ones within date range
create policy "Anyone can view active sponsored campaigns"
  on public.sponsored_campaigns for select
  using (
    is_approved = true
    and is_active = true
    and now() between starts_at and ends_at
  );

create policy "Admins can manage sponsored campaigns"
  on public.sponsored_campaigns
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

-- =============================================
-- Indexes for performance
-- =============================================

create index if not exists idx_applications_published on public.applications(is_published);
create index if not exists idx_applications_category on public.applications(category);
create index if not exists idx_applications_slug on public.applications(slug);

create index if not exists idx_promotions_app_id on public.promotions(application_id);
create index if not exists idx_promotions_dates on public.promotions(starts_at, ends_at);
create index if not exists idx_promotions_active on public.promotions(is_approved, is_active);

create index if not exists idx_campaigns_app_id on public.sponsored_campaigns(application_id);
create index if not exists idx_campaigns_dates on public.sponsored_campaigns(starts_at, ends_at);
create index if not exists idx_campaigns_active on public.sponsored_campaigns(is_approved, is_active);
