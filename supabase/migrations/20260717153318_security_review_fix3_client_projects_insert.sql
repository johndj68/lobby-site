-- Continuação da revisão de segurança. Achado por varredura estática +
-- confirmado ao vivo: dois gaps em client_projects que a mesma classe de
-- bug já corrigida hoje (ownership-only check, sem checar o valor da
-- coluna sensível) também atinge.
--
-- C1 — client_insert_own só checa client_id = auth.uid(), e o trigger
-- prevent_project_credit_cost_escalation só era "before update", nunca
-- "before insert". Um cliente insere a própria linha já com
-- credit_payment_status='pago' + allow_credit_payment=true direto — sem
-- nunca chamar redeem_credits_for_project nem ter crédito debitado.
-- Confirmado por exploit: INSERT com credit_payment_status='pago' foi
-- aceito sem erro.
--
-- C2 — client_projects_update_own também só checa client_id = auth.uid(),
-- sem restringir QUAL coluna muda. Um cliente reescreve status, progress,
-- priority e lead_technician_id do próprio projeto direto (ex.: marcar
-- como 'concluido', pular fila com 'urgente', ou reatribuir o técnico
-- responsável pra qualquer id). Confirmado por exploit: UPDATE desses 4
-- campos foi aceito sem erro. Levantamento em app/dashboard/projetos/**
-- confirma que o fluxo legítimo do cliente só grava esses 4 campos como
-- valores fixos no insert (status='solicitado', progress=0,
-- priority='normal', sem lead_technician_id) e só atualiza a coluna
-- client_progress (jsonb) depois — nunca essas 4 colunas via update.

-- ── Fix C1: cobre insert também, mesma lógica de leader-only ───────────
drop trigger if exists client_projects_prevent_credit_cost_escalation on public.client_projects;
create or replace function public.prevent_project_credit_cost_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_leader(auth.uid())
     and coalesce(current_setting('lobby.allow_credit_payment_status_change', true), 'false') <> 'true' then
    if tg_op = 'INSERT' then
      if new.credit_cost is not null
         or new.allow_credit_payment is true
         or new.credit_payment_status <> 'nao_aplicavel' then
        raise exception 'Somente Técnico Líder pode definir pagamento com créditos neste projeto.';
      end if;
    else
      if new.credit_cost is distinct from old.credit_cost
         or new.allow_credit_payment is distinct from old.allow_credit_payment
         or new.credit_payment_status is distinct from old.credit_payment_status then
        raise exception 'Somente Técnico Líder pode alterar o pagamento deste projeto.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger client_projects_prevent_credit_cost_escalation
  before insert or update on public.client_projects
  for each row execute function public.prevent_project_credit_cost_escalation();

-- ── Fix C2: campos de workflow (status/progress/priority/técnico) só
-- mudam por técnico — cliente só grava os valores padrão no insert e nunca
-- muda esses campos depois (só client_progress, que fica fora deste
-- trigger).
create or replace function public.prevent_client_projects_workflow_tampering()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_technician(auth.uid()) then
    if tg_op = 'INSERT' then
      if new.status <> 'solicitado' or new.progress <> 0 or new.priority <> 'normal'
         or new.lead_technician_id is not null then
        raise exception 'Não é permitido definir status, progresso, prioridade ou técnico responsável na criação do projeto.';
      end if;
    else
      if new.status is distinct from old.status
         or new.progress is distinct from old.progress
         or new.priority is distinct from old.priority
         or new.lead_technician_id is distinct from old.lead_technician_id then
        raise exception 'Somente um técnico pode alterar status, progresso, prioridade ou técnico responsável deste projeto.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists client_projects_prevent_workflow_tampering on public.client_projects;
create trigger client_projects_prevent_workflow_tampering
  before insert or update on public.client_projects
  for each row execute function public.prevent_client_projects_workflow_tampering();
