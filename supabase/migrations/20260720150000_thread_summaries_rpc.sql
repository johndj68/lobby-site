-- Returns one row per (client_id, project_id) thread: the last message preview
-- plus the unread count and denormalized client/project names.
-- Used by the admin messages inbox to avoid loading all messages at startup.
--
-- SECURITY DEFINER is intentional: technicians are verified in the calling
-- route handler; this bypasses RLS so we can count unread across all threads.

create or replace function public.get_thread_summaries()
returns table (
  client_id         uuid,
  project_id        uuid,
  client_name       text,
  client_email      text,
  client_company    text,
  project_title     text,
  last_content      text,
  last_at           timestamptz,
  last_sender_role  text,
  unread_count      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (m.client_id, m.project_id)
      m.client_id,
      m.project_id,
      m.content,
      m.created_at,
      m.sender_role
    from public.messages m
    order by m.client_id, m.project_id, m.created_at desc
  ),
  unread_counts as (
    select
      m.client_id,
      m.project_id,
      count(*) as cnt
    from public.messages m
    where m.sender_role = 'client'
      and m.read_at is null
    group by m.client_id, m.project_id
  )
  select
    l.client_id,
    l.project_id,
    p.full_name                     as client_name,
    p.email                         as client_email,
    p.company_name                  as client_company,
    cp.title                        as project_title,
    l.content                       as last_content,
    l.created_at                    as last_at,
    l.sender_role                   as last_sender_role,
    coalesce(u.cnt, 0)              as unread_count
  from latest l
  left join public.profiles p
    on p.id = l.client_id
  left join public.client_projects cp
    on cp.id = l.project_id
  left join unread_counts u
    on  u.client_id  = l.client_id
    and u.project_id is not distinct from l.project_id
  order by l.created_at desc;
$$;

grant execute on function public.get_thread_summaries() to authenticated;
