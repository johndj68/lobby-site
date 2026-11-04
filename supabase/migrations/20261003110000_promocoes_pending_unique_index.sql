-- Etapa 7 — fecha a race TOCTOU do check-then-insert em
-- app/api/apps/plans/[planId]/promotions/route.ts ("no máximo 1 pedido
-- pendente por plano"): duas requisições concorrentes podiam passar pelo
-- SELECT de existingPending antes de qualquer uma inserir, resultando em
-- dois pedidos pendentes pro mesmo plano. Mesmo padrão já usado no dia
-- anterior por plan_price_change_requests_one_pending_per_plan em
-- 20261002150000_precos_publicados.sql — índice único parcial garante a
-- invariante no banco, não só na aplicação.

create unique index promotions_one_pending_per_plan
  on public.promotions (plan_id)
  where is_approved = false and rejected_at is null and cancelled_at is null;
