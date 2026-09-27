-- Etapa 2 do plano de evolução do financeiro (/admin/financeiro) — correções
-- de integridade/idempotência/permissão achadas na auditoria de schema real
-- (pg_dump --schema public, 2026-09-27). Não depende de nenhuma decisão
-- comercial (comissão, repasse, assinatura) — só fecha buracos confirmados
-- por leitura direta do DDL/RLS/corpo das funções, não por suposição.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) financial_transactions ganha referência de origem (source_type/source_id)
--
-- Achado: a tabela não tinha NENHUMA coluna ligando uma linha de volta ao
-- pedido que a gerou (credit_purchases/ebook_purchases/...) — só client_id
-- (usuário, não pedido) e texto livre em description. Impossível hoje
-- detectar duplicidade por identificador, só por coincidência de texto.
-- Aditivo: colunas nullable, não quebra nenhuma linha nem leitura existente.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.financial_transactions
  add column if not exists source_type text,
  add column if not exists source_id   uuid;

alter table public.financial_transactions
  add constraint financial_transactions_source_type_check
  check (source_type is null or source_type = any (array[
    'credit_purchases', 'ebook_purchases', 'client_projects', 'campaign_purchases'
  ]));

-- Uma linha financeira por pedido de origem — impede o mesmo
-- credit_purchases/ebook_purchases gerar 2 lançamentos (clique duplo,
-- redelivery de webhook processado por 2 caminhos, etc). Parcial: lançamentos
-- manuais sem origem (source_type/source_id nulos) continuam livres, como
-- sempre foram.
create unique index if not exists financial_transactions_source_unique_idx
  on public.financial_transactions (source_type, source_id)
  where source_type is not null and source_id is not null;

create index if not exists financial_transactions_source_idx
  on public.financial_transactions (source_type, source_id)
  where source_type is not null;

comment on column public.financial_transactions.source_type is
  'Tabela de origem do pedido que gerou este lançamento (credit_purchases/ebook_purchases/client_projects/campaign_purchases). Nulo = lançamento manual sem pedido vinculado.';
comment on column public.financial_transactions.source_id is
  'ID do registro de origem em source_type. Par (source_type, source_id) é único — evita lançamento duplicado pro mesmo pedido.';


-- ─────────────────────────────────────────────────────────────────────────
-- 2) confirm_credit_purchase_webhook passa a gravar a referência de origem
--
-- Mesma lógica de antes (idempotente via SELECT...FOR UPDATE + checagem de
-- status), só populando as colunas novas. Mantém o mesmo grant (já era
-- service_role-only, achado correto na auditoria).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.confirm_credit_purchase_webhook("p_purchase_id" uuid)
returns public.credit_purchases
language plpgsql security definer
set search_path to 'public'
as $$
declare
  purchase   public.credit_purchases;
  buyer_name text;
begin
  select * into purchase
    from public.credit_purchases
    where id = p_purchase_id
    for update;

  if not found then
    raise exception 'Compra não encontrada: %', p_purchase_id;
  end if;

  if purchase.status <> 'pending' then
    -- Idempotência: retorna sem erro se já confirmada (webhook retry)
    return purchase;
  end if;

  update public.credit_purchases
    set status    = 'paid',
        paid_at   = now(),
        updated_at = now()
    where id = p_purchase_id
    returning * into purchase;

  perform public.add_credits(
    purchase.user_id,
    purchase.credits_amount,
    'purchase',
    'Compra de créditos confirmada via Stripe',
    'credit_purchases',
    purchase.id,
    null   -- created_by: sem usuário humano no fluxo do webhook
  );

  select full_name into buyer_name
    from public.profiles where id = purchase.user_id;

  insert into public.financial_transactions
    (type, client_id, client_name, description, amount, status, sale_date, received_date,
     source_type, source_id)
  values
    ('creditos',
     purchase.user_id,
     coalesce(buyer_name, 'Cliente'),
     'Venda de créditos — ' || purchase.credits_amount || ' créditos (Stripe)',
     purchase.amount_paid,
     'pago',
     current_date,
     current_date,
     'credit_purchases',
     purchase.id)
  on conflict (source_type, source_id) where source_type is not null and source_id is not null
  do nothing;

  return purchase;
end;
$$;

-- Grant inalterado (já era service_role-only) — reafirmado por clareza.
revoke execute on function public.confirm_credit_purchase_webhook(uuid) from public, anon, authenticated;
grant execute on function public.confirm_credit_purchase_webhook(uuid) to service_role;


-- ─────────────────────────────────────────────────────────────────────────
-- 3) confirm_credit_purchase (confirmação MANUAL pelo líder) — fecha o
--    furo de "contornar webhook do Stripe"
--
-- Achado: a função confirmava e creditava sem checar se a compra tinha
-- nascido de um checkout Stripe de verdade. Hoje TODA compra de crédito
-- nasce em /api/stripe/checkout e recebe stripe_session_id nesse mesmo
-- fluxo — ou seja, qualquer compra com stripe_session_id preenchido só
-- pode ser confirmada pelo webhook real (confirm_credit_purchase_webhook),
-- nunca manualmente. Essa versão passa a:
--   a) bloquear a confirmação manual quando existe stripe_session_id;
--   b) exigir justificativa (p_notes) pro recebimento manual, como pede a
--      seção 5 (método/data/valor/referência/responsável/justificativa —
--      método e data aqui são sempre "confirmado agora"/hoje, igual ao
--      comportamento anterior; referência é opcional, justificativa não);
--   c) gravar source_type/source_id.
--
-- Muda a assinatura (novos parâmetros) — precisa DROP antes do CREATE
-- porque Postgres não substitui uma função por outra com lista de
-- parâmetros diferente via CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.confirm_credit_purchase(uuid);

create function public.confirm_credit_purchase(
  "p_purchase_id"      uuid,
  "p_payment_reference" text default null,
  "p_notes"             text default null
)
returns public.credit_purchases
language plpgsql security definer
set search_path to 'public'
as $$
declare
  purchase   public.credit_purchases;
  buyer_name text;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode confirmar pagamento de créditos.';
  end if;

  select * into purchase from public.credit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  if purchase.status <> 'pending' then
    raise exception 'Esta compra já foi processada.';
  end if;

  if purchase.stripe_session_id is not null then
    raise exception 'Esta compra foi iniciada via Stripe Checkout — não pode ser confirmada manualmente. Se o pagamento foi feito e os créditos não caíram, verifique o evento no Stripe Dashboard (Developers → Webhooks) e reenvie a entrega do evento por lá. Esta ação existe só para recebimento genuinamente fora do Stripe.';
  end if;

  if p_notes is null or length(trim(p_notes)) = 0 then
    raise exception 'Informe a justificativa do recebimento manual.';
  end if;

  update public.credit_purchases
    set status            = 'paid',
        paid_at           = now(),
        updated_at        = now(),
        payment_provider  = coalesce(payment_provider, 'manual'),
        payment_reference = coalesce(p_payment_reference, payment_reference)
    where id = p_purchase_id
    returning * into purchase;

  perform public.add_credits(
    purchase.user_id, purchase.credits_amount, 'purchase',
    'Compra de créditos confirmada manualmente', 'credit_purchases', purchase.id, auth.uid()
  );

  select full_name into buyer_name from public.profiles where id = purchase.user_id;

  insert into public.financial_transactions
    (type, client_id, client_name, description, amount, status, sale_date, received_date,
     responsible_user_id, notes, source_type, source_id)
  values
    ('creditos', purchase.user_id, buyer_name,
     'Venda de créditos — ' || purchase.credits_amount || ' créditos',
     purchase.amount_paid, 'pago', current_date, current_date, auth.uid(), p_notes,
     'credit_purchases', purchase.id)
  on conflict (source_type, source_id) where source_type is not null and source_id is not null
  do nothing;

  return purchase;
end;
$$;

revoke execute on function public.confirm_credit_purchase(uuid, text, text) from public, anon, authenticated;
grant execute on function public.confirm_credit_purchase(uuid, text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 4) confirm_ebook_purchase_manual — nova RPC, substitui as 2 escritas
--    soltas e não-atômicas do FinanceiroClient.tsx (UPDATE ebook_purchases
--    + INSERT financial_transactions em duas chamadas client-side
--    separadas, sem lock, sem transação — se a segunda falhasse o e-book
--    já tinha sido liberado sem lançamento correspondente).
--
-- Atômica (uma função = uma transação), com FOR UPDATE (idempotente contra
-- clique duplo/duas abas — 2ª chamada acha status='paid' e falha limpo,
-- sem duplicar nada), exige método+data+justificativa (seção 5), e grava
-- source_type/source_id.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.confirm_ebook_purchase_manual(
  "p_purchase_id"      uuid,
  "p_payment_method"    text,
  "p_received_date"     date,
  "p_payment_reference" text default null,
  "p_notes"             text default null
)
returns public.financial_transactions
language plpgsql security definer
set search_path to 'public'
as $$
declare
  purchase    public.ebook_purchases;
  ebook_title text;
  buyer_name  text;
  tx          public.financial_transactions;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode confirmar pagamento de e-book.';
  end if;

  select * into purchase from public.ebook_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  if purchase.status <> 'pending' then
    raise exception 'Esta compra já foi processada.';
  end if;

  if p_payment_method is null or p_payment_method not in
     ('pix', 'cartao', 'boleto', 'dinheiro', 'transferencia', 'outro') then
    raise exception 'Informe uma forma de pagamento válida.';
  end if;
  if p_received_date is null then
    raise exception 'Informe a data de recebimento.';
  end if;
  if p_notes is null or length(trim(p_notes)) = 0 then
    raise exception 'Informe a justificativa do recebimento manual.';
  end if;

  update public.ebook_purchases
    set status            = 'paid',
        paid_at           = now(),
        payment_provider  = 'manual',
        payment_reference = p_payment_reference
    where id = p_purchase_id
    returning * into purchase;

  select title      into ebook_title from public.resource_metadata where id = purchase.ebook_id;
  select full_name  into buyer_name  from public.profiles          where id = purchase.user_id;

  insert into public.financial_transactions
    (type, client_id, client_name, description, amount, status, payment_method,
     sale_date, received_date, responsible_user_id, notes, source_type, source_id)
  values
    ('ebook', purchase.user_id, coalesce(buyer_name, 'Cliente'),
     'E-book: ' || coalesce(ebook_title, '—'),
     purchase.amount, 'pago', p_payment_method,
     current_date, p_received_date, auth.uid(), p_notes,
     'ebook_purchases', purchase.id)
  returning * into tx;

  return tx;
end;
$$;

revoke execute on function public.confirm_ebook_purchase_manual(uuid, text, date, text, text) from public, anon, authenticated;
grant execute on function public.confirm_ebook_purchase_manual(uuid, text, date, text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 5) reserve_ad_capacity / confirm_ad_reservation — fecha grant público
--
-- Achado: GRANT ALL pra anon/authenticated (visível no dump) e nenhum
-- REVOKE FROM PUBLIC (o grant implícito que toda function nova recebe na
-- criação, invisível em dumps de GRANT explícito — mesma classe de bug já
-- corrigida 3x neste projeto: 20260826120000, 20260827110000). Os dois
-- corpos não fazem NENHUMA checagem de auth.uid()/is_leader/is_technician
-- internamente — dependiam 100% do grant pra segurança, e o grant estava
-- aberto. Confirmado por leitura de todos os 4 call sites no código
-- (app/api/campaigns/[campaignId]/checkout, app/api/admin/campaigns/
-- [campaignId]/{reserve,reschedule}, lib/services/campaigns.ts): os 4 usam
-- exclusivamente o client admin (service_role) — nenhum client-side chama
-- essas RPCs direto hoje, então travar pra service_role-only não quebra
-- nada em uso real, só fecha a porta que nunca deveria ter ficado aberta.
-- ─────────────────────────────────────────────────────────────────────────

revoke execute on function public.reserve_ad_capacity(uuid, uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ad_capacity(uuid, uuid, timestamptz, timestamptz, integer)
  to service_role;

revoke execute on function public.confirm_ad_reservation(uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_ad_reservation(uuid)
  to service_role;


-- ─────────────────────────────────────────────────────────────────────────
-- 6) webhook_queue — remove exposição a anon/authenticated
--
-- Achado: GRANT ALL pra anon/authenticated e RLS desligado nessa tabela.
-- O código-fonte que a usava (lib/webhook-queue.ts) foi removido nesta
-- mesma etapa (era uma fila que nunca era populada — enqueueWebhookJob
-- nunca era chamado — e o "retry" só marcava o job como concluído sem
-- reprocessar nada; ver app/api/stripe/webhook/route.ts, que agora deixa
-- o retry nativo do Stripe cuidar disso). A tabela fica no banco (histórico
-- de quem já rodou o cron antigo não é apagado), só trava o acesso.
-- ─────────────────────────────────────────────────────────────────────────

revoke all on table public.webhook_queue from public, anon, authenticated;
grant all on table public.webhook_queue to service_role;

alter table public.webhook_queue enable row level security;
-- Sem nenhuma policy: default-deny pra anon/authenticated mesmo que algum
-- grant futuro reabra acesso por engano (mesmo padrão já usado em ad_events).
