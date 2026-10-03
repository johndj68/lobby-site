import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkPromotionOverlap, computeDiscountPercent, computePromoPriceFromPercent, roundCents } from '@/lib/services/offers'

/**
 * Pedido de promoção pelo dono do plano — ou por um membro de equipe
 * agindo em nome do dono (Etapa 8: mesma permissão delegada que toda
 * aba de /dashboard/financeiro/** já usa — role='owner' ou a capacidade
 * 'financeiro_ofertas' em app_team_members.permissions). Nasce sempre
 * is_approved=false, is_active=false (invisível pro público até o
 * admin aprovar, mesma proteção que app/page.tsx já usa pra decidir o
 * que mostrar). Espelha a validação de
 * app/api/admin/offers/[planId]/promotions/route.ts (a rota admin
 * equivalente, que cria já aprovada) — mesmas funções de
 * lib/services/offers.ts, nunca reimplementadas aqui.
 *
 * A checagem de identidade/sessão usa o client de sessão (RLS); quando
 * age em nome de outro parceiro, a checagem de permissão e o insert
 * usam o client de service-role — mesmo padrão já estabelecido em toda
 * rota admin deste projeto (client de sessão pra quem-é-você, client
 * admin pra qualquer leitura/escrita privilegiada). Sem isso, a RLS de
 * owner_insert_own_promotions (que exige created_by/posse do PRÓPRIO
 * auth.uid(), de propósito — ver 20261003120000) bloquearia o insert
 * delegado mesmo com a permissão de equipe concedida.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
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
      return NextResponse.json({ error: 'Sem permissão para pedir promoção em nome deste parceiro.' }, { status: 403 })
    }
    effectiveOwnerId = requestedPartnerId
    delegated = true
  }

  // Delegado: toda leitura/escrita a partir daqui usa o client admin —
  // a permissão já foi verificada acima, e a RLS (que exige
  // auth.uid() === dono) nunca autorizaria o membro de equipe a ler ou
  // inserir em nome de outra pessoa. Não-delegado: continua no client
  // de sessão, mesmo comportamento de sempre (RLS como segunda trava).
  const db = delegated ? admin : supabase

  const { data: plan } = await db
    .from('app_plans')
    .select('id, app_draft_id, price, currency, status, app_drafts(created_by, application_id)')
    .eq('id', planId)
    .single()
  if (!plan) return NextResponse.json({ error: 'Oferta não encontrada.' }, { status: 404 })

  const draft = Array.isArray(plan.app_drafts) ? plan.app_drafts[0] : plan.app_drafts
  if (!draft || draft.created_by !== effectiveOwnerId) {
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
    discountPercentage = computeDiscountPercent(promoPrice, plan.price, null)
  } else {
    return NextResponse.json({ error: 'Informe um desconto percentual ou um preço promocional.' }, { status: 400 })
  }
  if (promoPrice >= plan.price) {
    return NextResponse.json({ error: 'O preço promocional precisa ser menor que o preço regular atual.' }, { status: 400 })
  }

  // No máximo 1 pedido pendente por plano por vez — checkPromotionOverlap
  // cobre sobreposição de DATAS, não "já existe QUALQUER pendente" (ex:
  // um pedido pendente com datas futuras bem distantes de um novo pedido
  // também futuro, sem sobreposição de data, ainda deveria ser bloqueado).
  const { data: existingPending, error: existingPendingError } = await db
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

  const overlap = await checkPromotionOverlap(db, { applicationId, planId, startsAt, endsAt })
  if (overlap.conflict) {
    return NextResponse.json({ error: 'Já existe uma promoção vigente ou pendente pra esta oferta nesse período.', conflictPromotionId: overlap.withPromotionId }, { status: 409 })
  }

  const { data: created, error } = await db
    .from('promotions')
    .insert({
      application_id: applicationId,
      plan_id: planId,
      // created_by é sempre QUEM DE FATO submeteu (o membro de equipe,
      // quando delegado) — não o dono (effectiveOwnerId) — mesmo
      // princípio de auditoria de logAppAdminEvent: actor ≠ sujeito da
      // ação. A associação "de qual dono é este pedido" já vem de
      // plan_id/application_id, sem precisar sobrepor created_by.
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
