-- Dois lugares mais que assumiam Pix como único método de recebimento,
-- achados em auditoria depois do fix de destination_snapshot
-- (20261007100000) — mesma causa raiz, pontos diferentes:
--
-- 1) get_partner_payout_destination (card "Conta de recebimento" na aba
--    Repasses e extrato) só lia payout_pix_key — parceiro com TED vigente
--    via "Sem chave PIX cadastrada", falso, sem CTA de correção (já
--    estava tudo cadastrado certo).
-- 2) get_partner_financeiro_pendencias (seção "Pendências e avisos" da
--    Visão geral) tinha o mesmo problema: `payout_pix_key is null` dava
--    aviso de "cadastro incompleto" pra quem já tinha TED aprovado.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_partner_payout_destination — agora devolve payout_method e os
--    campos de banco mascarados também, não só Pix.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_partner_payout_destination(uuid);

create function public.get_partner_payout_destination(p_partner_id uuid default null)
returns table (
  configured           boolean,
  payout_method        text,
  masked_pix           text,
  bank_name            text,
  masked_bank_account  text,
  account_holder       text
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id uuid := coalesce(p_partner_id, auth.uid());
  v_method     text;
  v_pix_key    text;
  v_bank_name  text;
  v_bank_account text;
  v_bank_digit   text;
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

  select pr.payout_method, pr.payout_pix_key, pr.payout_account_holder,
         pr.payout_bank_name, pr.payout_bank_account, pr.payout_bank_account_digit
    into v_method, v_pix_key, v_holder, v_bank_name, v_bank_account, v_bank_digit
  from public.profiles pr where pr.id = v_partner_id;

  v_pix_key := nullif(trim(coalesce(v_pix_key, '')), '');
  v_bank_name := nullif(trim(coalesce(v_bank_name, '')), '');

  return query select
    v_method is not null,
    v_method,
    case
      when v_pix_key is null then null
      when v_pix_key like '%@%' then left(split_part(v_pix_key, '@', 1), 2) || '•••@' || split_part(v_pix_key, '@', 2)
      when length(regexp_replace(v_pix_key, '\D', '', 'g')) >= 4 then '••••' || right(regexp_replace(v_pix_key, '\D', '', 'g'), 4)
      else '••••' || right(v_pix_key, 4)
    end,
    v_bank_name,
    case
      when v_bank_account is null then null
      else '••••' || right(v_bank_account, 2) || coalesce('-' || v_bank_digit, '')
    end,
    v_holder;
end;
$$;

revoke execute on function public.get_partner_payout_destination(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_payout_destination(uuid) to authenticated;

comment on function public.get_partner_payout_destination(uuid) is
  'Card "Conta de recebimento" da aba Repasses e extrato — versão compacta de get_partner_payout_destination_detail, agora ciente de payout_method (Pix ou transferência bancária), não só Pix. p_partner_id default null = próprio usuário; exige financeiro_repasses pra ver o de outro.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_financeiro_pendencias — "incompleto" agora é
--    payout_method is null (configurado por qualquer método), não mais
--    só payout_pix_key is null.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_financeiro_pendencias(p_partner_id uuid default null)
returns table (
  recebimento_incompleto    boolean,
  repasse_revertido_recente boolean,
  repasse_revertido_motivo  text,
  repasse_revertido_valor   numeric(12,2),
  repasse_revertido_em      timestamptz,
  valor_bloqueado_disputa   numeric(12,2),
  disputas_abertas_qtd      integer
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_partner_id             uuid := coalesce(p_partner_id, auth.uid());
  v_recebimento_incompleto boolean;
  v_revertido_recente      boolean;
  v_revertido_motivo       text;
  v_revertido_valor        numeric(12,2);
  v_revertido_em           timestamptz;
  v_bloqueado              numeric(12,2);
  v_disputas_count         integer;
begin
  if v_partner_id is distinct from auth.uid() then
    if not exists (
      select 1 from public.app_team_members tm
      join public.app_drafts d on d.id = tm.app_draft_id
      where tm.user_id = auth.uid()
        and d.created_by = v_partner_id
        and (tm.role = 'owner' or 'financeiro_visao_geral' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver o financeiro deste parceiro.';
    end if;
  end if;

  select pr.payout_method is null into v_recebimento_incompleto
  from public.profiles pr where pr.id = v_partner_id;

  select true, po.revert_reason, po.total_amount, po.reverted_at
  into v_revertido_recente, v_revertido_motivo, v_revertido_valor, v_revertido_em
  from public.partner_payouts po
  where po.partner_id = v_partner_id
    and po.status = 'revertido'
    and po.reverted_at >= now() - interval '30 days'
  order by po.reverted_at desc
  limit 1;
  v_revertido_recente := coalesce(v_revertido_recente, false);

  select coalesce(sum(ap.partner_amount), 0), count(*)
  into v_bloqueado, v_disputas_count
  from public.app_purchases ap
  where ap.partner_id = v_partner_id
    and ap.status = 'disputed';

  return query select
    coalesce(v_recebimento_incompleto, true), v_revertido_recente, v_revertido_motivo,
    v_revertido_valor, v_revertido_em, v_bloqueado, v_disputas_count;
end;
$$;

comment on function public.get_partner_financeiro_pendencias(uuid) is
  'Condições reais pra seção Pendências e avisos da Visão geral — nunca um aviso sem dado real por trás. recebimento_incompleto = payout_method is null (configurado por qualquer método, não só Pix).';
