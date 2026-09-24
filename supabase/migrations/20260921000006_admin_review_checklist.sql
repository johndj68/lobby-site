-- Add review checklist and notes fields
alter table if exists public.app_submissions
  add column if not exists checklist jsonb default '{}',
  add column if not exists draft_message text,
  add column if not exists draft_internal_notes text,
  add column if not exists published_at timestamptz,
  add column if not exists published_version uuid;

-- Create review checklist items table
create table if not exists public.review_checklist_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.app_submissions(id) on delete cascade,

  section text not null, -- 'basic_info', 'media', 'offer', 'activation', 'company'
  item_key text not null,
  item_label text not null,
  item_description text,

  status text default 'not_reviewed', -- 'not_reviewed', 'checked', 'adjustment_needed', 'not_applicable'
  note text,
  blocked boolean default false,

  marked_by uuid references auth.users(id) on delete set null,
  marked_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint unique_checklist_item unique (submission_id, section, item_key)
);

-- Review decisions/issues table
create table if not exists public.review_issues (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.app_submissions(id) on delete cascade,

  section text not null,
  field text,
  severity text, -- 'blocker', 'warning'
  message text not null,
  guidance text,

  resolved_at timestamptz,
  resolution_note text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),

  constraint unique_issue unique (submission_id, section, field)
);

-- Enable RLS
alter table public.review_checklist_items enable row level security;
alter table public.review_issues enable row level security;

-- Policies: admin only
create policy "admin_view_checklist" on public.review_checklist_items for select
  using (auth.jwt() ->> 'role' = 'admin');

create policy "admin_manage_checklist" on public.review_checklist_items for insert
  with check (auth.jwt() ->> 'role' = 'admin');

create policy "admin_update_checklist" on public.review_checklist_items for update
  using (auth.jwt() ->> 'role' = 'admin');

create policy "admin_view_issues" on public.review_issues for select
  using (auth.jwt() ->> 'role' = 'admin');

create policy "admin_manage_issues" on public.review_issues for insert
  with check (auth.jwt() ->> 'role' = 'admin');

create policy "admin_update_issues" on public.review_issues for update
  using (auth.jwt() ->> 'role' = 'admin');

-- Indexes
create index if not exists idx_checklist_submission on public.review_checklist_items(submission_id);
create index if not exists idx_issues_submission on public.review_issues(submission_id);
create index if not exists idx_submissions_published on public.app_submissions(published_at);
