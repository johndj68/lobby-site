-- Reformulação da aba "Repasses e extrato" do parceiro — adiciona só o que
-- faltava pro backend real sustentar a tela (nada retroativo, nada
-- recalculado com regra nova, nenhuma carteira paralela):
--
--   1) partner_payouts ganha destination_snapshot — hoje não existe nenhum
--      registro de PARA ONDE o repasse foi, só `reference` (texto livre
--      que o líder digita). Sem isso, a tela não tem como mostrar "destino
--      mascarado" sem inventar ou ler a config ATUAL do parceiro (errado:
--      a config pode ter mudado depois do repasse — ver nota em
--      create_partner_payout abaixo). Snapshot gravado no momento da
--      criação, igual reserve_amount/retention_days já fazem.
--
--   2) get_partner_payout_history ganha destination_snapshot, application_id
--      e sale_id (pra filtro por app e link "Ver origem" até a venda).
--      Assinatura muda → precisa de DROP antes do CREATE (mesmo motivo já
--      documentado em 20260930120000/20261004100000).
--
--   3) get_partner_statement / get_partner_statement_count — o "Extrato de
--      movimentações" (seção 11 do pedido) não existe hoje. São uma
--      PROJEÇÃO sobre app_purchases/subscription_invoices/partner_payouts/
--      partner_payout_items/payment_disputes — nenhuma tabela de livro
--      financeiro nova. Cada evento vem de uma coluna de data real já
--      existente (paid_at, refunded_at, created_at, reverted_at,
--      payment_disputes.closed_at) ou de uma data 100% determinística
--      (paid_at + retention_days/reserve_window_days) — nunca um evento
--      "liberado" fica marcado antes da data calculada ter passado.
--
--      Importante sobre "saldo afetado": neste modelo, reserva de disputa
--      NUNCA passa pelo saldo "disponível" — create_partner_payout libera
--      (reserve_status held→released) e já cria o item de repasse
--      CONFIRMADO no mesmo instante (não existe estado intermediário "em
--      processamento" nesta base — ver 20260927200000_repasse_parceiro.sql,
--      comentário de topo). Por isso só 2 tipos de evento alteram o saldo
--      disponível: retenção liberada (+) e repasse concluído/revertido da
--      fatia principal ou de assinatura (−/+). Eventos de reserva, venda e
--      reembolso aparecem no extrato (auditoria completa) mas com
--      saldo_disponivel_delta = 0, porque de fato não mexem nesse saldo
--      específico — documentado na comment da função, não escondido.
--
--      Saldo corrente calculado com window function sobre TODO o conjunto
--      (nunca só a página/filtro visível) — filtro de app é aplicado DEPOIS
--      do cálculo do saldo, pra nunca produzir um "saldo de app" fictício
--      (pedido explícito, seção 11).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) destination_snapshot
-- ─────────────────────────────────────────────────────────────────────────

alter table public.partner_payouts
  add column if not exists destination_snapshot text;

comment on column public.partner_payouts.destination_snapshot is
  'Destino mascarado (ex.: "PIX ••••1234"), capturado de profiles.payout_pix_key no momento da criação do repasse — nunca a config atual. Repasses anteriores a esta coluna ficam null (mostrar "—", nunca inventar). Puramente informativo, igual payout_pix_key — ninguém chama API de banco com isso.';

create or replace function public.create_partner_payout(
  "p_partner_id"                uuid,
  "p_app_purchase_ids"          uuid[],
  "p_reference"                 text,
  "p_notes"                     text default null,
  "p_subscription_invoice_ids"  uuid[] default null,
  "p_reserve_app_purchase_ids"  uuid[] default null
)
returns public.partner_payouts
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_payout              public.partner_payouts;
  v_total                numeric(12,2) := 0;
  v_app_valid_count      integer := 0;
  v_app_requested        integer := coalesce(array_length(p_app_purchase_ids, 1), 0);
  v_sub_valid_count      integer := 0;
  v_sub_requested        integer := coalesce(array_length(p_subscription_invoice_ids, 1), 0);
  v_reserve_valid_count  integer := 0;
  v_reserve_requested    integer := coalesce(array_length(p_reserve_app_purchase_ids, 1), 0);
  v_app_total            numeric(12,2) := 0;
  v_sub_total             numeric(12,2) := 0;
  v_reserve_total         numeric(12,2) := 0;
  v_pix_key               text;
  v_destination_snapshot  text;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode registrar repasse.';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'Informe a referência/comprovante do repasse.';
  end if;
  if v_app_requested = 0 and v_sub_requested = 0 and v_reserve_requested = 0 then
    raise exception 'Selecione ao menos uma venda ou fatura de assinatura pra repassar.';
  end if;

  if v_app_requested > 0 then
    perform 1 from public.app_purchases where id = any(p_app_purchase_ids) for update;

    select count(*), coalesce(sum(
        (ap.partner_amount - ap.reserve_amount)
          - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2)
      ), 0)
      into v_app_valid_count, v_app_total
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids)
      and ap.partner_id = p_partner_id
      and ap.status = 'paid'
      and ap.paid_at is not null
      and ap.paid_at <= now() - (ap.retention_days || ' days')::interval
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'main' and po.status = 'confirmado'
      );

    if v_app_valid_count <> v_app_requested then
      raise exception 'Uma ou mais vendas não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção, ou não são deste parceiro).';
    end if;
  end if;

  if v_sub_requested > 0 then
    perform 1 from public.subscription_invoices where id = any(p_subscription_invoice_ids) for update;

    select count(*), coalesce(sum(si.partner_amount), 0)
      into v_sub_valid_count, v_sub_total
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    where si.id = any(p_subscription_invoice_ids)
      and s.partner_id = p_partner_id
      and si.paid_at <= now() - interval '16 days'
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.subscription_invoice_id = si.id and po.status = 'confirmado'
      );

    if v_sub_valid_count <> v_sub_requested then
      raise exception 'Uma ou mais faturas de assinatura não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção de 16 dias, ou não são deste parceiro).';
    end if;
  end if;

  if v_reserve_requested > 0 then
    perform 1 from public.app_purchases where id = any(p_reserve_app_purchase_ids) for update;

    select count(*), coalesce(sum(
        ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2)
      ), 0)
      into v_reserve_valid_count, v_reserve_total
    from public.app_purchases ap
    where ap.id = any(p_reserve_app_purchase_ids)
      and ap.partner_id = p_partner_id
      and ap.status = 'paid'
      and ap.reserve_status = 'held'
      and ap.paid_at is not null
      and ap.paid_at <= now() - (ap.reserve_window_days || ' days')::interval
      and not exists (
        select 1 from public.partner_payout_items pi
        join public.partner_payouts po on po.id = pi.payout_id
        where pi.app_purchase_id = ap.id and pi.kind = 'reserve' and po.status = 'confirmado'
      );

    if v_reserve_valid_count <> v_reserve_requested then
      raise exception 'Uma ou mais reservas não são elegíveis pra liberação agora (já liberadas, ainda dentro da janela, com disputa, ou não são deste parceiro).';
    end if;
  end if;

  v_total := v_app_total + v_sub_total + v_reserve_total;

  -- Snapshot do destino — a config ATUAL de profiles pode mudar depois
  -- (parceiro troca de chave PIX); o repasse já feito tem que continuar
  -- mostrando pra onde foi de verdade, não pra onde vai o próximo.
  select pr.payout_pix_key into v_pix_key from public.profiles pr where pr.id = p_partner_id;
  v_pix_key := nullif(trim(coalesce(v_pix_key, '')), '');
  v_destination_snapshot := case
    -- Chave e-mail: mascara o usuário, preserva o domínio (mostrar só os
    -- últimos 4 caracteres de um e-mail vira a extensão ".com" — inútil
    -- pra identificar a chave).
    when v_pix_key like '%@%' then
      'PIX ' || left(split_part(v_pix_key, '@', 1), 2) || '•••@' || split_part(v_pix_key, '@', 2)
    -- Chave numérica (telefone/CPF/CNPJ/aleatória com dígitos): últimos 4 dígitos.
    when length(regexp_replace(v_pix_key, '\D', '', 'g')) >= 4 then
      'PIX ••••' || right(regexp_replace(v_pix_key, '\D', '', 'g'), 4)
    when v_pix_key is not null then
      'PIX ••••' || right(v_pix_key, 4)
    else null
  end;

  insert into public.partner_payouts (partner_id, total_amount, reference, notes, requested_by, destination_snapshot)
  values (p_partner_id, v_total, trim(p_reference), nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), v_destination_snapshot)
  returning * into v_payout;

  if v_app_requested > 0 then
    insert into public.partner_payout_items (payout_id, app_purchase_id, amount, kind)
    select v_payout.id, ap.id,
           (ap.partner_amount - ap.reserve_amount) - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2),
           'main'
    from public.app_purchases ap
    where ap.id = any(p_app_purchase_ids);
  end if;

  if v_sub_requested > 0 then
    insert into public.partner_payout_items (payout_id, subscription_invoice_id, amount)
    select v_payout.id, si.id, si.partner_amount
    from public.subscription_invoices si
    where si.id = any(p_subscription_invoice_ids);
  end if;

  if v_reserve_requested > 0 then
    insert into public.partner_payout_items (payout_id, app_purchase_id, amount, kind)
    select v_payout.id, ap.id,
           ap.reserve_amount - round(ap.refunded_amount * ap.reserve_amount / ap.amount, 2),
           'reserve'
    from public.app_purchases ap
    where ap.id = any(p_reserve_app_purchase_ids);

    update public.app_purchases
      set reserve_status = 'released'
      where id = any(p_reserve_app_purchase_ids);
  end if;

  return v_payout;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_payout_history — ganha destination_snapshot, application_id
--    e sale_id.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_payout_history(uuid);

create function public.get_partner_payout_history(p_partner_id uuid default null)
returns table (
  payout_id             uuid,
  reference             text,
  notes                 text,
  payout_status         text,
  total_amount          numeric(12,2),
  currency              text,
  destination_snapshot  text,
  created_at            timestamptz,
  reverted_at           timestamptz,
  revert_reason         text,
  item_id               uuid,
  item_kind             text,
  item_amount           numeric(12,2),
  sale_id               uuid,
  application_id        uuid,
  application_name      text,
  plan_name             text,
  sale_paid_at          timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_repasses' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  select
    po.id as payout_id,
    po.reference,
    po.notes,
    po.status as payout_status,
    po.total_amount,
    po.currency,
    po.destination_snapshot,
    po.created_at,
    po.reverted_at,
    po.revert_reason,
    pi.id as item_id,
    case
      when pi.subscription_invoice_id is not null then 'subscription_invoice'
      when pi.kind = 'reserve' then 'app_purchase_reserve'
      else 'app_purchase_main'
    end as item_kind,
    pi.amount as item_amount,
    coalesce(pi.app_purchase_id, pi.subscription_invoice_id) as sale_id,
    coalesce(ap.application_id, d.application_id) as application_id,
    coalesce(ap.application_name, a.name) as application_name,
    coalesce(ap.plan_name, s.plan_name) as plan_name,
    coalesce(ap.paid_at, si.paid_at) as sale_paid_at
  from public.partner_payouts po
  left join public.partner_payout_items pi on pi.payout_id = po.id
  left join public.app_purchases ap on ap.id = pi.app_purchase_id
  left join public.subscription_invoices si on si.id = pi.subscription_invoice_id
  left join public.subscriptions s on s.id = si.subscription_id
  left join public.app_plans p on p.id = s.app_plan_id
  left join public.app_drafts d on d.id = p.app_draft_id
  left join public.applications a on a.id = d.application_id
  where po.partner_id = v_partner_id
  order by po.created_at desc, pi.id;
end;
$$;

revoke execute on function public.get_partner_payout_history(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_payout_history(uuid) to authenticated;

comment on function public.get_partner_payout_history(uuid) is
  'Extrato de repasses do parceiro (confirmados e revertidos), uma linha por item — client agrupa por payout_id. destination_snapshot é o destino NO MOMENTO do repasse (pode ser null em repasses anteriores à coluna). p_partner_id default null = o próprio usuário; exige financeiro_repasses pra ver o de outro.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) get_partner_statement — extrato de movimentações (projeção, não é
--    livro novo). v_events reúne todo evento real; v_balance calcula o
--    saldo disponível corrente com window function sobre o conjunto
--    COMPLETO antes de qualquer filtro de app/tipo/busca ser aplicado.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_statement(
  p_partner_id      uuid default null,
  p_application_id  uuid default null,
  p_tipo            text default null,
  p_date_from       timestamptz default null,
  p_date_to         timestamptz default null,
  p_limit           integer default 50,
  p_offset          integer default 0
)
returns table (
  event_at              timestamptz,
  tipo                  text,
  descricao             text,
  application_id        uuid,
  application_name      text,
  referencia            text,
  sale_id               uuid,
  valor                 numeric(12,2),
  saldo_disponivel_delta numeric(12,2),
  saldo_disponivel_apos numeric(12,2),
  situacao              text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_repasses' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  return query
  with events as (
    -- Venda confirmada (informativo — dinheiro ainda em retenção, não mexe
    -- no saldo disponível).
    select
      ap.paid_at as event_at, 'venda_confirmada'::text as tipo,
      'Participação em venda confirmada' as descricao,
      ap.application_id, ap.application_name,
      ap.id::text as referencia, ap.id as sale_id,
      (ap.partner_amount - ap.reserve_amount) as valor,
      0::numeric(12,2) as saldo_disponivel_delta,
      'confirmado'::text as situacao
    from public.app_purchases ap
    where ap.partner_id = v_partner_id and ap.status in ('paid', 'refunded') and ap.paid_at is not null

    union all

    select
      si.paid_at, 'venda_confirmada'::text,
      'Participação em venda de assinatura confirmada',
      d.application_id, a.name,
      si.id::text, si.id,
      si.partner_amount,
      0::numeric(12,2),
      'confirmado'::text
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where s.partner_id = v_partner_id and s.product_type = 'app_plan' and si.paid_at is not null

    union all

    -- Constituição de reserva (informativo — nunca esteve no saldo disponível).
    select
      ap.paid_at, 'reserva_constituida'::text,
      'Constituição de reserva de segurança',
      ap.application_id, ap.application_name,
      ap.id::text, ap.id,
      ap.reserve_amount,
      0::numeric(12,2),
      'confirmado'::text
    from public.app_purchases ap
    where ap.partner_id = v_partner_id and ap.status in ('paid', 'refunded') and ap.reserve_amount > 0 and ap.paid_at is not null

    union all

    -- Liberação de retenção — data determinística (paid_at + retention_days),
    -- só aparece quando já passou de verdade. Soma ao saldo disponível.
    select
      ap.paid_at + (ap.retention_days || ' days')::interval, 'liberacao_retencao'::text,
      'Liberação de retenção (fatia principal)',
      ap.application_id, ap.application_name,
      ap.id::text, ap.id,
      (ap.partner_amount - ap.reserve_amount) - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2),
      ((ap.partner_amount - ap.reserve_amount) - round(ap.refunded_amount * (ap.partner_amount - ap.reserve_amount) / ap.amount, 2)),
      'confirmado'::text
    from public.app_purchases ap
    where ap.partner_id = v_partner_id and ap.status in ('paid', 'refunded') and ap.paid_at is not null
      and ap.paid_at + (ap.retention_days || ' days')::interval <= now()

    union all

    select
      si.paid_at + interval '16 days', 'liberacao_retencao'::text,
      'Liberação de retenção (assinatura)',
      d.application_id, a.name,
      si.id::text, si.id,
      si.partner_amount,
      si.partner_amount,
      'confirmado'::text
    from public.subscription_invoices si
    join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where s.partner_id = v_partner_id and s.product_type = 'app_plan' and si.paid_at is not null
      and si.paid_at + interval '16 days' <= now()

    union all

    -- Reembolso (informativo — os valores de liberação/repasse acima já
    -- são líquidos de reembolso; não duplica desconto nenhum saldo).
    select
      ap.refunded_at, 'reembolso'::text,
      'Reembolso' || case when ap.status = 'refunded' then ' integral' else ' parcial' end,
      ap.application_id, ap.application_name,
      ap.id::text, ap.id,
      -ap.refunded_amount,
      0::numeric(12,2),
      'concluido'::text
    from public.app_purchases ap
    where ap.partner_id = v_partner_id and ap.refunded_amount > 0 and ap.refunded_at is not null

    union all

    -- Reserva perdida em disputa — dinheiro sai da reserva, nunca passou
    -- pelo disponível.
    select
      pd.closed_at, 'reserva_perdida_disputa'::text,
      'Reserva perdida em disputa',
      ap.application_id, ap.application_name,
      ap.id::text, ap.id,
      -ap.reserve_amount,
      0::numeric(12,2),
      'concluido'::text
    from public.app_purchases ap
    join public.payment_disputes pd on pd.source_type = 'app_purchases' and pd.source_id = ap.id
    where ap.partner_id = v_partner_id and ap.reserve_status = 'clawed_back' and pd.closed_at is not null and pd.status <> 'won'

    union all

    -- Repasse concluído — fatia principal/assinatura sai do disponível
    -- (já estava liberada); reserva sai direto da reserva (nunca passou
    -- pelo disponível, delta 0 pra este saldo específico).
    select
      po.created_at, 'repasse_concluido'::text,
      'Repasse concluído' || case when pi.kind = 'reserve' then ' (reserva)' when pi.subscription_invoice_id is not null then ' (assinatura)' else ' (fatia principal)' end,
      coalesce(ap.application_id, d.application_id), coalesce(ap.application_name, a.name),
      po.reference, coalesce(pi.app_purchase_id, pi.subscription_invoice_id),
      -pi.amount,
      case when pi.kind = 'reserve' then 0::numeric(12,2) else -pi.amount end,
      po.status
    from public.partner_payout_items pi
    join public.partner_payouts po on po.id = pi.payout_id
    left join public.app_purchases ap on ap.id = pi.app_purchase_id
    left join public.subscription_invoices si on si.id = pi.subscription_invoice_id
    left join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where po.partner_id = v_partner_id

    union all

    -- Devolução/reversão de repasse — volta pro disponível (fatia
    -- principal/assinatura); reserva volta pra "held" (não pro disponível).
    select
      po.reverted_at, 'repasse_revertido'::text,
      'Repasse revertido' || case when pi.kind = 'reserve' then ' (reserva)' when pi.subscription_invoice_id is not null then ' (assinatura)' else ' (fatia principal)' end
        || coalesce(' — motivo: ' || po.revert_reason, ''),
      coalesce(ap.application_id, d.application_id), coalesce(ap.application_name, a.name),
      po.reference, coalesce(pi.app_purchase_id, pi.subscription_invoice_id),
      pi.amount,
      case when pi.kind = 'reserve' then 0::numeric(12,2) else pi.amount end,
      'revertido'::text
    from public.partner_payout_items pi
    join public.partner_payouts po on po.id = pi.payout_id
    left join public.app_purchases ap on ap.id = pi.app_purchase_id
    left join public.subscription_invoices si on si.id = pi.subscription_invoice_id
    left join public.subscriptions s on s.id = si.subscription_id
    left join public.app_plans p on p.id = s.app_plan_id
    left join public.app_drafts d on d.id = p.app_draft_id
    left join public.applications a on a.id = d.application_id
    where po.partner_id = v_partner_id and po.reverted_at is not null
  ),
  balanced as (
    select
      e.*,
      sum(e.saldo_disponivel_delta) over (
        order by e.event_at, e.tipo, e.referencia, e.sale_id
        rows between unbounded preceding and current row
      ) as saldo_disponivel_apos
    from events e
  )
  select
    b.event_at, b.tipo, b.descricao, b.application_id, b.application_name,
    b.referencia, b.sale_id, b.valor, b.saldo_disponivel_delta, b.saldo_disponivel_apos, b.situacao
  from balanced b
  where (p_application_id is null or b.application_id = p_application_id)
    and (p_tipo is null or b.tipo = p_tipo)
    and (p_date_from is null or b.event_at >= p_date_from)
    and (p_date_to is null or b.event_at < p_date_to)
  order by b.event_at desc, b.tipo desc, b.referencia desc, b.sale_id desc
  limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.get_partner_statement(uuid, uuid, text, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.get_partner_statement(uuid, uuid, text, timestamptz, timestamptz, integer, integer) to authenticated;

comment on function public.get_partner_statement(uuid, uuid, text, timestamptz, timestamptz, integer, integer) is
  'Extrato de movimentações — projeção sobre app_purchases/subscription_invoices/partner_payouts/partner_payout_items/payment_disputes, nunca um livro novo. saldo_disponivel_apos é calculado com window function sobre TODO o histórico antes do filtro de app/tipo/período ser aplicado — nunca um saldo fictício de filtro. Reserva nunca passa pelo saldo disponível neste modelo (liberação e repasse são o mesmo instante) — delta 0 de propósito, documentado, não um bug.';

create or replace function public.get_partner_statement_count(
  p_partner_id      uuid default null,
  p_application_id  uuid default null,
  p_tipo            text default null,
  p_date_from       timestamptz default null,
  p_date_to         timestamptz default null
)
returns integer
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_count integer;
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_repasses' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  select count(*) into v_count
  from public.get_partner_statement(v_partner_id, p_application_id, p_tipo, p_date_from, p_date_to, 2147483647, 0);

  return v_count;
end;
$$;

revoke execute on function public.get_partner_statement_count(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_partner_statement_count(uuid, uuid, text, timestamptz, timestamptz) to authenticated;

comment on function public.get_partner_statement_count(uuid, uuid, text, timestamptz, timestamptz) is
  'Contagem total pro mesmo filtro de get_partner_statement — reaproveita a própria função com limit alto em vez de duplicar a query.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) get_partner_payout_destination — card "Conta de recebimento" (seção
--    14). profiles não é diretamente selecionável pra outro usuário via
--    RLS a partir do client — esta RPC é o único jeito seguro de um membro
--    de equipe com financeiro_repasses ver a configuração (mascarada) do
--    DONO, igual já acontece com get_partner_financeiro_pendencias.recebimento_incompleto.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_payout_destination(p_partner_id uuid default null)
returns table (
  configured     boolean,
  masked_pix     text,
  account_holder text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_pix_key    text;
  v_holder     text;
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_repasses' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  select pr.payout_pix_key, pr.payout_account_holder into v_pix_key, v_holder
  from public.profiles pr where pr.id = v_partner_id;
  v_pix_key := nullif(trim(coalesce(v_pix_key, '')), '');

  return query select
    v_pix_key is not null,
    case
      when v_pix_key is null then null
      when v_pix_key like '%@%' then left(split_part(v_pix_key, '@', 1), 2) || '•••@' || split_part(v_pix_key, '@', 2)
      when length(regexp_replace(v_pix_key, '\D', '', 'g')) >= 4 then '••••' || right(regexp_replace(v_pix_key, '\D', '', 'g'), 4)
      else '••••' || right(v_pix_key, 4)
    end,
    v_holder;
end;
$$;

revoke execute on function public.get_partner_payout_destination(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_payout_destination(uuid) to authenticated;

comment on function public.get_partner_payout_destination(uuid) is
  'Config de recebimento mascarada pro card "Conta de recebimento" — nunca a chave em texto puro. p_partner_id default null = o próprio usuário; exige financeiro_repasses pra ver o de outro.';
