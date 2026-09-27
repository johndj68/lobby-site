import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface CheckoutBody {
  plan_id: string
}

/**
 * Checkout próprio de app de parceiro/LOBBY — mesmo padrão de
 * /api/stripe/checkout (créditos): nunca confia em preço vindo do client,
 * cria o pedido 'pending' antes da sessão Stripe, snapshot da comissão
 * vigente na hora da venda (get_partner_commission_percent), nunca
 * recalculada depois.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  // 5 checkout sessions por minuto por usuário — mesmo limite do checkout de créditos.
  const rl = checkRateLimit({ key: `app-checkout:${user.id}`, limit: 5, windowMs: 60_000 })
  const limited = rateLimitResponse(rl)
  if (limited) return limited

  let body: CheckoutBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const { plan_id } = body
  if (!plan_id || typeof plan_id !== 'string') {
    return NextResponse.json({ error: 'plan_id é obrigatório.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('app_plans')
    .select('id, app_draft_id, name, price, currency, billing_period, status')
    .eq('id', plan_id)
    .eq('status', 'active')
    .single()

  if (!plan) {
    return NextResponse.json({ error: 'Plano não encontrado ou indisponível.' }, { status: 404 })
  }
  if (plan.billing_period === 'monthly' || plan.billing_period === 'yearly') {
    return NextResponse.json({ error: 'Este plano é uma assinatura recorrente — ainda não disponível no checkout.' }, { status: 400 })
  }
  if (!plan.price || Number(plan.price) <= 0) {
    return NextResponse.json({ error: 'Este plano não tem preço configurado.' }, { status: 400 })
  }

  const { data: draft } = await admin
    .from('app_drafts')
    .select('id, created_by, application_id')
    .eq('id', plan.app_draft_id)
    .single()

  if (!draft?.application_id) {
    return NextResponse.json({ error: 'Aplicativo não encontrado.' }, { status: 404 })
  }

  // Confirma que o app da URL é de fato o dono deste plano — evita
  // inconsistência entre appId da rota e o plan_id enviado no corpo.
  const { data: application } = await admin
    .from('applications')
    .select('id, name, slug, is_published, suspended_at, is_lobby_made, category_id')
    .eq('id', draft.application_id)
    .eq('id', appId)
    .single()

  if (!application || !application.is_published || application.suspended_at) {
    return NextResponse.json({ error: 'Aplicativo indisponível para compra.' }, { status: 404 })
  }

  // Tudo em centavos (inteiro) daqui pra frente — evita drift de ponto
  // flutuante e garante que commission + partner sempre somam o total
  // exato (bate com o CHECK do banco em app_purchases).
  const amountCents = Math.round(Number(plan.price) * 100)
  const partnerId = application.is_lobby_made ? null : draft.created_by

  let commissionPercent = 0
  let commissionCents = amountCents // app da LOBBY: 100% fica com a LOBBY, sem parceiro pra repassar
  if (partnerId) {
    const { data: percentRaw, error: commErr } = await admin.rpc('get_partner_commission_percent', {
      p_partner_id: partnerId,
      p_category_id: application.category_id,
    })
    if (commErr) {
      console.error('[apps/checkout] commission resolution failed', commErr)
      return NextResponse.json({ error: 'Não foi possível calcular a comissão desta venda.' }, { status: 500 })
    }
    commissionPercent = Number(percentRaw)
    commissionCents = Math.round((amountCents * commissionPercent) / 100)
  }
  const partnerCents = amountCents - commissionCents

  const { data: purchase, error: insertError } = await admin
    .from('app_purchases')
    .insert({
      application_id:      application.id,
      plan_id:             plan.id,
      application_name:    application.name,
      plan_name:           plan.name,
      buyer_user_id:       user.id,
      partner_id:          partnerId,
      amount:              amountCents / 100,
      currency:            plan.currency ?? 'BRL',
      commission_percent:  commissionPercent,
      commission_amount:   commissionCents / 100,
      partner_amount:      partnerCents / 100,
      status:              'pending',
    })
    .select('id')
    .single()

  if (insertError || !purchase) {
    console.error('[apps/checkout] failed to create purchase record', insertError)
    return NextResponse.json({ error: 'Não foi possível iniciar a compra.' }, { status: 500 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency:     (plan.currency ?? 'BRL').toLowerCase(),
        unit_amount:  amountCents,
        product_data: { name: `${application.name} — ${plan.name}` },
      },
      quantity: 1,
    }],
    mode:                'payment',
    success_url:         `${siteUrl}/dashboard/minhas-compras?checkout=success`,
    cancel_url:           `${siteUrl}/marketplace/${application.slug}?checkout=canceled`,
    customer_email:      user.email,
    client_reference_id: purchase.id,
    metadata: {
      purchase_id: purchase.id,
      user_id:     user.id,
      kind:        'app_purchase',
    },
  })

  await admin.from('app_purchases').update({ stripe_session_id: session.id }).eq('id', purchase.id)

  return NextResponse.json({ url: session.url })
}
