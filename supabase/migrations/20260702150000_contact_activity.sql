create table contact_activity (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  technician_id uuid references profiles(id) on delete set null,
  action        text not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index contact_activity_contact_id_idx on contact_activity(contact_id);
alter table contact_activity enable row level security;

create policy "contact_activity_select_technician" on contact_activity for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician'));
create policy "contact_activity_insert_technician" on contact_activity for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician') and technician_id = auth.uid());
