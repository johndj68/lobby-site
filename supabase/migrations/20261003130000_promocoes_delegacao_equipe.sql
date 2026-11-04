-- Etapa 8 do roadmap do parceiro — revisão cruzada encontrou uma lacuna
-- real: toda aba de /dashboard/financeiro/** (Visão geral, Vendas,
-- Repasses) já segue o padrão de permissão delegada da Etapa 5
-- (p_partner_id + capacidade financeiro_* em app_team_members.permissions,
-- ou role='owner') — "Ofertas e promoções" (Etapa 7) nunca foi ligada
-- nesse sistema, embora a capacidade 'financeiro_ofertas' já existisse
-- na lista de permissões da UI de equipe desde a Etapa 4/5, rotulada
-- "(ainda não disponível)" — esta migração é o que a torna disponível.
--
-- 2 RPCs novas (mesmo padrão de get_partner_sold_apps/get_partner_sales)
-- pra leitura; a escrita (pedir promoção em nome do dono) continua pela
-- rota TS existente (app/api/apps/plans/[id]/promotions/route.ts), que
-- passa a checar permissão e usar o client de service-role só no insert
-- quando age em nome de outro parceiro — reaproveita toda a validação
-- TS já testada (preço, overlap, pendente, race), sem duplicar essa
-- lógica em PL/pgSQL.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) get_partner_ofertas_plans — planos do parceiro (ou do próprio
--    usuário, p_partner_id default null), pra popular o seletor do
--    formulário "Pedir promoção" e a lista de planos da tela.
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_ofertas_plans(p_partner_id uuid default null)
returns table (
  id              uuid,
  app_draft_id    uuid,
  app_name        text,
  plan_name       text,
  price           numeric(10,2),
  currency        text,
  billing_period  text
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
        -- owner: acesso total, mesma nota de 20261002140000
        and (tm.role = 'owner' or 'financeiro_ofertas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver as ofertas deste parceiro.';
    end if;
  end if;

  return query
  select p.id, p.app_draft_id, d.name as app_name, p.name as plan_name, p.price, p.currency, p.billing_period
  from public.app_plans p
  join public.app_drafts d on d.id = p.app_draft_id
  where d.created_by = v_partner_id;
end;
$$;

revoke execute on function public.get_partner_ofertas_plans(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_ofertas_plans(uuid) to authenticated;

comment on function public.get_partner_ofertas_plans(uuid) is
  'Planos (app_plans) do parceiro — o próprio usuário por padrão, ou outro dono quando o chamador tem role=owner ou a capacidade financeiro_ofertas em app_team_members.permissions pra algum app desse dono.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_ofertas_promotions — pedidos/promoções do parceiro,
--    mesma checagem de permissão.
-- ─────────────────────────────────────────────────────────────────────────

create function public.get_partner_ofertas_promotions(p_partner_id uuid default null)
returns table (
  id                   uuid,
  plan_id              uuid,
  promo_price          numeric(10,2),
  original_price       numeric(10,2),
  discount_percentage  integer,
  starts_at            timestamptz,
  ends_at              timestamptz,
  is_approved          boolean,
  is_active            boolean,
  cancelled_at         timestamptz,
  paused_at            timestamptz,
  rejected_at          timestamptz,
  rejection_reason     text,
  created_at           timestamptz
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
        and (tm.role = 'owner' or 'financeiro_ofertas' = any(tm.permissions))
    ) then
      raise exception 'Sem permissão para ver as ofertas deste parceiro.';
    end if;
  end if;

  return query
  select pr.id, pr.plan_id, pr.promo_price, pr.original_price, pr.discount_percentage,
         pr.starts_at, pr.ends_at, pr.is_approved, pr.is_active, pr.cancelled_at,
         pr.paused_at, pr.rejected_at, pr.rejection_reason, pr.created_at
  from public.promotions pr
  join public.app_plans p on p.id = pr.plan_id
  join public.app_drafts d on d.id = p.app_draft_id
  where d.created_by = v_partner_id
  order by pr.created_at desc;
end;
$$;

revoke execute on function public.get_partner_ofertas_promotions(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_ofertas_promotions(uuid) to authenticated;

comment on function public.get_partner_ofertas_promotions(uuid) is
  'Pedidos/promoções (promotions) do parceiro, por plano — mesma checagem de permissão de get_partner_ofertas_plans.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) get_financeiro_viewable_partners (20261002140000) tinha a lista de
--    capacidades que fazem o parceiro aparecer no seletor "Visualizando
--    financeiro de" hardcoded SEM financeiro_ofertas — um membro de
--    equipe com SÓ essa capacidade nunca veria o dono aparecer no
--    seletor, mesmo agora que a RPC de dados existe. Mesma assinatura,
--    create or replace serve.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_financeiro_viewable_partners()
returns table (partner_id uuid, partner_label text)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  return query
  select distinct d.created_by as partner_id,
    coalesce(pr.company_name, pr.full_name, pr.email) as partner_label
  from public.app_team_members tm
  join public.app_drafts d on d.id = tm.app_draft_id
  join public.profiles pr on pr.id = d.created_by
  where tm.user_id = auth.uid()
    and d.created_by <> auth.uid()
    and (tm.role = 'owner' or tm.permissions && array['financeiro_visao_geral','financeiro_vendas','financeiro_repasses','financeiro_ofertas'])
  order by 2;
end;
$$;

comment on function public.get_financeiro_viewable_partners() is
  'Donos cujo financeiro o usuário logado pode ver via permissão de equipe (role=owner ou qualquer capacidade financeiro_*) — popula o seletor "Visualizando financeiro de" na área Vendas e financeiro. Não inclui o próprio usuário.';
