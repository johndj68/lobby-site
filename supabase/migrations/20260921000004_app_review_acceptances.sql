-- =============================================
-- App Review Acceptances & Submissions
-- =============================================

-- app_review_acceptances: track term acceptances
create table if not exists public.app_review_acceptances (
  id uuid primary key default gen_random_uuid(),
  app_draft_id uuid not null references public.app_drafts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Accepted declarations
  authorized_to_commercialize boolean default false,
  reviewed_app_info boolean default false,
  accepted_partner_terms boolean default false,
  accepted_commercial_terms boolean default false,

  -- Document references
  partner_terms_version text,
  commercial_terms_version text,

  -- Metadata
  accepted_at timestamptz default now(),
  ip_address text,
  user_agent text,

  constraint unique_acceptance_per_app unique (app_draft_id, user_id)
);

-- Update app_submissions with acceptance ref
alter table if exists public.app_submissions
  add column if not exists acceptance_id uuid references public.app_review_acceptances(id) on delete set null,
  add column if not exists created_by_version uuid,
  add column if not exists content_snapshot jsonb; -- Full snapshot of draft at submission time

-- Enable RLS
alter table public.app_review_acceptances enable row level security;

-- Policies: only owner/admin can view
create policy "View acceptances - owner"
  on public.app_review_acceptances for select
  using (
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
    or auth.jwt() ->> 'role' = 'admin'
  );

create policy "Create acceptance - owner only"
  on public.app_review_acceptances for insert
  with check (
    user_id = auth.uid()
    and app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
  );

create policy "Update acceptance - owner only"
  on public.app_review_acceptances for update
  using (
    user_id = auth.uid()
    and app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
  );

-- =============================================
-- Indexes
-- =============================================

create index if not exists idx_acceptances_app on public.app_review_acceptances(app_draft_id);
create index if not exists idx_acceptances_user on public.app_review_acceptances(user_id);
create index if not exists idx_acceptances_accepted_at on public.app_review_acceptances(accepted_at);
create index if not exists idx_submissions_acceptance on public.app_submissions(acceptance_id) where acceptance_id is not null;
