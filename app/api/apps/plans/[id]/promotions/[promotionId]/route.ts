import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Cancelamento de UMA promoção pelo próprio dono (ou delegado com
 * financeiro_ofertas) — só a ação 'cancel', só em estado rascunho/pendente
 * ou programada (aprovada, ainda não começou). "Encerrar" uma promoção
 * ATIVA não é self-service (seção 15 do pedido) — fica só no fluxo real
 * de suporte/admin (app/api/admin/offers/promotions/[promotionId]).
 *
 * Mesmo padrão de app/api/apps/plans/[id]/promotions/route.ts (POST):
 * client de sessão quando é o próprio dono agindo (RLS
 * owner_cancel_own_pending_or_scheduled_promotion protege de verdade),
 * client admin só quando delegado e a permissão de equipe já foi
 * confirmada em TS.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; promotionId: string }> }
) {
  const { id: planId, promotionId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || body.action !== 'cancel') {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }
  const { partnerId: requestedPartnerId } = body

  const admin = createAdminClient()
  let effectiveOwnerId = user.id
  let delegated = false
  if (typeof requestedPartnerId === 'string' && requestedPartnerId && requestedPartnerId !== user.id) {
    const { data: delegation } = await admin
      .from('app_team_members')
      .select('role, permissions, app_drafts!inner(created_by)')
      .eq('user_id', user.id)
      .eq('app_drafts.created_by', requestedPartnerId)
    const hasPermission = (delegation ?? []).some(tm => tm.role === 'owner' || (tm.permissions ?? []).includes('financeiro_ofertas'))
    if (!hasPermission) {
      return NextResponse.json({ error: 'Sem permissão para cancelar promoção em nome deste parceiro.' }, { status: 403 })
    }
    effectiveOwnerId = requestedPartnerId
    delegated = true
  }

  const db = delegated ? admin : supabase

  const { data: promo } = await db
    .from('promotions')
    .select('id, plan_id, application_id, is_approved, cancelled_at, starts_at, app_plans!inner(app_draft_id, app_drafts!inner(created_by))')
    .eq('id', promotionId)
    .eq('plan_id', planId)
    .single()
  if (!promo) return NextResponse.json({ error: 'Promoção não encontrada.' }, { status: 404 })

  const planRel = Array.isArray(promo.app_plans) ? promo.app_plans[0] : promo.app_plans
  const draftRel = planRel ? (Array.isArray(planRel.app_drafts) ? planRel.app_drafts[0] : planRel.app_drafts) : null
  if (!draftRel || draftRel.created_by !== effectiveOwnerId) {
    return NextResponse.json({ error: 'Sem permissão para cancelar esta promoção.' }, { status: 403 })
  }
  if (promo.cancelled_at) {
    return NextResponse.json({ error: 'Esta promoção já foi cancelada.' }, { status: 409 })
  }
  const isPending = !promo.is_approved
  const isScheduled = promo.is_approved && new Date(promo.starts_at).getTime() > Date.now()
  if (!isPending && !isScheduled) {
    return NextResponse.json({ error: 'Só é possível cancelar um pedido pendente ou uma promoção agendada que ainda não começou — pra encerrar uma promoção ativa, fale com o suporte.' }, { status: 409 })
  }

  const { data: updated, error } = await db
    .from('promotions')
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: user.id, is_active: false })
    .eq('id', promotionId)
    .is('cancelled_at', null)
    .select('id, app_plans!inner(app_draft_id)')
    .single()
  if (error || !updated) {
    return NextResponse.json({ error: 'Esta promoção já foi alterada por outra ação — atualize a página.' }, { status: 409 })
  }

  // app_admin_events só aceita insert de quem passa is_technician() via RLS
  // ("Admins manage admin events") — o ator aqui é sempre um PARCEIRO
  // (nunca técnico), então o client de sessão seria bloqueado em silêncio
  // (logAppAdminEvent descarta o erro). Sempre client admin aqui, mesmo
  // no caminho não-delegado.
  const planRelUpdated = Array.isArray(updated.app_plans) ? updated.app_plans[0] : updated.app_plans
  await logAppAdminEvent(admin, {
    appDraftId: planRelUpdated?.app_draft_id ?? null,
    applicationId: promo.application_id,
    planId,
    promotionId,
    actorId: user.id,
    action: 'cancel_promotion',
    reason: null,
    previousStatus: isPending ? 'pendente' : 'programada',
    newStatus: 'cancelada',
  })

  return NextResponse.json({ ok: true })
}
