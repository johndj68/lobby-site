-- =============================================
-- App Team Invitations & Members
-- =============================================

-- app_team_invitations: pending invites to join app team
create table if not exists public.app_team_invitations (
  id uuid primary key default gen_random_uuid(),
  app_draft_id uuid not null references public.app_drafts(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,

  invited_email text not null,
  invited_name text not null,

  -- Scope
  scope text default 'app' check (scope in ('app', 'organization')),

  -- Permissions (jsonb array of permission names)
  permissions text[] default '{}',

  -- Token-based acceptance
  token text not null unique,
  token_hash text not null unique,
  expires_at timestamptz not null,

  -- State
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,

  -- Metadata
  created_at timestamptz default now(),
  sent_at timestamptz
);

-- app_team_members: accepted team members
create table if not exists public.app_team_members (
  id uuid primary key default gen_random_uuid(),
  app_draft_id uuid not null references public.app_drafts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Role: "member" or "owner"
  role text default 'member' check (role in ('member', 'owner')),

  -- Permissions
  permissions text[] default '{}',

  -- Scope
  scope text default 'app' check (scope in ('app', 'organization')),

  -- Metadata
  joined_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint unique_member_per_app unique (app_draft_id, user_id)
);

-- =============================================
-- RLS Policies
-- =============================================

alter table public.app_team_invitations enable row level security;
alter table public.app_team_members enable row level security;

-- Invitations: only app owner/members can view/manage
create policy "View invitations - owner and members"
  on public.app_team_invitations for select
  using (
    -- App owner
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
    -- Or existing member
    or app_draft_id in (
      select app_draft_id from public.app_team_members where user_id = auth.uid()
    )
  );

create policy "Create invitation - owner only"
  on public.app_team_invitations for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
  );

create policy "Update invitation - owner only"
  on public.app_team_invitations for update
  using (
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
  );

create policy "Delete invitation - owner only"
  on public.app_team_invitations for delete
  using (
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
  );

-- Members: owner and members can view
create policy "View members - owner and team"
  on public.app_team_members for select
  using (
    -- App owner
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
    -- Or existing member
    or app_draft_id in (
      select app_draft_id from public.app_team_members where user_id = auth.uid()
    )
  );

create policy "Create member - owner only"
  on public.app_team_members for insert
  with check (
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
  );

create policy "Update member permissions - owner only"
  on public.app_team_members for update
  using (
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
  );

create policy "Delete member - owner only"
  on public.app_team_members for delete
  using (
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
  );

-- =============================================
-- Indexes
-- =============================================

create index if not exists idx_app_team_inv_app on public.app_team_invitations(app_draft_id);
create index if not exists idx_app_team_inv_email on public.app_team_invitations(invited_email);
create index if not exists idx_app_team_inv_status on public.app_team_invitations(status);
create index if not exists idx_app_team_inv_token_hash on public.app_team_invitations(token_hash);
create index if not exists idx_app_team_inv_expires on public.app_team_invitations(expires_at);

create index if not exists idx_app_team_mem_app on public.app_team_members(app_draft_id);
create index if not exists idx_app_team_mem_user on public.app_team_members(user_id);
