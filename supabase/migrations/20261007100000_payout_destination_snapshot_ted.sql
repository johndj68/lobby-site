-- create_partner_payout (20261006100000) montava o destination_snapshot
-- só a partir de payout_pix_key — na época a única forma de destino.
-- 20261006130000/20261006140000 (depois, mesma sessão) adicionaram
-- payout_method='bank_transfer' como destino de primeira classe. Pra um
-- parceiro com TED vigente, payout_pix_key fica null e o snapshot saía
-- null também — repasse registrado sem destino gravado no histórico,
-- mesmo a tela de registrar mostrando os dados bancários certos na hora
-- (RepassesClient.tsx já trata os dois métodos, só a RPC tinha ficado
-- pra trás). Reaproveita mask_tail (20261006140000) pra consistência
-- com o resto das telas mascaradas.

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
  v_method                text;
  v_pix_key               text;
  v_bank_name              text;
  v_bank_agency            text;
  v_bank_account           text;
  v_bank_account_digit     text;
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
      raise exception 'Uma ou mais reservas não são elegíveis pra liberação agora (já repassadas, ainda dentro da janela de disputa, ou não são deste parceiro).';
    end if;
  end if;

  v_total := v_app_total + v_sub_total + v_reserve_total;

  -- Snapshot do destino — a config ATUAL de profiles pode mudar depois
  -- (parceiro troca de chave PIX ou de banco); o repasse já feito tem que
  -- continuar mostrando pra onde foi de verdade, não pra onde vai o próximo.
  select pr.payout_method, pr.payout_pix_key, pr.payout_bank_name,
         pr.payout_bank_agency, pr.payout_bank_account, pr.payout_bank_account_digit
    into v_method, v_pix_key, v_bank_name, v_bank_agency, v_bank_account, v_bank_account_digit
  from public.profiles pr where pr.id = p_partner_id;

  v_pix_key := nullif(trim(coalesce(v_pix_key, '')), '');
  v_bank_name := nullif(trim(coalesce(v_bank_name, '')), '');

  v_destination_snapshot := case
    when v_method = 'bank_transfer' and v_bank_name is not null then
      'TED ' || v_bank_name || ' ag. ' || coalesce(public.mask_tail(v_bank_agency), '—') ||
        ' cc ' || coalesce(public.mask_tail(v_bank_account), '—') ||
        case when v_bank_account_digit is not null then '-' || v_bank_account_digit else '' end
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

comment on function public.create_partner_payout(uuid, uuid[], text, text, uuid[], uuid[]) is
  'Registra repasse (só Técnico Líder) — valida elegibilidade (retenção/janela de disputa/não repassado), soma vendas+assinaturas+reservas liberadas, grava destination_snapshot (PIX ou TED mascarado, conforme profiles.payout_method no momento do registro) e os itens em partner_payout_items.';
