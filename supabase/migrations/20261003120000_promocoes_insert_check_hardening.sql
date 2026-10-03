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
    and original_price = (select price from public.app_plans where id = plan_id)
    and promo_price < (select price from public.app_plans where id = plan_id)
    and exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  );
