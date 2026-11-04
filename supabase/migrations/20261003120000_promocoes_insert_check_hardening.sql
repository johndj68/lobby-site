-- A policy owner_insert_own_promotions (20261003100000) só constrange
-- created_by/is_approved/is_active/posse do plano — promo_price,
-- original_price, discount_percentage, unit_limit,
-- eligible_for_daily_deals, internal_note, name e até rejected_at/
-- rejection_reason ficam livres. O client do navegador usa a anon key:
-- a rota (app/api/apps/plans/[id]/promotions/route.ts) não é a fronteira
-- de segurança real, é a RLS — um parceiro mal-intencionado pode chamar
-- supabase.from('promotions').insert(...) direto do devtools e inserir
-- um original_price falso (ex: "de R$ 999,00") num plano real de
-- R$ 59,90, publicando propaganda falsa que o admin pode aprovar sem
-- forma de saber que é fake.
--
-- Fecha a lacuna: original_price tem que bater com o preço atual do
-- plano, promo_price tem que ser menor que o preço do plano, e nenhum
-- campo de estado/revisão (rejected_at, rejected_by, rejection_reason,
-- internal_note, cancelled_at, paused_at) pode vir preenchido num
-- pedido novo do parceiro.
--
-- application_id também precisa bater com o application_id real do
-- plano (via app_plans->app_drafts) — sem essa trava, um parceiro podia
-- manter plan_id/preços honestos (passando as checagens acima) mas
-- apontar application_id pra OUTRO app de outro parceiro; a home
-- (app/page.tsx) junta a promoção pela applications via application_id,
-- ignorando plan_id, então a promoção forjada apareceria anexada ao app
-- errado se o admin aprovasse sem notar (a fila do admin deriva o nome
-- do app via plan_id, então pareceria um pedido legítimo).
--
-- As subqueries usam alias (p.price, não só "price") pra nunca colidir
-- se app_plans algum dia ganhar uma coluna chamada plan_id — a mesma
-- precaução que o bloco de posse (exists) já usava.

drop policy if exists "owner_insert_own_promotions" on public.promotions;

create policy "owner_insert_own_promotions" on public.promotions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and is_approved = false
    and is_active = false
    and rejected_at is null
    and rejected_by is null
    and rejection_reason is null
    and internal_note is null
    and cancelled_at is null
    and paused_at is null
    and original_price = (select p.price from public.app_plans p where p.id = plan_id)
    and promo_price < (select p.price from public.app_plans p where p.id = plan_id)
    and application_id = (
      select d.application_id
      from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id
    )
    and exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  );
