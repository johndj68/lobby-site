create table response_templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  subject    text not null,
  body       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table response_templates enable row level security;

create policy "response_templates_select_technician" on response_templates for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician'));
create policy "response_templates_insert_leader" on response_templates for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true));
create policy "response_templates_update_leader" on response_templates for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true));
create policy "response_templates_delete_leader" on response_templates for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician' and p.is_leader = true));

insert into response_templates (title, subject, body, sort_order) values
  ('Solicitar mais informações', 'Retorno sobre sua solicitação - LOBBY', 'Olá, {{nome}}. Recebemos sua solicitação e, para darmos o próximo passo, precisamos de mais algumas informações...', 0),
  ('Agendar diagnóstico', 'Retorno sobre sua solicitação - LOBBY', 'Olá, {{nome}}. Recebemos sua solicitação e gostaríamos de agendar um diagnóstico gratuito...', 1),
  ('Enviar proposta inicial', 'Retorno sobre sua solicitação - LOBBY', 'Olá, {{nome}}. Recebemos sua solicitação e preparamos uma proposta inicial com base no que você descreveu...', 2),
  ('Informar que está em análise', 'Retorno sobre sua solicitação - LOBBY', 'Olá, {{nome}}. Recebemos sua solicitação e nosso time já está avaliando os detalhes. Em breve retornaremos.', 3);

create table contact_responses (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  technician_id uuid references profiles(id) on delete set null,
  subject       text not null,
  message       text not null,
  is_draft      boolean not null default false,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index contact_responses_contact_id_idx on contact_responses(contact_id);
alter table contact_responses enable row level security;

create policy "contact_responses_select_technician" on contact_responses for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician'));
create policy "contact_responses_insert_technician" on contact_responses for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'technician') and technician_id = auth.uid());
create policy "contact_responses_update_own" on contact_responses for update
  using (technician_id = auth.uid()) with check (technician_id = auth.uid());
create policy "contact_responses_delete_own_draft" on contact_responses for delete
  using (technician_id = auth.uid() and is_draft = true);
