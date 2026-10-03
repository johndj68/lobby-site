import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkPromotionOverlap, computePromoPriceFromPercent, roundCents } from '@/lib/services/offers'

/**
 * Pedido de promoção pelo PRÓPRIO dono do plano — nasce sempre
 * is_approved=false, is_active=false (invisível pro público até o
 * admin aprovar, mesma proteção que app/page.tsx já usa pra decidir o
 * que mostrar). Espelha a validação de
 * app/api/admin/offers/[planId]/promotions/route.ts (a rota admin
 * equivalente, que cria já aprovada) — mesmas funções de
 * lib/services/offers.ts, nunca reimplementadas aqui.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: plan } = await supabase
    .from('app_plans')
    .select('id, app_draft_id, price, currency, status, app_drafts(created_by, application_id)')
    .eq('id', planId)
    .single()
  if (!plan) return NextResponse.json({ error: 'Oferta não encontrada.' }, { status: 404 })

  const draft = Array.isArray(plan.app_drafts) ? plan.app_drafts[0] : plan.app_drafts
  if (!draft || draft.created_by !== user.id) {
    return NextResponse.json({ error: 'Sem permissão para pedir promoção pra este plano.' }, { status: 403 })
  }
  if (plan.status === 'archived') {
    return NextResponse.json({ error: 'Oferta arquivada não pode receber promoção.' }, { status: 400 })
  }
  const applicationId = draft.application_id
  if (!applicationId) {
    return NextResponse.json({ error: 'O aplicativo desta oferta ainda não foi publicado — publique antes de pedir uma promoção.' }, { status: 400 })
  }
  if (plan.price == null) {
    return NextResponse.json({ error: 'Defina o preço regular da oferta antes de pedir uma promoção.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { discountPercent, promoPrice: promoPriceInput, startsAt, endsAt, timezone, unitLimit, eligibleForDailyDeals } = body

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

  // No máximo 1 pedido pendente por plano por vez — checkPromotionOverlap
  // cobre sobreposição de DATAS, não "já existe QUALQUER pendente" (ex:
  // um pedido pendente com datas futuras bem distantes de um novo pedido
  // também futuro, sem sobreposição de data, ainda deveria ser bloqueado).
  const { data: existingPending, error: existingPendingError } = await supabase
    .from('promotions')
    .select('id')
    .eq('plan_id', planId)
    .eq('is_approved', false)
    .is('rejected_at', null)
    .is('cancelled_at', null)
    .maybeSingle()
  if (existingPendingError) {
    console.error('[plan promotions POST] failed to check existing pending request', existingPendingError)
    return NextResponse.json({ error: 'Não foi possível verificar pedidos pendentes. Tente novamente.' }, { status: 500 })
  }
  if (existingPending) {
    return NextResponse.json({ error: 'Já existe um pedido de promoção aguardando aprovação pra este plano.' }, { status: 409 })
  }

  const overlap = await checkPromotionOverlap(supabase, { applicationId, planId, startsAt, endsAt })
  if (overlap.conflict) {
    return NextResponse.json({ error: 'Já existe uma promoção vigente ou pendente pra esta oferta nesse período.', conflictPromotionId: overlap.withPromotionId }, { status: 409 })
  }

  const { data: created, error } = await supabase
    .from('promotions')
    .insert({
      application_id: applicationId,
      plan_id: planId,
      created_by: user.id,
      promo_price: promoPrice,
      original_price: plan.price,
      discount_percentage: discountPercentage,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: typeof timezone === 'string' && timezone ? timezone : 'America/Sao_Paulo',
      unit_limit: typeof unitLimit === 'number' && unitLimit > 0 ? Math.round(unitLimit) : null,
      eligible_for_daily_deals: !!eligibleForDailyDeals,
      is_approved: false,
      is_active: false,
    })
    .select('id')
    .single()

  if (error || !created) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Já existe um pedido de promoção aguardando aprovação pra este plano.' }, { status: 409 })
    }
    console.error('[plan promotions POST]', error)
    return NextResponse.json({ error: 'Não foi possível registrar o pedido de promoção. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: created.id })
}
