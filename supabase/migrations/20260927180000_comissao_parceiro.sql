-- Comissão sobre venda de app de parceiro (decisão comercial confirmada
-- 2026-09-27: "varia por parceiro/categoria, fallback 20%").
--
-- Etapa 5, peça 2 do roadmap (plano em
-- /home/john/.claude/plans/proud-nibbling-sphinx.md). Puro schema + tela
-- admin — sem Stripe, sem venda ainda (checkout de app é a peça 3,
-- separada). Esta peça só estabelece ONDE a taxa de comissão vigente é
-- consultada; ninguém ainda snapshot-a isso numa venda porque venda de app
-- ainda não existe no sistema.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual, mesma disciplina das etapas anteriores.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) partner_commission_terms
--
-- partner_id nulo = regra vale pra qualquer parceiro nessa categoria
-- (regra global de categoria). category_id nulo = regra vale em qualquer
-- categoria pra esse parceiro (regra global de parceiro). Os dois
-- preenchidos = regra específica parceiro+categoria (mais específica,
-- vence as outras). Os dois nulos nunca acontece (CHECK abaixo) — esse
-- caso é o fallback de 20%, que não é uma linha no banco, é constante no
-- código (get_partner_commission_percent abaixo e
-- lib/services/commission.ts do lado do app).
--
-- Sem DELETE de propósito — histórico de condição comercial não some,
-- "desativar" é um UPDATE (is_active=false), nunca apagar.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.partner_commission_terms (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid references auth.users(id),
  category_id     uuid references public.app_categories(id),
  percent         numeric(5,2) not null,
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  deactivated_at  timestamptz,
  deactivated_by  uuid references auth.users(id),
  constraint partner_commission_terms_scope_check
    check (partner_id is not null or category_id is not null),
  constraint partner_commission_terms_percent_check
    check (percent >= 0 and percent <= 100)
);

-- NULL não é igual a NULL num índice único comum — sem o coalesce pro
-- sentinel abaixo, duas regras "globais de parceiro" (category_id nulo)
-- pro mesmo partner_id poderiam coexistir ativas ao mesmo tempo. O
-- sentinel (uuid zero) nunca é um id real de auth.users/app_categories.
create unique index if not exists partner_commission_terms_active_scope_uidx
  on public.partner_commission_terms (
    coalesce(partner_id,  '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_active;

create index if not exists partner_commission_terms_partner_idx on public.partner_commission_terms (partner_id) where is_active;
create index if not exists partner_commission_terms_category_idx on public.partner_commission_terms (category_id) where is_active;

comment on table public.partner_commission_terms is
  'Condições comerciais de comissão sobre venda de app de parceiro. Resolução em get_partner_commission_percent(). Sem venda registrada ainda usando isso — pré-requisito pro checkout de app (peça 3 do roadmap).';

alter table public.partner_commission_terms enable row level security;

grant select, insert, update on table public.partner_commission_terms to authenticated;
grant all on table public.partner_commission_terms to service_role;

create policy "leader_select_commission_terms" on public.partner_commission_terms
  for select to authenticated
  using (public.is_leader(auth.uid()));

create policy "leader_insert_commission_terms" on public.partner_commission_terms
  for insert to authenticated
  with check (public.is_leader(auth.uid()));

create policy "leader_update_commission_terms" on public.partner_commission_terms
  for update to authenticated
  using (public.is_leader(auth.uid()))
  with check (public.is_leader(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_partner_commission_percent — resolução com "mais específico vence"
--
-- Ordem: parceiro+categoria exata > parceiro (qualquer categoria) >
-- categoria (qualquer parceiro) > fallback 20% (constante, não é linha).
-- SECURITY DEFINER pra poder ser chamada por qualquer contexto autenticado
-- (vai ser usada no checkout de app, peça 3) sem precisar dar SELECT
-- direto na tabela de condições comerciais pra todo mundo — só devolve o
-- número resolvido, nunca expõe as regras em si pra quem não é líder.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_partner_commission_percent(
  "p_partner_id"  uuid,
  "p_category_id" uuid
)
returns numeric
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(
    (
      select percent
      from public.partner_commission_terms
      where is_active
        and (
          (partner_id = p_partner_id and category_id = p_category_id)
          or (partner_id = p_partner_id and category_id is null)
          or (partner_id is null and category_id = p_category_id)
        )
      order by
        case
          when partner_id = p_partner_id and category_id = p_category_id then 0
          when partner_id = p_partner_id and category_id is null       then 1
          else 2
        end
      limit 1
    ),
    20 -- fallback — mantenha sincronizado com DEFAULT_COMMISSION_PERCENT em lib/services/commission.ts
  );
$$;

revoke execute on function public.get_partner_commission_percent(uuid, uuid) from public, anon;
grant execute on function public.get_partner_commission_percent(uuid, uuid) to authenticated, service_role;
