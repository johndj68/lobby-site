-- =============================================
-- Developer Marketplace: Apps, Drafts, Submissions
-- =============================================

-- app_drafts: in-progress app registrations by individual developers
create table if not exists public.app_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,

  -- Stage 1: Basic info
  name text,
  website_url text,

  -- Stage 2: Product details
  short_description text,
  full_description text,
  logo_url text,
  category text,
  target_audience text,
  languages text[], -- array: ['en', 'pt', 'es']

  -- Features & benefits
  features jsonb, -- [{name, description}]
  benefits jsonb, -- [{icon, title, description}]
  integrations jsonb, -- [{name, url}]
  platforms text[], -- ['web', 'ios', 'android']
  requirements text,

  -- Media
  media_gallery jsonb, -- [{url, alt_text, type: 'screenshot'|'video'}]
  video_url text,

  -- Support
  support_email text,
  documentation_url text,
  setup_instructions text,

  -- Metadata
  stage integer default 1, -- 1-4
  status text default 'draft', -- draft, submitted, under_review, changes_requested, approved, published
  last_edited_at timestamptz default now(),
  created_at timestamptz default now(),

  constraint valid_stage check (stage >= 1 and stage <= 4),
  constraint valid_status check (status in ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'published'))
);

-- app_submissions: versions sent for review
create table if not exists public.app_submissions (
  id uuid primary key default gen_random_uuid(),
  app_draft_id uuid not null references public.app_drafts(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete set null,

  -- Snapshot of data when submitted
  data jsonb not null, -- full draft snapshot

  -- Review process
  status text default 'pending', -- pending, approved, rejected, changes_requested
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_notes text,
  public_feedback text, -- visible to developer
  internal_notes text, -- admin only

  -- Timeline
  submitted_at timestamptz default now(),
  reviewed_at timestamptz,

  constraint valid_submission_status check (status in ('pending', 'approved', 'rejected', 'changes_requested'))
);

-- app_plans: pricing tiers for each draft
create table if not exists public.app_plans (
  id uuid primary key default gen_random_uuid(),
  app_draft_id uuid not null references public.app_drafts(id) on delete cascade,

  name text not null,
  currency text default 'BRL',
  price numeric(10, 2),
  billing_period text, -- 'one-time', 'monthly', 'yearly', 'lifetime'

  features text[], -- array of feature names
  limits jsonb, -- {key: value, ...}
  users_limit integer,
  support_level text,

  activation_method text, -- 'manual', 'api', 'oauth', 'saas'
  activation_instructions text,

  display_order integer default 0,
  created_at timestamptz default now(),

  constraint valid_billing_period check (billing_period in ('one-time', 'monthly', 'yearly', 'lifetime'))
);

-- app_review_checklist: admin review items
create table if not exists public.app_review_checklist (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.app_submissions(id) on delete cascade,

  category text not null, -- 'functionality', 'images', 'identity', 'support', 'pricing'
  item text not null,
  checked boolean default false,
  notes text,

  created_at timestamptz default now()
);

-- =============================================
-- Row Level Security
-- =============================================

alter table public.app_drafts enable row level security;
alter table public.app_submissions enable row level security;
alter table public.app_review_checklist enable row level security;
alter table public.app_plans enable row level security;

-- app_drafts: developer sees own drafts
create policy "Developers view own drafts"
  on public.app_drafts for select
  using (created_by = auth.uid());

create policy "Developers insert own drafts"
  on public.app_drafts for insert
  with check (created_by = auth.uid());

create policy "Developers update own drafts"
  on public.app_drafts for update
  using (created_by = auth.uid());

create policy "Admins manage all drafts"
  on public.app_drafts
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

-- app_submissions: developers see own, admins see all
create policy "Developers view own submissions"
  on public.app_submissions for select
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
    or auth.jwt() ->> 'role' = 'admin'
  );

create policy "Only developers submit"
  on public.app_submissions for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
  );

create policy "Admins manage submissions"
  on public.app_submissions
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

-- app_review_checklist: admin only
create policy "Only admins manage checklists"
  on public.app_review_checklist
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

-- app_plans: developers see own, admins see all
create policy "Developers view own plans"
  on public.app_plans for select
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
  );

create policy "Developers manage own plans"
  on public.app_plans for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
  );

create policy "Developers update own plans"
  on public.app_plans for update
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
  );

create policy "Developers delete own plans"
  on public.app_plans for delete
  using (
    app_draft_id in (
      select id from public.app_drafts
      where created_by = auth.uid()
    )
  );

-- =============================================
-- Indexes
-- =============================================

create index if not exists idx_app_drafts_created_by on public.app_drafts(created_by);
create index if not exists idx_app_drafts_status on public.app_drafts(status);
create index if not exists idx_app_drafts_stage on public.app_drafts(stage);

create index if not exists idx_app_submissions_draft_id on public.app_submissions(app_draft_id);
create index if not exists idx_app_submissions_status on public.app_submissions(status);
create index if not exists idx_app_submissions_submitted_at on public.app_submissions(submitted_at);
create index if not exists idx_app_submissions_reviewer_id on public.app_submissions(reviewer_id);

create index if not exists idx_app_plans_draft_id on public.app_plans(app_draft_id);

create index if not exists idx_app_review_checklist_submission_id on public.app_review_checklist(submission_id);
