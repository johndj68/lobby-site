-- Etapa 7 do roadmap do parceiro — Promoções. A tabela promotions e toda
-- curadoria já existem (Etapas anteriores do marketplace) — só o admin
-- cria hoje, sempre já aprovada (comentário em
-- app/api/admin/offers/[planId]/promotions/route.ts confirma: "não
-- existe fluxo de submissão de promoção pelo parceiro no projeto").
-- Esta migração fecha essa lacuna reaproveitando is_approved (já
-- default false, já invisível pro público via app/page.tsx) — só
-- adiciona o que falta pra rastrear QUEM pediu e PORQUE foi rejeitado.

alter table public.promotions
  add column if not exists created_by       uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at      timestamptz,
  add column if not exists rejected_by      uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text;

comment on column public.promotions.created_by is
  'Quem criou a linha — admin (nasce já is_approved=true) ou o próprio dono do app pedindo uma promoção (nasce is_approved=false).';
comment on column public.promotions.rejected_at is
  'Quando o admin rejeitou um pedido do parceiro — diferente de cancelled_at (que é pra uma promoção JÁ aprovada que o admin decide encerrar antes do previsto).';

-- Hoje só existem: leitura pública (aprovada+ativa+na janela) e
-- is_technician() com acesso total. Nenhuma policy deixa o dono ver ou
-- criar seus próprios pedidos — mesmo padrão de posse já usado em toda
-- etapa anterior (via plan_id → app_plans → app_drafts.created_by).

create policy "owner_select_own_promotions" on public.promotions
  for select to authenticated
  using (
    exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  );

create policy "owner_insert_own_promotions" on public.promotions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and is_approved = false
    and is_active = false
    and exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  );
