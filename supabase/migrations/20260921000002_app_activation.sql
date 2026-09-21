-- =============================================
-- App Activation & Delivery
-- =============================================

-- app_activation_config: activation settings per app draft
create table if not exists public.app_activation_config (
  id uuid primary key default gen_random_uuid(),
  app_draft_id uuid not null references public.app_drafts(id) on delete cascade,

  -- Activation settings
  activation_method text, -- 'rescue_code', 'api', 'oauth', 'manual'
  activation_link text, -- URL where customer enters code
  support_email text, -- Support contact for buyer

  -- Instructions (stored as ordered list)
  instructions jsonb, -- [{id, position, text}]

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(app_draft_id)
);

-- app_activation_codes_batch: metadata for imported code batches
create table if not exists public.app_activation_codes_batch (
  id uuid primary key default gen_random_uuid(),
  app_draft_id uuid not null references public.app_drafts(id) on delete cascade,
  plan_id uuid not null references public.app_plans(id) on delete cascade,

  batch_name text, -- auto-generated or user-provided
  total_codes integer not null,
  available integer not null default 0,
  reserved integer default 0,
  delivered integer default 0,

  imported_by uuid not null references auth.users(id) on delete set null,
  imported_at timestamptz default now(),

  constraint valid_counts check (available + reserved + delivered = total_codes)
);

-- app_activation_codes: individual activation codes
create table if not exists public.app_activation_codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.app_activation_codes_batch(id) on delete cascade,
  app_draft_id uuid not null references public.app_drafts(id) on delete cascade,
  plan_id uuid not null references public.app_plans(id) on delete cascade,

  code text not null, -- Raw code (preserve case, leading zeros, etc)
  code_hash text not null, -- SHA256 hash for duplicate detection

  status text default 'available', -- available, reserved, delivered, revoked

  -- Delivery tracking
  order_id text, -- Reference to actual order/payment
  delivered_to text, -- Customer email (optional)
  delivered_at timestamptz,
  redeemed_at timestamptz, -- When customer confirmed in their app

  created_at timestamptz default now(),

  constraint valid_status check (status in ('available', 'reserved', 'delivered', 'revoked')),
  constraint unique_code_per_app unique (app_draft_id, code_hash)
);

-- =============================================
-- Row Level Security
-- =============================================

alter table public.app_activation_config enable row level security;
alter table public.app_activation_codes_batch enable row level security;
alter table public.app_activation_codes enable row level security;

-- Developers see only their app's config
create policy "Developers view own activation config"
  on public.app_activation_config for select
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
    or auth.jwt() ->> 'role' = 'admin'
  );

create policy "Developers update own activation config"
  on public.app_activation_config for update
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
    or auth.jwt() ->> 'role' = 'admin'
  );

create policy "Developers insert own activation config"
  on public.app_activation_config for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
    or auth.jwt() ->> 'role' = 'admin'
  );

-- Code batches
create policy "Developers view own code batches"
  on public.app_activation_codes_batch for select
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
    or auth.jwt() ->> 'role' = 'admin'
  );

create policy "Developers insert own code batches"
  on public.app_activation_codes_batch for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
    or auth.jwt() ->> 'role' = 'admin'
  );

-- Individual codes
create policy "Developers view own codes"
  on public.app_activation_codes for select
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
    or auth.jwt() ->> 'role' = 'admin'
  );

create policy "Developers insert own codes"
  on public.app_activation_codes for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
    or auth.jwt() ->> 'role' = 'admin'
  );

-- =============================================
-- Indexes
-- =============================================

create index if not exists idx_activation_config_draft on public.app_activation_config(app_draft_id);
create index if not exists idx_activation_batch_draft on public.app_activation_codes_batch(app_draft_id);
create index if not exists idx_activation_batch_plan on public.app_activation_codes_batch(plan_id);
create index if not exists idx_activation_codes_batch on public.app_activation_codes(batch_id);
create index if not exists idx_activation_codes_draft on public.app_activation_codes(app_draft_id);
create index if not exists idx_activation_codes_hash on public.app_activation_codes(code_hash);
create index if not exists idx_activation_codes_status on public.app_activation_codes(status);
