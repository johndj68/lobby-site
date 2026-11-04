-- Etapa 6 do roadmap do parceiro — Preços publicados. Hoje PATCH
-- /api/apps/plans/[id] deixa o dono mudar price/billing_period de um
-- plano instantaneamente, sem revisão, mesmo em app já publicado e
-- vendendo. Esta migração só cria a tabela de pedidos — o gate em si
-- (Task 2) e a tela de aprovação (Task 3) vêm depois.

create table public.plan_price_change_requests (
  id                        uuid primary key default gen_random_uuid(),
  app_plan_id               uuid not null references public.app_plans(id) on delete cascade,
  requested_by              uuid not null references auth.users(id),
  status                    text not null default 'pendente'
                              check (status in ('pendente', 'aprovado', 'rejeitado')),
  current_price             numeric(10,2),
  requested_price           numeric(10,2) not null,
  current_billing_period    text,
  requested_billing_period  text not null,
  reviewed_by               uuid references auth.users(id),
  reviewed_at               timestamptz,
  review_notes              text,
  created_at                timestamptz not null default now()
);

alter table public.plan_price_change_requests
  add constraint plan_price_change_requests_current_billing_period_check
  check (current_billing_period is null or current_billing_period in ('one-time', 'monthly', 'yearly', 'lifetime'));

alter table public.plan_price_change_requests
  add constraint plan_price_change_requests_requested_billing_period_check
  check (requested_billing_period in ('one-time', 'monthly', 'yearly', 'lifetime'));

-- No máximo 1 pedido pendente por plano por vez — evita empilhar
-- pedidos conflitantes pro mesmo plano (spec: "no máximo 1 pendente").
create unique index plan_price_change_requests_one_pending_per_plan
  on public.plan_price_change_requests (app_plan_id)
  where status = 'pendente';

create index plan_price_change_requests_app_plan_idx
  on public.plan_price_change_requests (app_plan_id, created_at desc);

comment on table public.plan_price_change_requests is
  'Pedido de mudança de price/billing_period de um plano já existente — nasce pendente, só aplica em app_plans depois de aprovado pelo admin (Etapa 6 "Preços publicados"). current_* é snapshot do valor antes do pedido, pro admin comparar sem depender do valor antigo ainda existir em algum lugar depois de aprovado.';

alter table public.plan_price_change_requests enable row level security;

grant select, insert on table public.plan_price_change_requests to authenticated;
grant all on table public.plan_price_change_requests to service_role;

-- Dono do app (mesma checagem de posse que PATCH /api/apps/plans/[id]
-- já faz hoje — created_by literal, nunca membro de equipe, gap
-- pré-existente fora de escopo aqui) vê e cria seus próprios pedidos.
create policy "owner_select_own_price_requests" on public.plan_price_change_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = app_plan_id and d.created_by = auth.uid()
    )
  );

create policy "owner_insert_own_price_requests" on public.plan_price_change_requests
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = app_plan_id and d.created_by = auth.uid()
    )
  );

-- Admin (role='technician') vê e resolve tudo. Dono nunca faz UPDATE
-- aqui — status/reviewed_* só mudam via rota admin (service-role
-- client, Task 3), nenhuma policy de UPDATE pro dono.
create policy "technician_select_all_price_requests" on public.plan_price_change_requests
  for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'technician')
  );
