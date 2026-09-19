-- Chat estruturado por projeto — antes era um único fluxo de mensagens
-- por cliente (client_id), sem noção de "sobre qual projeto" nem de qual
-- técnico é responsável. Além de confuso pro cliente (não sabia quem
-- estava respondendo), a RLS anterior já tinha uma tentativa quebrada de
-- isolar por técnico (technician_id is null or = auth.uid()) que escondia
-- as respostas de OUTROS técnicos até de quem só estava tentando ajudar,
-- sem de fato impedir qualquer um de responder qualquer cliente.
--
-- Novo modelo: project_id nulo = "conversa geral" (suporte, sem projeto
-- específico) — qualquer técnico pode ver/participar, cobre o caso de
-- "técnico inicia papo com qualquer cliente". project_id preenchido =
-- conversa do projeto — só o líder técnico e o lead_technician_id
-- daquele projeto (quem "aceitou" e é responsável) participam.

alter table public.messages
  add column if not exists project_id uuid references public.client_projects(id) on delete cascade;

create index if not exists messages_project_idx on public.messages (project_id, created_at);
create index if not exists messages_client_idx  on public.messages (client_id, created_at);

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select
  to authenticated
  using (
    client_id = auth.uid()
    or (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
      and (
        project_id is null
        or public.is_leader(auth.uid())
        or exists (
          select 1 from public.client_projects cp
          where cp.id = messages.project_id and cp.lead_technician_id = auth.uid()
        )
      )
    )
  );

-- sender_role já é amarrado à role real do autor (não confia em valor
-- vindo do cliente): branch 'client' exige client_id = auth.uid(), branch
-- 'technician' exige profiles.role = 'technician' pra quem está enviando.
-- Além disso, se project_id vier preenchido, precisa: (a) pertencer de
-- fato ao client_id informado, e (b) só líder ou o técnico responsável
-- por aquele projeto específico pode escrever nele.
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (project_id is null or exists (
      select 1 from public.client_projects cp where cp.id = project_id and cp.client_id = client_id
    ))
    and (
      (client_id = auth.uid() and sender_role = 'client' and technician_id is null)
      or (
        sender_role = 'technician' and technician_id = auth.uid()
        and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
        and (
          project_id is null
          or public.is_leader(auth.uid())
          or exists (
            select 1 from public.client_projects cp where cp.id = project_id and cp.lead_technician_id = auth.uid()
          )
        )
      )
    )
  );

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages for update
  to authenticated
  using (
    client_id = auth.uid()
    or (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
      and (
        project_id is null
        or public.is_leader(auth.uid())
        or exists (
          select 1 from public.client_projects cp
          where cp.id = messages.project_id and cp.lead_technician_id = auth.uid()
        )
      )
    )
  )
  with check (
    client_id = auth.uid()
    or (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'technician')
      and (
        project_id is null
        or public.is_leader(auth.uid())
        or exists (
          select 1 from public.client_projects cp
          where cp.id = messages.project_id and cp.lead_technician_id = auth.uid()
        )
      )
    )
  );
