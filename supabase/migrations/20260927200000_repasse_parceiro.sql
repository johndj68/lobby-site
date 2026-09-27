-- Repasse manual ao parceiro (decisão comercial confirmada 2026-09-27:
-- "manual, PIX/TED fora do sistema", retenção de 14 dias após a venda
-- confirmada). Etapa 5, peça 4 do roadmap (plano em
-- /home/john/.claude/plans/proud-nibbling-sphinx.md) — depende de peça 2
-- (comissão) e peça 3 (checkout de app, única fonte de app_purchases.
-- partner_amount hoje).
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual.
--
-- Modelo: "retido" (pago, ainda dentro dos 14 dias) e "elegível" (pago, já
-- passou os 14 dias, não coberto por nenhum repasse confirmado) NÃO são
-- estados guardados em coluna nenhuma — são um cálculo em cima de
-- app_purchases.paid_at + partner_payout_items, exatamente como o pedido
-- original pede ("não inventar estrutura onde uma consulta resolve").
-- Só o que de fato aconteceu (repasse registrado, com comprovante) vira
-- linha no banco.
--
-- Sem estado "solicitado"/"processando" intermediário: não existe chamada
-- assíncrona nenhuma aqui (é PIX/TED feito por fora), então modelar um
-- estado "em voo" seria fingir uma etapa que não existe. O registro nasce
-- direto como o que de fato é — uma transferência que o líder atesta ter
-- feito, com comprovante — e só pode virar 'revertido' depois (nunca
-- apagado, seção 4).

create table if not exists public.partner_payouts (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.profiles(id),
  total_amount   numeric(12,2) not null,
  currency       text not null default 'BRL',
  status         text not null default 'confirmado',
  reference      text not null,
  notes          text,
  requested_by   uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  reverted_at    timestamptz,
  reverted_by    uuid references auth.users(id),
  revert_reason  text,
  constraint partner_payouts_status_check check (status = any (array['confirmado', 'revertido'])),
  constraint partner_payouts_total_amount_check check (total_amount > 0)
);

create index if not exists partner_payouts_partner_idx on public.partner_payouts (partner_id, created_at desc);

comment on table public.partner_payouts is
  'Repasse manual ao parceiro — registro de uma transferência PIX/TED já feita por fora do sistema, com comprovante. Cobre 1+ app_purchases (partner_payout_items). Nasce como confirmado (não há chamada assíncrona a esperar); revert_* preserva histórico em vez de apagar.';

alter table public.partner_payouts enable row level security;

grant select on table public.partner_payouts to authenticated;
grant all on table public.partner_payouts to service_role;

create policy "leader_select_partner_payouts" on public.partner_payouts
  for select to authenticated
  using (public.is_leader(auth.uid()));

create policy "partner_select_own_payouts" on public.partner_payouts
  for select to authenticated
  using (partner_id = auth.uid());


-- partner_payout_items — quais app_purchases cada repasse cobre.
--
-- Sem UNIQUE(app_purchase_id): de propósito. Se um repasse for revertido,
-- a compra volta a ficar elegível pra um repasse futuro correto — mas a
-- linha do item no repasse revertido continua existindo (não apaga
-- histórico). A regra "uma compra não pode estar em 2 repasses
-- CONFIRMADOS ao mesmo tempo" é garantida pela RPC create_partner_payout
-- (única via de escrita — sem policy de INSERT pra authenticated), não
-- por constraint de banco, porque a constraint não consegue expressar
-- "único só entre payouts não revertidos" sem referenciar outra tabela.
create table if not exists public.partner_payout_items (
  id               uuid primary key default gen_random_uuid(),
  payout_id        uuid not null references public.partner_payouts(id),
  app_purchase_id  uuid not null references public.app_purchases(id),
  amount           numeric(12,2) not null,
  created_at       timestamptz not null default now()
);

create index if not exists partner_payout_items_payout_idx on public.partner_payout_items (payout_id);
create index if not exists partner_payout_items_purchase_idx on public.partner_payout_items (app_purchase_id);

alter table public.partner_payout_items enable row level security;

grant select on table public.partner_payout_items to authenticated;
grant all on table public.partner_payout_items to service_role;

create policy "leader_select_payout_items" on public.partner_payout_items
  for select to authenticated
  using (public.is_leader(auth.uid()));

create policy "partner_select_own_payout_items" on public.partner_payout_items
  for select to authenticated
  using (exists (select 1 from public.partner_payouts po where po.id = payout_id and po.partner_id = auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- create_partner_payout — registra um repasse já feito, cobrindo 1+
-- compras elegíveis do mesmo parceiro. Valida tudo no servidor: nunca
-- confia em total nem em "elegibilidade" vindos do client.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.create_partner_payout(
  "p_partner_id"        uuid,
  "p_app_purchase_ids"  uuid[],
  "p_reference"         text,
  "p_notes"             text default null
)
returns public.partner_payouts
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_payout       public.partner_payouts;
  v_total        numeric(12,2);
  v_valid_count  integer;
  v_requested_count integer;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode registrar repasse.';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'Informe a referência/comprovante do repasse.';
  end if;
  if p_app_purchase_ids is null or array_length(p_app_purchase_ids, 1) is null then
    raise exception 'Selecione ao menos uma venda pra repassar.';
  end if;
  v_requested_count := array_length(p_app_purchase_ids, 1);

  -- Lock nas compras envolvidas — impede 2 repasses concorrentes cobrirem a mesma venda.
  perform 1 from public.app_purchases where id = any(p_app_purchase_ids) for update;

  select count(*), coalesce(sum(ap.partner_amount), 0)
    into v_valid_count, v_total
  from public.app_purchases ap
  where ap.id = any(p_app_purchase_ids)
    and ap.partner_id = p_partner_id
    and ap.status = 'paid'
    and ap.paid_at is not null
    and ap.paid_at <= now() - interval '14 days'
    and not exists (
      select 1 from public.partner_payout_items pi
      join public.partner_payouts po on po.id = pi.payout_id
      where pi.app_purchase_id = ap.id and po.status = 'confirmado'
    );

  if v_valid_count <> v_requested_count then
    raise exception 'Uma ou mais vendas não são elegíveis pra repasse agora (já repassadas, ainda dentro do período de retenção de 14 dias, ou não são deste parceiro).';
  end if;

  insert into public.partner_payouts (partner_id, total_amount, reference, notes, requested_by)
  values (p_partner_id, v_total, trim(p_reference), nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning * into v_payout;

  insert into public.partner_payout_items (payout_id, app_purchase_id, amount)
  select v_payout.id, ap.id, ap.partner_amount
  from public.app_purchases ap
  where ap.id = any(p_app_purchase_ids);

  return v_payout;
end;
$$;

revoke execute on function public.create_partner_payout(uuid, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.create_partner_payout(uuid, uuid[], text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- revert_partner_payout — repasse registrado por engano. Não apaga (seção
-- 4/10) — marca revertido, e a(s) compra(s) coberta(s) voltam a ficar
-- elegíveis (a checagem de create_partner_payout só considera itens de
-- payouts status='confirmado').
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.revert_partner_payout(
  "p_payout_id" uuid,
  "p_reason"    text
)
returns public.partner_payouts
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_payout public.partner_payouts;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode reverter repasse.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Informe o motivo da reversão.';
  end if;

  select * into v_payout from public.partner_payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Repasse não encontrado.';
  end if;
  if v_payout.status = 'revertido' then
    raise exception 'Este repasse já foi revertido.';
  end if;

  update public.partner_payouts
    set status = 'revertido', reverted_at = now(), reverted_by = auth.uid(), revert_reason = trim(p_reason)
    where id = p_payout_id
    returning * into v_payout;

  return v_payout;
end;
$$;

revoke execute on function public.revert_partner_payout(uuid, text) from public, anon, authenticated;
grant execute on function public.revert_partner_payout(uuid, text) to authenticated;
