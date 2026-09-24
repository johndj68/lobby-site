import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'
import { checkPromotionOverlap } from '@/lib/services/offers'

/**
 * Ciclo de vida de UMA promoção: pausar, cancelar, reativar (só a partir de
 * "encerrada", exige novo período válido — seção 13) ou editar campos.
 * Corpo: { action: 'pause' | 'resume' | 'cancel' | 'reactivate', ... }
 * Sem `action`, atualiza campos e revalida sobreposição/preço regular.
 *
 * Encerrar/pausar a promoção NUNCA reativa uma oferta pausada ou bloqueada
 * (seção 13) — só afeta a linha de promotions.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ promotionId: string }> }
) {
  const { promotionId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para gerenciar promoções.' }, { status: 403 })
  }

  const { data: promo } = await supabase
    .from('promotions')
    .select('id, application_id, plan_id, ends_at, cancelled_at, paused_at, app_plans(app_draft_id)')
    .eq('id', promotionId)
    .single()
  if (!promo) return NextResponse.json({ error: 'Promoção não encontrada.' }, { status: 404 })
  const appDraftId = Array.isArray(promo.app_plans) ? promo.app_plans[0]?.app_draft_id : (promo.app_plans as { app_draft_id: string } | null)?.app_draft_id ?? null

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { action } = body

  if (action === 'pause') {
    if (promo.cancelled_at) return NextResponse.json({ error: 'Promoção já cancelada.' }, { status: 409 })
    if (promo.paused_at) return NextResponse.json({ error: 'Promoção já está pausada.' }, { status: 409 })
    await supabase.from('promotions').update({ paused_at: new Date().toISOString(), paused_by: user.id }).eq('id', promotionId)
    await logAppAdminEvent(supabase, { appDraftId, applicationId: promo.application_id, planId: promo.plan_id, promotionId, actorId: user.id, action: 'pause_promotion', reason: null, previousStatus: 'ativa', newStatus: 'pausada' })
    return NextResponse.json({ ok: true })
  }

  if (action === 'resume') {
    if (!promo.paused_at) return NextResponse.json({ error: 'Promoção não está pausada.' }, { status: 409 })
    if (promo.cancelled_at) return NextResponse.json({ error: 'Promoção cancelada — crie uma nova.' }, { status: 409 })
    if (new Date(promo.ends_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'O período desta promoção já terminou — use reativar com um novo período.' }, { status: 400 })
    }
    await supabase.from('promotions').update({ paused_at: null, paused_by: null }).eq('id', promotionId)
    await logAppAdminEvent(supabase, { appDraftId, applicationId: promo.application_id, planId: promo.plan_id, promotionId, actorId: user.id, action: 'update_promotion', reason: null, previousStatus: 'pausada', newStatus: 'ativa' })
    return NextResponse.json({ ok: true })
  }

  if (action === 'cancel') {
    if (promo.cancelled_at) return NextResponse.json({ error: 'Promoção já cancelada.' }, { status: 409 })
    const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null
    await supabase.from('promotions').update({ cancelled_at: new Date().toISOString(), cancelled_by: user.id, is_active: false }).eq('id', promotionId)
    await logAppAdminEvent(supabase, { appDraftId, applicationId: promo.application_id, planId: promo.plan_id, promotionId, actorId: user.id, action: 'cancel_promotion', reason, previousStatus: 'ativa_ou_programada', newStatus: 'cancelada' })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reactivate') {
    if (promo.cancelled_at) return NextResponse.json({ error: 'Promoção cancelada não pode ser reativada — crie uma nova.' }, { status: 409 })
    if (new Date(promo.ends_at).getTime() > Date.now() && !promo.paused_at) {
      return NextResponse.json({ error: 'Esta promoção ainda está vigente.' }, { status: 409 })
    }
    const { startsAt, endsAt } = body
    if (!startsAt || !endsAt || isNaN(Date.parse(startsAt)) || isNaN(Date.parse(endsAt))) {
      return NextResponse.json({ error: 'Informe um novo período (início e término) válido para reativar.' }, { status: 400 })
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return NextResponse.json({ error: 'O término precisa ser posterior ao início.' }, { status: 400 })
    }
    const overlap = await checkPromotionOverlap(supabase, { applicationId: promo.application_id, planId: promo.plan_id, startsAt, endsAt, excludePromotionId: promotionId })
    if (overlap.conflict) {
      return NextResponse.json({ error: 'Já existe uma promoção vigente para esta oferta nesse período.', conflictPromotionId: overlap.withPromotionId }, { status: 409 })
    }
    await supabase.from('promotions').update({ starts_at: startsAt, ends_at: endsAt, paused_at: null, paused_by: null, is_active: true }).eq('id', promotionId)
    await logAppAdminEvent(supabase, { appDraftId, applicationId: promo.application_id, planId: promo.plan_id, promotionId, actorId: user.id, action: 'reactivate_promotion', reason: null, previousStatus: 'encerrada_ou_pausada', newStatus: 'programada_ou_ativa' })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
}
