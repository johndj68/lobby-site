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
    .select('id, application_id, plan_id, promo_price, original_price, starts_at, ends_at, is_approved, cancelled_at, paused_at, rejected_at, previous_version_id, superseded_at, app_plans(app_draft_id, price, status)')
    .eq('id', promotionId)
    .single()
  if (!promo) return NextResponse.json({ error: 'Promoção não encontrada.' }, { status: 404 })
  const planInfo = Array.isArray(promo.app_plans) ? promo.app_plans[0] : promo.app_plans
  const appDraftId = planInfo?.app_draft_id ?? null

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { action } = body

  if (action === 'approve') {
    if (promo.is_approved) return NextResponse.json({ error: 'Este pedido já foi aprovado.' }, { status: 409 })
    if (promo.cancelled_at || promo.rejected_at) return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })

    // Oferta arquivada/pausada não pode ganhar promoção nova aprovada —
    // sem isso a cascata de pausa automática (20261006120000) seria
    // imediatamente desfeita por uma aprovação manual.
    if (planInfo?.status === 'archived' || planInfo?.status === 'paused') {
      return NextResponse.json({ error: `Esta oferta está ${planInfo.status === 'archived' ? 'arquivada' : 'pausada'} — não é possível aprovar promoção pra ela agora.` }, { status: 409 })
    }

    // O preço regular do plano pode ter mudado desde o pedido (ex: uma
    // mudança de preço da Etapa 6 foi aprovada nesse meio-tempo) — nunca
    // aprovar um "desconto" que virou preço igual ou maior que o atual.
    if (planInfo?.price != null && promo.promo_price >= planInfo.price) {
      return NextResponse.json({ error: 'O preço regular da oferta mudou desde o pedido — peça uma nova promoção com o preço atual.' }, { status: 400 })
    }
    if (promo.original_price != null && planInfo?.price != null && promo.original_price !== planInfo.price) {
      return NextResponse.json({ error: 'O preço regular da oferta mudou desde o pedido — peça uma nova promoção com o preço atual.' }, { status: 400 })
    }

    // Edição de uma promoção aprovada (versionamento) — a versão antiga
    // (previous_version_id) continua "ativa" de propósito até aqui, então
    // precisa ser excluída do overlap check junto com a própria linha.
    // Só exclui a versão anterior do overlap check quando a nova toma posse
    // IMEDIATAMENTE (starts_at já chegou) — é exatamente quando o trigger
    // de supersessão vai desativá-la no mesmo instante desta aprovação.
    // Se a nova é agendada pro futuro, a antiga continua contando no
    // overlap check de propósito — força start_at da nova ser >= o
    // ends_at da antiga (ou a aprovação é rejeitada com o erro de
    // conflito já existente), nunca as duas "vigentes" ao mesmo tempo.
    const immediateTakeover = !!promo.previous_version_id && new Date(promo.starts_at).getTime() <= Date.now()
    const excludeIds = immediateTakeover ? [promotionId, promo.previous_version_id!] : promotionId
    const overlap = await checkPromotionOverlap(supabase, { applicationId: promo.application_id, planId: promo.plan_id, startsAt: promo.starts_at, endsAt: promo.ends_at, excludePromotionId: excludeIds })
    if (overlap.conflict) {
      return NextResponse.json({ error: 'Já existe uma promoção vigente pra esta oferta nesse período — não dá pra aprovar agora.', conflictPromotionId: overlap.withPromotionId }, { status: 409 })
    }

    const { data: resolved, error: approveError } = await supabase
      .from('promotions')
      .update({ is_approved: true, is_active: true })
      .eq('id', promotionId)
      .eq('is_approved', false)
      .is('cancelled_at', null)
      .is('rejected_at', null)
      .select('id')
      .single()
    if (approveError || !resolved) {
      return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
    }

    await logAppAdminEvent(supabase, { appDraftId, applicationId: promo.application_id, planId: promo.plan_id, promotionId, actorId: user.id, action: 'create_promotion', reason: null, previousStatus: 'pendente', newStatus: `promoção ${promo.promo_price} aprovada` })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    if (promo.is_approved) return NextResponse.json({ error: 'Este pedido já foi aprovado — não pode mais ser rejeitado.' }, { status: 409 })
    if (promo.cancelled_at) return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
    if (promo.rejected_at) return NextResponse.json({ error: 'Este pedido já foi rejeitado.' }, { status: 409 })
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) return NextResponse.json({ error: 'Informe o motivo da rejeição.' }, { status: 400 })

    const { data: resolved, error: rejectError } = await supabase
      .from('promotions')
      .update({ rejected_at: new Date().toISOString(), rejected_by: user.id, rejection_reason: reason })
      .eq('id', promotionId)
      .eq('is_approved', false)
      .is('rejected_at', null)
      .is('cancelled_at', null)
      .select('id')
      .single()
    if (rejectError || !resolved) {
      return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
    }

    await logAppAdminEvent(supabase, { appDraftId, applicationId: promo.application_id, planId: promo.plan_id, promotionId, actorId: user.id, action: 'reject_promotion', reason, previousStatus: 'pendente', newStatus: 'rejeitada' })
    return NextResponse.json({ ok: true })
  }

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
    // Mesma trava do 'approve' (20261006120000) — sem isso, retomar uma
    // promoção pausada pela cascata automática (oferta arquivada/pausada)
    // desfaz exatamente a proteção que a cascata existe pra garantir.
    if (planInfo?.status === 'archived' || planInfo?.status === 'paused') {
      return NextResponse.json({ error: `Esta oferta está ${planInfo.status === 'archived' ? 'arquivada' : 'pausada'} — não é possível retomar a promoção agora.` }, { status: 409 })
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
    // Versão substituída (20261006120000) não é "encerrada" — é obsoleta de
    // propósito, reativá-la ressuscitaria termos velhos por cima da versão
    // vigente de verdade. checkPromotionOverlap também já ignora linhas
    // superseded, então sem este bloqueio ela voltaria "ativa" sem nem
    // conflitar com a versão nova no overlap check.
    if (promo.superseded_at) return NextResponse.json({ error: 'Esta promoção foi substituída por uma versão mais recente — reativá-la não é permitido.' }, { status: 409 })
    if (new Date(promo.ends_at).getTime() > Date.now() && !promo.paused_at) {
      return NextResponse.json({ error: 'Esta promoção ainda está vigente.' }, { status: 409 })
    }
    if (planInfo?.status === 'archived' || planInfo?.status === 'paused') {
      return NextResponse.json({ error: `Esta oferta está ${planInfo.status === 'archived' ? 'arquivada' : 'pausada'} — não é possível reativar promoção pra ela agora.` }, { status: 409 })
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
