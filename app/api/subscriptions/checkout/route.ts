import { NextRequest, NextResponse } from 'next/server'
import { stripe, getOrCreateStripeCustomer } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface CheckoutBody {
  product_type: 'app_plan' | 'mensalidade'
  app_plan_id?: string
  client_project_id?: string
}

/**
 * Checkout de assinatura recorrente (Stripe Billing) — os dois produtos:
 * app_plan (mensal/anual de app de parceiro/LOBBY) e mensalidade (projeto
 * de cliente). Mesmo padrão de nunca confiar em preço/comissão vindo do
 * client dos outros checkouts (créditos/campanha/app avulso), mas com
 * mode: 'subscription' e um Customer Stripe persistente em vez de
 * customer_email avulso.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const rl = checkRateLimit({ key: `subscription-checkout:${user.id}`, limit: 5, windowMs: 60_000 })
  const limited = rateLimitResponse(rl)
  if (limited) return limited

  let body: CheckoutBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()

  let planName: string
  let amount: number
  let interval: 'month' | 'year'
  let appPlanId: string | null = null
  let clientProjectId: string | null = null
  let partnerId: string | null = null
  let commissionPercent = 0

  if (body.product_type === 'app_plan') {
    if (!body.app_plan_id) return NextResponse.json({ error: 'app_plan_id é obrigatório.' }, { status: 400 })

    const { data: plan } = await admin
      .from('app_plans')
      .select('id, app_draft_id, name, price, currency, billing_period, status')
      .eq('id', body.app_plan_id)
      .eq('status', 'active')
      .single()
    if (!plan) return NextResponse.json({ error: 'Plano não encontrado ou indisponível.' }, { status: 404 })
    if (plan.billing_period !== 'monthly' && plan.billing_period !== 'yearly') {
      return NextResponse.json({ error: 'Este plano não é uma assinatura recorrente.' }, { status: 400 })
    }
    if (!plan.price || Number(plan.price) <= 0) {
      return NextResponse.json({ error: 'Este plano não tem preço configurado.' }, { status: 400 })
    }

    const { data: draft } = await admin.from('app_drafts').select('id, created_by, application_id').eq('id', plan.app_draft_id).single()
    if (!draft?.application_id) return NextResponse.json({ error: 'Aplicativo não encontrado.' }, { status: 404 })

    const { data: application } = await admin
      .from('applications')
      .select('id, name, is_published, suspended_at, is_lobby_made, category_id')
      .eq('id', draft.application_id)
      .single()
    if (!application || !application.is_published || application.suspended_at) {
      return NextResponse.json({ error: 'Aplicativo indisponível para compra.' }, { status: 404 })
    }

    planName = `${application.name} — ${plan.name}`
    amount = Number(plan.price)
    interval = plan.billing_period === 'monthly' ? 'month' : 'year'
    appPlanId = plan.id
    partnerId = application.is_lobby_made ? null : draft.created_by

    if (partnerId) {
      const { data: percentRaw, error: commErr } = await admin.rpc('get_partner_commission_percent', {
        p_partner_id: partnerId,
        p_category_id: application.category_id,
      })
      if (commErr) {
        console.error('[subscriptions/checkout] commission resolution failed', commErr)
        return NextResponse.json({ error: 'Não foi possível calcular a comissão desta assinatura.' }, { status: 500 })
      }
      commissionPercent = Number(percentRaw)
    }
  } else if (body.product_type === 'mensalidade') {
    if (!body.client_project_id) return NextResponse.json({ error: 'client_project_id é obrigatório.' }, { status: 400 })

    const { data: project } = await admin
      .from('client_projects')
      .select('id, title, client_id, monthly_fee')
      .eq('id', body.client_project_id)
      .eq('client_id', user.id) // só o próprio cliente do projeto pode assinar
      .single()
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 })
    if (!project.monthly_fee || Number(project.monthly_fee) <= 0) {
      return NextResponse.json({ error: 'Este projeto ainda não tem mensalidade configurada — fale com seu técnico.' }, { status: 400 })
    }

    planName = `Mensalidade — ${project.title}`
    amount = Number(project.monthly_fee)
    interval = 'month'
    clientProjectId = project.id
  } else {
    return NextResponse.json({ error: 'product_type inválido.' }, { status: 400 })
  }

  // Impede assinatura duplicada do mesmo produto enquanto uma já ativa/em
  // tentativa existe.
  const existingQuery = admin
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['active', 'past_due', 'incomplete'])
  const { data: existing } = appPlanId
    ? await existingQuery.eq('app_plan_id', appPlanId).maybeSingle()
    : await existingQuery.eq('client_project_id', clientProjectId).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'Você já tem uma assinatura ativa para este item.' }, { status: 409 })
  }

  const stripeCustomerId = await getOrCreateStripeCustomer(admin, user.id, user.email!, user.user_metadata?.full_name)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const metadata = {
    kind:                'subscription',
    product_type:        body.product_type,
    user_id:             user.id,
    app_plan_id:         appPlanId ?? '',
    client_project_id:   clientProjectId ?? '',
    partner_id:          partnerId ?? '',
    commission_percent:  String(commissionPercent),
    plan_name:           planName,
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer:             stripeCustomerId,
    mode:                 'subscription',
    line_items: [{
      price_data: {
        currency:     'brl',
        unit_amount:  Math.round(amount * 100),
        product_data: { name: planName },
        recurring:    { interval },
      },
      quantity: 1,
    }],
    success_url:    `${siteUrl}/dashboard/assinaturas?checkout=success`,
    cancel_url:     `${siteUrl}/dashboard/assinaturas?checkout=canceled`,
    metadata,
    subscription_data: { metadata },
  })

  return NextResponse.json({ url: session.url })
}
