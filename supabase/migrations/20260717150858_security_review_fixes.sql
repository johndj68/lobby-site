-- Revisão de segurança dedicada (créditos, e-books pagos, projetos pagos,
-- chat) pedida depois de duas rodadas de bugs de RLS achados ao vivo esta
-- sessão. Três falhas confirmadas por exploit direto contra produção
-- antes deste fix (não só análise estática):
--
-- 1) CRÍTICO — ebook_purchases.user_insert_own_purchase só checava
--    user_id = auth.uid(), não o status. Qualquer cliente autenticado
--    conseguia inserir a própria linha já com status='paid' (sem pagar
--    nada) e, com isso, gerar signed URL do arquivo protegido —
--    acesso grátis a qualquer e-book pago. Confirmado via exploit real:
--    INSERT direto + createSignedUrl funcionaram os dois.
--    credit_purchases (escrita depois) já tinha "and status = 'pending'"
--    — essa tabela ficou pra trás por ter sido escrita antes desse
--    padrão existir.
--
-- 2) MÉDIO — get_or_create_wallet(p_user_id) é SECURITY DEFINER e nunca
--    foi revogada de authenticated/anon (diferente de add_credits, que já
--    tinha o revoke). Qualquer cliente podia chamar via RPC com o
--    user_id de outra pessoa e ler o saldo da carteira alheia
--    (bypass da RLS read_own_wallet). Confirmado: saldo da vítima vazou.
--
-- 3) MÉDIO — o trigger client_projects_prevent_credit_cost_escalation só
--    protegia credit_cost/allow_credit_payment, não credit_payment_status.
--    Qualquer técnico com UPDATE legítimo no projeto (todo membro de
--    equipe aceito, não só o líder) conseguia marcar
--    credit_payment_status='pago' direto, sem passar por
--    redeem_credits_for_project — o projeto ficava "pago" sem nenhum
--    crédito debitado do cliente. Confirmado: saldo da vítima não mudou,
--    status virou 'pago' mesmo assim.

-- ── Fix 1: ebook_purchases só aceita insert próprio como 'pending' ──────
drop policy if exists "user_insert_own_purchase" on public.ebook_purchases;
create policy "user_insert_own_purchase" on public.ebook_purchases for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- ── Fix 2: get_or_create_wallet nunca deveria ser chamável direto ──────
revoke execute on function public.get_or_create_wallet(uuid) from authenticated, anon;

-- ── Fix 3: trigger também protege credit_payment_status ────────────────
-- Problema à parte descoberto ao escrever este fix: redeem_credits_for_
-- project roda SECURITY DEFINER, mas isso NÃO muda auth.uid() dentro do
-- trigger — auth.uid() lê o JWT da sessão que originou a chamada (o
-- cliente), não o dono da função. Se o trigger só liberasse pra
-- is_leader(auth.uid()), a própria função de resgate ficaria bloqueada de
-- marcar o projeto como pago depois de debitar os créditos do cliente.
-- Fix: um GUC local à transação, setado só de dentro de
-- redeem_credits_for_project logo antes do UPDATE — um cliente comum não
-- tem como setar esse GUC direto (set_config não fica exposto como RPC
-- do PostgREST, só funções do schema public que criamos explicitamente).
create or replace function public.prevent_project_credit_cost_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_leader(auth.uid())
     and coalesce(current_setting('lobby.allow_credit_payment_status_change', true), 'false') <> 'true' then
    if new.credit_cost is distinct from old.credit_cost
       or new.allow_credit_payment is distinct from old.allow_credit_payment
       or new.credit_payment_status is distinct from old.credit_payment_status then
      raise exception 'Somente Técnico Líder pode alterar o pagamento deste projeto.';
    end if;
  end if;
  return new;
end;
$$;
-- trigger já existe (mesmo nome) apontando pra essa função — create or
-- replace function já é suficiente, não precisa recriar o trigger.

create or replace function public.redeem_credits_for_project(p_project_id uuid)
returns public.client_projects
language plpgsql
security definer set search_path = public
as $$
declare
  proj public.client_projects;
begin
  select * into proj from public.client_projects
    where id = p_project_id and client_id = auth.uid();
  if not found then
    raise exception 'Projeto não encontrado.';
  end if;
  if proj.allow_credit_payment is not true or proj.credit_cost is null then
    raise exception 'Este projeto não aceita pagamento com créditos.';
  end if;
  if proj.credit_payment_status = 'pago' then
    raise exception 'Este projeto já foi pago com créditos.';
  end if;

  perform public.spend_credits(
    proj.credit_cost, 'project_payment',
    'Pagamento do projeto "' || proj.title || '" com créditos',
    'client_projects', p_project_id
  );

  -- Escape hatch transacional — só essa função, nesse ponto exato, pode
  -- marcar credit_payment_status sem ser líder. set_config(..., true) é
  -- local à transação atual, some sozinho no commit/rollback.
  perform set_config('lobby.allow_credit_payment_status_change', 'true', true);

  update public.client_projects
    set credit_payment_status = 'pago', updated_at = now()
    where id = p_project_id
    returning * into proj;

  return proj;
end;
$$;
