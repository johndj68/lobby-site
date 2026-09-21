-- Add reviewer fields to app_submissions
alter table if exists public.app_submissions
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null,
  add column if not exists reviewer_notes text,
  add column if not exists public_feedback text,
  add column if not exists internal_notes text,
  add column if not exists reviewed_at timestamptz;

-- Index for admin queries
create index if not exists idx_submissions_status on public.app_submissions(status);
create index if not exists idx_submissions_reviewed_at on public.app_submissions(reviewed_at);
create index if not exists idx_submissions_reviewer on public.app_submissions(reviewer_id);
