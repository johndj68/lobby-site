import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'
import { checkPromotionOverlap, computePromoPriceFromPercent, roundCents } from '@/lib/services/offers'

/**
 * Cria uma promoção mirando UMA oferta (app_plans.id) específica — nunca a
 * lista de cupons paralela nem a área de destaque patrocinado
 * (sponsored_campaigns, seção 17), que tem contratação própria.
 *
 * Criada por um técnico já é aprovada e ativada (is_approved/is_active) —
 * este painel É o mecanismo de aprovação, não existe fluxo de submissão de
 * promoção pelo parceiro no projeto.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para gerenciar promoções.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { name, discountPercent, promoPrice: promoPriceInput, startsAt, endsAt, timezone, unitLimit, eligibleForDailyDeals, internalNote } = body

  const { data: plan } = await supabase
    .from('app_plans')
    .select('id, app_draft_id, price, currency, status, app_drafts(application_id)')
    .eq('id', planId)
    .single()
  if (!plan) return NextResponse.json({ error: 'Oferta não encontrada.' }, { status: 404 })
  if (plan.status === 'archived') {
    return NextResponse.json({ error: 'Oferta arquivada não pode receber promoção.' }, { status: 400 })
  }
  const applicationId = Array.isArray(plan.app_drafts) ? plan.app_drafts[0]?.application_id : (plan.app_drafts as { application_id: string | null } | null)?.application_id
  if (!applicationId) {
    return NextResponse.json({ error: 'O aplicativo desta oferta ainda não foi publicado — publique antes de criar uma promoção.' }, { status: 400 })
  }
  if (plan.price == null) {
    return NextResponse.json({ error: 'Defina o preço regular da oferta antes de criar uma promoção.' }, { status: 400 })
  }

  if (!startsAt || !endsAt || isNaN(Date.parse(startsAt)) || isNaN(Date.parse(endsAt))) {
    return NextResponse.json({ error: 'Informe início e término válidos.' }, { status: 400 })
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return NextResponse.json({ error: 'O término precisa ser posterior ao início.' }, { status: 400 })
  }

  let promoPrice: number
  let discountPercentage: number | null = null
  if (typeof discountPercent === 'number' && discountPercent > 0 && discountPercent < 100) {
    promoPrice = computePromoPriceFromPercent(plan.price, discountPercent)
    discountPercentage = Math.round(discountPercent)
  } else if (typeof promoPriceInput === 'number' && promoPriceInput >= 0) {
    promoPrice = roundCents(promoPriceInput)
    discountPercentage = plan.price > 0 ? Math.round((1 - promoPrice / plan.price) * 100) : null
  } else {
    return NextResponse.json({ error: 'Informe um desconto percentual ou um preço promocional.' }, { status: 400 })
  }
  if (promoPrice >= plan.price) {
    return NextResponse.json({ error: 'O preço promocional precisa ser menor que o preço regular atual.' }, { status: 400 })
  }
  if (promoPrice < 0) {
    return NextResponse.json({ error: 'Preço promocional inválido.' }, { status: 400 })
  }

  const overlap = await checkPromotionOverlap(supabase, { applicationId, planId, startsAt, endsAt })
  if (overlap.conflict) {
    return NextResponse.json({ error: 'Já existe uma promoção vigente para esta oferta nesse período.', conflictPromotionId: overlap.withPromotionId }, { status: 409 })
  }

  const { data: created, error } = await supabase
    .from('promotions')
    .insert({
      application_id: applicationId,
      plan_id: planId,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
      promo_price: promoPrice,
      original_price: plan.price,
      discount_percentage: discountPercentage,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: typeof timezone === 'string' && timezone ? timezone : 'America/Sao_Paulo',
      unit_limit: typeof unitLimit === 'number' && unitLimit > 0 ? Math.round(unitLimit) : null,
      eligible_for_daily_deals: !!eligibleForDailyDeals,
      internal_note: typeof internalNote === 'string' ? internalNote.trim() || null : null,
      is_approved: true,
      is_active: true,
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[promotions POST]', error)
    return NextResponse.json({ error: 'Não foi possível criar a promoção agora — tente novamente.' }, { status: 500 })
  }

  await logAppAdminEvent(supabase, {
    appDraftId: plan.app_draft_id,
    applicationId,
    planId,
    promotionId: created.id,
    actorId: user.id,
    action: 'create_promotion',
    reason: null,
    previousStatus: 'inexistente',
    newStatus: `promoção ${promoPrice} (era ${plan.price})`,
  })

  return NextResponse.json({ ok: true, id: created.id })
}
