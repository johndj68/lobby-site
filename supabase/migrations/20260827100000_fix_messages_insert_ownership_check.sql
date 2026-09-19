-- Bug encontrado por inspeção direta do banco (pg_policies), não visível só
-- lendo o SQL fonte com atenção superficial: a policy messages_insert
-- (20260715061134_chat_per_project.sql:51) tinha
--
--   exists (select 1 from public.client_projects cp
--           where cp.id = project_id and cp.client_id = client_id)
--
-- `client_id` do lado direito é ambíguo dentro do EXISTS — client_projects
-- também tem uma coluna client_id, e o Postgres resolve a referência não
-- qualificada pro escopo mais interno (cp.client_id), não pro
-- public.messages.client_id da linha sendo inserida, como o comentário da
-- migration original ("project_id precisa pertencer de fato ao client_id
-- informado") deixa claro que era a intenção. Resultado real, confirmado ao
-- vivo via pg_policies: `cp.client_id = cp.client_id` — tautologia, sempre
-- verdadeira pra qualquer projeto existente.
--
-- Impacto: um cliente autenticado insere mensagem com client_id = si mesmo
-- (isso continua obrigatório, checado em outra cláusula) mas project_id
-- apontando pro projeto de QUALQUER outro cliente — a checagem de posse do
-- projeto nunca de fato filtrava por dono. Não vaza mensagens de outros
-- clientes (SELECT continua corretamente restrito a client_id = auth.uid()
-- pro lado cliente), mas permite contaminar/injetar uma mensagem — com
-- client_id correto (o do atacante) mas project_id de um projeto alheio —
-- na thread que o técnico responsável por AQUELE projeto vê, sem qualquer
-- relação real com aquele projeto. Corrigido qualificando explicitamente
-- como public.messages.client_id (mesmo padrão já usado corretamente pra
-- project_id nesta mesma policy, algumas linhas abaixo).

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (project_id is null or exists (
      select 1 from public.client_projects cp
      where cp.id = project_id and cp.client_id = messages.client_id
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
