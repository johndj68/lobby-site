-- Syncs profiles.role → auth.users.raw_app_meta_data so the role is available
-- in the JWT `app_metadata` claim without an extra DB round-trip per request.
--
-- Next.js API routes can then read `user.app_metadata.role` instead of querying
-- the profiles table a second time after auth.getUser().

create or replace function public.sync_profile_role_to_jwt()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', new.role)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_role_to_jwt on public.profiles;
create trigger sync_role_to_jwt
  after insert or update of role on public.profiles
  for each row
  execute function public.sync_profile_role_to_jwt();

-- Backfill: sync role for all existing users so JWT claims are up to date
-- immediately after this migration runs.
do $$
begin
  update auth.users u
  set raw_app_meta_data =
    coalesce(u.raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', p.role)
  from public.profiles p
  where p.id = u.id
    and p.role is not null;
end;
$$;
