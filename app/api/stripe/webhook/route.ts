import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase-admin'
import { captureException } from '@/lib/monitoring'
import { sendEmail, buildCreditReceiptEmailHtml, buildAppPurchaseReceiptEmailHtml, buildSubscriptionPaymentFailedEmailHtml, buildDisputeCreatedEmailHtml } from '@/lib/notifications'
import { confirmReservationOrFlagConflict } from '@/lib/services/campaigns'
import { logAppAdminEvent } from '@/lib/services/app-publish'

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

  if (!WEBHOOK_SECRET) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stripe/webhook] Signature verification failed:', msg)
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
        break

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge)
        break

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object as Stripe.Dispute)
        break

      case 'charge.dispute.closed':
        await handleDisputeClosed(event.data.object as Stripe.Dispute)
        break

      default:
        // Unhandled event type — acknowledge so Stripe doesn't retry
        break
    }
  } catch (err) {
    captureException(err, { event_type: event.type, event_id: event.id })
    // Não finge sucesso: devolve erro pra Stripe reentregar o evento com o
    // retry nativo dele (backoff automático, visível no Dashboard, até
    // vários dias). A fila própria que existia aqui (webhook_queue via
    // lib/webhook-queue.ts) nunca era populada — enqueueWebhookJob não era
    // chamado em lugar nenhum — e o cron de retry (/api/webhook-retry) só
    // marcava o job como concluído sem reprocessar nada. Os handlers abaixo
    // já são idempotentes (SELECT...FOR UPDATE + checagem de status antes de
    // agir), então uma redelivery do Stripe nunca duplica crédito/lançamento.
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Assinatura não tem purchase_id pré-criado (diferente de crédito/
  // campanha/app avulso) — não existe "pedido pending" antes do Stripe,
  // porque o Customer+Subscription só passam a existir quando o checkout
  // é concluído. A linha em `subscriptions` nasce aqui, não antes.
  if (session.metadata?.kind === 'subscription') {
    await handleSubscriptionCheckoutCompleted(session)
    return
  }

  const purchaseId = session.metadata?.purchase_id
  if (!purchaseId) {
    // Could be a different product — not a credit purchase
    console.warn('[stripe/webhook] checkout.session.completed without purchase_id in metadata. session:', session.id)
    return
  }

  if (session.metadata?.kind === 'campaign') {
    await handleCampaignCheckoutCompleted(session, purchaseId)
    return
  }

  if (session.metadata?.kind === 'app_purchase') {
    await handleAppPurchaseCheckoutCompleted(session, purchaseId)
    return
  }

  const admin = createAdminClient()

  // Redelivery check: Stripe retries this webhook (timeout, manual redelivery
  // from the dashboard, etc.) — the RPC below is already idempotent for the
  // credit-minting/financial_transactions side (row lock + status check in
  // confirm_credit_purchase_webhook), but nothing stopped the receipt email
  // from being re-sent to the customer on every redelivery. Reading the
  // pre-RPC status tells us whether this call is the actual first
  // confirmation or just Stripe replaying an already-processed event.
  const { data: existing } = await admin
    .from('credit_purchases')
    .select('status')
    .eq('id', purchaseId)
    .single()
  const alreadyConfirmed = existing?.status === 'paid'

  // Store Stripe identifiers on the purchase record for audit trail
  await admin
    .from('credit_purchases')
    .update({
      stripe_session_id:       session.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    })
    .eq('id', purchaseId)

  // Confirm purchase via dedicated webhook function (no is_leader check —
  // service_role doesn't have auth.uid(), so the leader-gated version fails)
  const { data: purchaseRaw, error } = await admin.rpc('confirm_credit_purchase_webhook', { p_purchase_id: purchaseId })
  if (error) {
    console.error('[stripe/webhook] confirm_credit_purchase RPC failed:', error)
    throw new Error(error.message)
  }

  console.info('[stripe/webhook] Credit purchase confirmed:', purchaseId)

  if (alreadyConfirmed) {
    console.info('[stripe/webhook] Redelivery of an already-confirmed purchase — skipping receipt email:', purchaseId)
    return
  }

  // Send receipt email — fire-and-forget so a broken email never fails the webhook
  sendCreditReceiptEmail(purchaseRaw, admin).catch(err =>
    console.error('[stripe/webhook] Receipt email error:', err)
  )
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>

interface PurchaseRow {
  user_id:       string
  credits_amount: number
  amount_paid:   number
  package_id:    string
  paid_at:       string | null
}

async function sendCreditReceiptEmail(purchaseRaw: unknown, admin: SupabaseAdmin) {
  const purchase = purchaseRaw as PurchaseRow | null
  if (!purchase?.user_id) return

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const [profileRes, walletRes, pkgRes] = await Promise.all([
    admin.from('profiles').select('full_name, email').eq('id', purchase.user_id).single(),
    admin.from('client_credit_wallets').select('balance').eq('user_id', purchase.user_id).single(),
    admin.from('credit_packages').select('name').eq('id', purchase.package_id).single(),
  ])

  const email = profileRes.data?.email
  if (!email) return

  const firstName      = profileRes.data?.full_name?.split(' ')[0] ?? 'Cliente'
  const balance        = walletRes.data?.balance ?? purchase.credits_amount
  const packageName    = pkgRes.data?.name ?? `${purchase.credits_amount} créditos`
  const amountFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(purchase.amount_paid))
  const dateFormatted  = new Date(purchase.paid_at ?? Date.now()).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  const html = buildCreditReceiptEmailHtml({
    recipientName:   firstName,
    credits:         purchase.credits_amount,
    amountFormatted,
    balance,
    dateFormatted,
    packageName,
    ctaUrl:          `${SITE_URL}/dashboard/creditos`,
  })

  await sendEmail(email, `[LOBBY] ${purchase.credits_amount} créditos adicionados ao seu saldo`, html)
}

async function handlePaymentFailed(intent: Stripe.PaymentIntent) {
  const purchaseId = intent.metadata?.purchase_id
  if (!purchaseId) return

  const admin = createAdminClient()

  if (intent.metadata?.kind === 'campaign') {
    await admin.from('campaign_purchases').update({ status: 'failed' }).eq('id', purchaseId).eq('status', 'pending')
    console.info('[stripe/webhook] Campaign payment failed for purchase:', purchaseId)
    return
  }

  if (intent.metadata?.kind === 'app_purchase') {
    await admin.from('app_purchases').update({ status: 'failed' }).eq('id', purchaseId).eq('status', 'pending')
    console.info('[stripe/webhook] App purchase payment failed:', purchaseId)
    return
  }

  await admin
    .from('credit_purchases')
    .update({ status: 'failed' })
    .eq('id', purchaseId)
    .eq('status', 'pending')

  console.info('[stripe/webhook] Payment failed for purchase:', purchaseId)
}

/**
 * Confirmação de pagamento de campanha de destaque patrocinado — separado
 * do fluxo de créditos (seção 12: pagamento da publicidade nunca vira o
 * mesmo sistema do pagamento de compras de app). Idempotente: redelivery
 * de um evento já processado não duplica confirmação nem reenvia e-mail.
 * Se a capacidade sumiu entre o hold e a confirmação, marca "pago" mas
 * grava a pendência de conciliação em vez de fingir que entrou no ar.
 */
async function handleCampaignCheckoutCompleted(session: Stripe.Checkout.Session, purchaseId: string) {
  const admin = createAdminClient()
  const campaignId = session.metadata?.campaign_id
  if (!campaignId) {
    console.warn('[stripe/webhook] campaign checkout without campaign_id:', session.id)
    return
  }

  const { data: existing } = await admin.from('campaign_purchases').select('status').eq('id', purchaseId).single()
  if (existing?.status === 'paid') {
    console.info('[stripe/webhook] Redelivery of an already-confirmed campaign purchase — skipping:', purchaseId)
    return
  }

  await admin
    .from('campaign_purchases')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null),
    })
    .eq('id', purchaseId)

  const confirmed = await confirmReservationOrFlagConflict(admin, campaignId)

  await logAppAdminEvent(admin, {
    campaignId,
    actorId: null, // sem usuário humano nesta chamada (service role) — mesmo espírito do responsible_user_id omitido em confirm_credit_purchase_webhook
    action: confirmed.ok ? 'confirm_payment' : 'payment_capacity_conflict',
    reason: confirmed.ok ? null : confirmed.error,
    previousStatus: 'pendente',
    newStatus: confirmed.ok ? 'pago' : 'pago_com_pendencia_de_conciliacao',
  })

  const { data: campaign } = await admin.from('sponsored_campaigns').select('app_draft_id').eq('id', campaignId).single()
  if (campaign?.app_draft_id) {
    const { data: draft } = await admin.from('app_drafts').select('created_by').eq('id', campaign.app_draft_id).single()
    if (draft?.created_by) {
      const { data: ownerProfile } = await admin.from('profiles').select('email').eq('id', draft.created_by).single()
      if (ownerProfile?.email) {
        const html = confirmed.ok
          ? '<p>Pagamento confirmado! Sua campanha de destaque patrocinado entra na fila de veiculação assim que o período começar.</p>'
          : '<p>Seu pagamento foi confirmado, mas a vaga do espaço expirou antes da confirmação. Nosso time vai entrar em contato para reagendar ou reembolsar.</p>'
        sendEmail(ownerProfile.email, '[LOBBY] Pagamento da campanha confirmado', html).catch(err => console.error('[stripe/webhook] email error', err))
      }
    }
  }

  console.info('[stripe/webhook] Campaign purchase confirmed:', purchaseId, confirmed.ok ? 'ok' : 'capacity conflict')
}

/**
 * Confirmação de compra de app de parceiro/LOBBY. Idempotente (redelivery
 * não duplica nem reenvia e-mail). Lança em financial_transactions só
 * commission_amount — o valor que fica com a LOBBY, não o preço bruto
 * pago pelo cliente (seção 17: não chamar venda bruta de receita própria;
 * o resto, partner_amount, é dinheiro do parceiro, ainda não repassado —
 * fica só em app_purchases até a peça 4 do roadmap existir).
 *
 * "Entrega" é sempre app_activation_config (link/instruções/e-mail de
 * suporte) — nunca um código automático, porque app_activation_codes
 * nunca foi ligado de verdade no sistema (ver comentário em
 * lib/notifications.ts:buildAppPurchaseReceiptEmailHtml).
 */
async function handleAppPurchaseCheckoutCompleted(session: Stripe.Checkout.Session, purchaseId: string) {
  const admin = createAdminClient()

  const { data: existing } = await admin.from('app_purchases').select('status').eq('id', purchaseId).single()
  if (existing?.status === 'paid') {
    console.info('[stripe/webhook] Redelivery of an already-confirmed app purchase — skipping:', purchaseId)
    return
  }

  const { data: purchase, error } = await admin
    .from('app_purchases')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null),
    })
    .eq('id', purchaseId)
    .select('id, buyer_user_id, plan_id, application_name, plan_name, amount, commission_amount, currency')
    .single()

  if (error || !purchase) {
    console.error('[stripe/webhook] failed to confirm app purchase:', error)
    throw new Error(error?.message ?? 'app purchase not found')
  }

  await admin.from('financial_transactions').insert({
    type: 'app',
    client_id: purchase.buyer_user_id,
    description: `App: ${purchase.application_name} (${purchase.plan_name})`,
    amount: purchase.commission_amount,
    status: 'pago',
    sale_date: new Date().toISOString().slice(0, 10),
    received_date: new Date().toISOString().slice(0, 10),
    source_type: 'app_purchases',
    source_id: purchase.id,
  })

  console.info('[stripe/webhook] App purchase confirmed:', purchaseId)

  // Entrega de código é best-effort: estoque zerado não pode derrubar a
  // confirmação de pagamento já feita acima (o dinheiro já foi cobrado).
  // Fica sem código entregue — get_my_app_purchase_access devolve null e
  // o comprador vê só link/instruções manuais, mesmo estado de antes
  // desta função existir. Fica logado pra resolução manual.
  let deliveredCode: string | null = null
  const { data: delivery, error: deliveryErr } = await admin.rpc('deliver_activation_code', { p_app_purchase_id: purchaseId })
  if (deliveryErr) {
    if (deliveryErr.message?.includes('SEM_CODIGO_DISPONIVEL')) {
      console.error('[stripe/webhook] Sem código de ativação disponível pro plano:', purchase.plan_id, 'compra:', purchaseId)
    } else {
      console.error('[stripe/webhook] deliver_activation_code RPC failed:', deliveryErr)
    }
  } else {
    deliveredCode = delivery?.code ?? null
  }

  sendAppPurchaseReceiptEmail(purchase, admin, deliveredCode)
    .catch(err => console.error('[stripe/webhook] App purchase receipt email error:', err))
}

interface AppPurchaseForEmail {
  buyer_user_id:    string
  plan_id:          string
  application_name: string
  plan_name:        string
  amount:           number
  currency:         string
}

async function sendAppPurchaseReceiptEmail(purchase: AppPurchaseForEmail, admin: SupabaseAdmin, deliveredCode: string | null) {
  const [profileRes, planRes] = await Promise.all([
    admin.from('profiles').select('full_name, email').eq('id', purchase.buyer_user_id).single(),
    admin.from('app_plans').select('app_draft_id').eq('id', purchase.plan_id).single(),
  ])

  const email = profileRes.data?.email
  if (!email) return

  const appDraftId = planRes.data?.app_draft_id
  const { data: activation } = appDraftId
    ? await admin.from('app_activation_config').select('activation_link, support_email, instructions').eq('app_draft_id', appDraftId).maybeSingle()
    : { data: null }

  const firstName = profileRes.data?.full_name?.split(' ')[0] ?? 'Cliente'
  const SITE_URL  = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const amountFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: purchase.currency }).format(Number(purchase.amount))
  const instructions = activation?.instructions
  const instructionsText = instructions && typeof instructions === 'object'
    ? Object.values(instructions as Record<string, string>).filter(Boolean).join('\n')
    : (typeof instructions === 'string' ? instructions : null)

  const html = buildAppPurchaseReceiptEmailHtml({
    recipientName:   firstName,
    appName:         purchase.application_name,
    planName:        purchase.plan_name,
    amountFormatted,
    dateFormatted:   new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    activationLink:  activation?.activation_link ?? null,
    supportEmail:    activation?.support_email ?? null,
    instructions:    instructionsText,
    ctaUrl:          `${SITE_URL}/dashboard/minhas-compras`,
    activationCode:  deliveredCode,
  })

  await sendEmail(email, `[LOBBY] Compra de ${purchase.application_name} confirmada`, html)
}

/** Reembolso confirmado pelo provedor — só agora o estado vira definitivo
 *  (nunca antes, seção 20). Redelivery é idempotente. Tenta campaign_purchases
 *  primeiro, depois credit_purchases (mesmo branch duplo que
 *  handleCheckoutCompleted já usa pra distinguir tipo de compra). */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!paymentIntentId) return

  const admin = createAdminClient()

  const { data: campaignPurchase } = await admin
    .from('campaign_purchases')
    .select('id, refund_status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (campaignPurchase) {
    if (campaignPurchase.refund_status === 'refunded') return // redelivery — já processado
    await admin
      .from('campaign_purchases')
      .update({ status: 'refunded', refund_status: 'refunded', refunded_at: new Date().toISOString() })
      .eq('id', campaignPurchase.id)
    console.info('[stripe/webhook] Campaign refund confirmed:', campaignPurchase.id)
    return
  }

  const { data: creditPurchase } = await admin
    .from('credit_purchases')
    .select('id, amount_paid, refund_status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (creditPurchase) {
    if (creditPurchase.refund_status === 'refunded') return // redelivery do reembolso total — já processado

    // charge.amount_refunded é o TOTAL cumulativo já reembolsado dessa
    // cobrança segundo o próprio Stripe (nunca o valor calculado
    // localmente — seção 20). Só vira estado terminal 'refunded' quando
    // cobre o valor pago; parcial confirmado volta refund_status pra null
    // (destrava novos pedidos de reembolso parcial pra essa mesma compra).
    const amountRefundedTotal = charge.amount_refunded / 100
    const fullyRefunded = amountRefundedTotal >= Number(creditPurchase.amount_paid)

    await admin
      .from('credit_purchases')
      .update({
        refunded_amount: amountRefundedTotal,
        refund_status: fullyRefunded ? 'refunded' : null,
        refunded_at: fullyRefunded ? new Date().toISOString() : null,
        ...(fullyRefunded ? { status: 'refunded' } : {}),
      })
      .eq('id', creditPurchase.id)

    console.info('[stripe/webhook] Credit purchase refund confirmed:', creditPurchase.id, fullyRefunded ? 'total' : 'parcial')
    return
  }

  // Reembolso de compra de app — mesmo padrão idempotente de
  // credit_purchases acima. Janela de 15 dias (refund_app_purchase) e
  // retenção de repasse de 16 dias garantem que isso nunca acontece
  // depois de um repasse já confirmado (spec: 2026-09-30-app-purchase-
  // refund-design.md) — sem necessidade de clawback.
  const { data: appPurchase } = await admin
    .from('app_purchases')
    .select('id, amount, commission_amount, refunded_amount, refund_status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (appPurchase) {
    if (appPurchase.refund_status === 'refunded') return // redelivery — já processado

    const amountRefundedTotal = charge.amount_refunded / 100
    const fullyRefunded = amountRefundedTotal >= Number(appPurchase.amount)

    await admin
      .from('app_purchases')
      .update({
        refunded_amount: amountRefundedTotal,
        refund_status: fullyRefunded ? 'refunded' : null,
        refunded_at: fullyRefunded ? new Date().toISOString() : null,
        ...(fullyRefunded ? { status: 'refunded' } : {}),
      })
      .eq('id', appPurchase.id)

    // financial_transactions guarda só a fatia de comissão da LOBBY (nunca
    // o valor bruto — mesmo princípio de app_purchases/checkout). O
    // reembolso é descontado na mesma proporção do valor bruto devolvido
    // ao cliente, reaproveitando a coluna genérica refunded_amount já
    // criada em 20260927170000_reembolso_parcial.sql.
    const commissionRefunded = Math.round(
      amountRefundedTotal * (Number(appPurchase.commission_amount) / Number(appPurchase.amount)) * 100
    ) / 100

    const { data: tx } = await admin
      .from('financial_transactions')
      .select('amount')
      .eq('source_type', 'app_purchases')
      .eq('source_id', appPurchase.id)
      .maybeSingle()

    if (tx) {
      await admin
        .from('financial_transactions')
        .update({
          refunded_amount: commissionRefunded,
          status: commissionRefunded >= Number(tx.amount) ? 'reembolsado' : 'pago',
          updated_at: new Date().toISOString(),
        })
        .eq('source_type', 'app_purchases')
        .eq('source_id', appPurchase.id)
    }

    console.info('[stripe/webhook] App purchase refund confirmed:', appPurchase.id, fullyRefunded ? 'total' : 'parcial')
  }
}

/**
 * Confirmação de início de assinatura (app_plan mensal/anual ou
 * mensalidade). Cria a linha em `subscriptions` — não havia nenhuma
 * criada antes (diferente dos outros checkouts). Idempotente por
 * stripe_subscription_id.
 *
 * current_period_start/end vêm do SubscriptionItem, não da Subscription —
 * essa versão da API do Stripe moveu esses campos pra lá (confirmado nos
 * tipos do SDK instalado, node_modules/stripe/cjs/resources/
 * SubscriptionItems.d.ts — Subscription.current_period_* não existe mais
 * como campo do objeto, só como filtro de busca).
 */
async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session) {
  const admin = createAdminClient()

  const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (!stripeSubscriptionId) {
    console.warn('[stripe/webhook] subscription checkout without subscription id:', session.id)
    return
  }

  const { data: existing } = await admin.from('subscriptions').select('id').eq('stripe_subscription_id', stripeSubscriptionId).maybeSingle()
  if (existing) {
    console.info('[stripe/webhook] Redelivery of already-created subscription — skipping:', stripeSubscriptionId)
    return
  }

  const md = session.metadata ?? {}
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
  const item = sub.items.data[0]
  if (!item) {
    console.error('[stripe/webhook] subscription without items:', stripeSubscriptionId)
    return
  }

  const partnerId = md.partner_id || null
  const commissionPercent = partnerId ? Number(md.commission_percent || '0') : 0

  await admin.from('subscriptions').insert({
    stripe_subscription_id: stripeSubscriptionId,
    product_type:           md.product_type,
    app_plan_id:             md.app_plan_id || null,
    client_project_id:       md.client_project_id || null,
    user_id:                 md.user_id,
    partner_id:               partnerId,
    plan_name:                md.plan_name,
    amount:                   (item.price.unit_amount ?? 0) / 100,
    currency:                 (item.price.currency ?? 'brl').toUpperCase(),
    billing_interval:         item.price.recurring?.interval === 'year' ? 'year' : 'month',
    commission_percent:       commissionPercent,
    status:                   sub.status,
    current_period_start:     new Date(item.current_period_start * 1000).toISOString(),
    current_period_end:       new Date(item.current_period_end * 1000).toISOString(),
    cancel_at_period_end:     sub.cancel_at_period_end,
  })

  console.info('[stripe/webhook] Subscription created:', stripeSubscriptionId)
}

/** Resolve o stripe_subscription_id de uma fatura — essa API do Stripe
 *  não tem mais invoice.subscription direto, é invoice.parent.
 *  subscription_details.subscription (confirmado no SDK instalado). */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  if (invoice.parent?.type !== 'subscription_details') return null
  const ref = invoice.parent.subscription_details?.subscription
  return typeof ref === 'string' ? ref : (ref?.id ?? null)
}

/**
 * Um ciclo de cobrança pago — a cada renovação, não só na primeira vez.
 * Nunca conta o valor total previsto da assinatura de uma vez (seção 12).
 * financial_transactions usa só commission_amount (receita própria da
 * LOBBY), nunca o valor bruto — mesmo princípio de app_purchases/peça 3.
 * partner_amount ainda não entra na fila de repasse (peça 4 só olha
 * app_purchases hoje) — extensão pendente, não coberta aqui.
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripeSubscriptionId = subscriptionIdFromInvoice(invoice)
  if (!stripeSubscriptionId) return // fatura avulsa, não de assinatura — fora do nosso fluxo

  const admin = createAdminClient()

  const { data: existingInvoice } = await admin.from('subscription_invoices').select('id').eq('stripe_invoice_id', invoice.id).maybeSingle()
  if (existingInvoice) {
    console.info('[stripe/webhook] Redelivery of already-recorded invoice — skipping:', invoice.id)
    return
  }

  const { data: subscription } = await admin
    .from('subscriptions')
    .select('id, commission_percent, partner_id, product_type, plan_name, user_id, status')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle()
  if (!subscription) {
    console.warn('[stripe/webhook] invoice.paid for unknown subscription:', stripeSubscriptionId)
    return
  }

  const amountCents     = invoice.amount_paid
  const commissionCents = subscription.partner_id ? Math.round((amountCents * subscription.commission_percent) / 100) : amountCents
  const partnerCents    = amountCents - commissionCents

  const { data: invoiceRow, error: invoiceError } = await admin
    .from('subscription_invoices')
    .insert({
      subscription_id:    subscription.id,
      stripe_invoice_id:   invoice.id ?? '',
      amount:              amountCents / 100,
      commission_percent:  subscription.partner_id ? subscription.commission_percent : 0,
      commission_amount:   commissionCents / 100,
      partner_amount:      partnerCents / 100,
    })
    .select('id')
    .single()

  if (invoiceError || !invoiceRow) {
    console.error('[stripe/webhook] failed to record subscription invoice:', invoiceError)
    throw new Error(invoiceError?.message ?? 'subscription invoice insert failed')
  }

  await admin.from('financial_transactions').insert({
    type:            subscription.product_type === 'app_plan' ? 'app' : 'mensalidade',
    client_id:       subscription.user_id,
    description:     `Assinatura: ${subscription.plan_name}`,
    amount:          commissionCents / 100,
    status:          'pago',
    sale_date:       new Date().toISOString().slice(0, 10),
    received_date:   new Date().toISOString().slice(0, 10),
    source_type:     'subscription_invoices',
    source_id:       invoiceRow.id,
  })

  // Primeiro pagamento confirma a assinatura como ativa — não espera só o
  // customer.subscription.updated (que também confirma, redundante e ok).
  if (subscription.status === 'incomplete') {
    await admin.from('subscriptions').update({ status: 'active' }).eq('id', subscription.id)
  }

  console.info('[stripe/webhook] Subscription invoice recorded:', invoice.id)
}

/** Cobrança falhou — não muda status aqui (customer.subscription.updated
 *  é quem confirma o estado real, ex: 'past_due'); só avisa o cliente. */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripeSubscriptionId = subscriptionIdFromInvoice(invoice)
  if (!stripeSubscriptionId) return

  const admin = createAdminClient()
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('id, user_id, plan_name')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle()
  if (!subscription) return

  const { data: profile } = await admin.from('profiles').select('full_name, email').eq('id', subscription.user_id).single()
  if (!profile?.email) return

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const amountFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: (invoice.currency ?? 'brl').toUpperCase() }).format(invoice.amount_due / 100)

  const html = buildSubscriptionPaymentFailedEmailHtml({
    recipientName:   profile.full_name?.split(' ')[0] ?? 'Cliente',
    planName:        subscription.plan_name,
    amountFormatted,
    ctaUrl:          `${SITE_URL}/dashboard/assinaturas`,
  })

  await sendEmail(profile.email, `[LOBBY] Falha na cobrança da assinatura ${subscription.plan_name}`, html)
    .catch(err => console.error('[stripe/webhook] payment failed email error:', err))

  console.info('[stripe/webhook] Subscription payment failed notified:', stripeSubscriptionId)
}

/** Sincroniza status/período/cancelamento — fonte de verdade única do
 *  estado real da assinatura (nunca definido do lado de cá além da
 *  criação inicial, seção 20). */
async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const admin = createAdminClient()
  const item = sub.items.data[0]

  await admin
    .from('subscriptions')
    .update({
      status:                sub.status,
      current_period_start: item ? new Date(item.current_period_start * 1000).toISOString() : null,
      current_period_end:   item ? new Date(item.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at:          sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    })
    .eq('stripe_subscription_id', sub.id)
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const admin = createAdminClient()
  await admin
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('stripe_subscription_id', sub.id)
  console.info('[stripe/webhook] Subscription canceled:', sub.id)
}

// Marca também usada pra reconhecer, no dispute.closed, que foi ESTA
// automação que pausou a campanha — não desfaz uma pausa manual que já
// existia antes da disputa por outro motivo.
const DISPUTE_PAUSE_REASON = 'Disputa Stripe aberta automaticamente'

/**
 * charge.dispute.created — decisão do usuário: além de registrar e
 * notificar o líder, congela automaticamente o que a cobrança disputada
 * liberou. ebook_purchases nunca entra aqui: e-book só é pago via
 * crédito ou manual, nunca tem payment_intent Stripe próprio.
 *
 * Assinatura (subscription_invoices) não guarda payment_intent_id
 * direto — a cobrança de uma invoice não expõe isso como campo simples
 * nesta versão da API (confirmado em node_modules/stripe/cjs/resources/
 * Invoices.d.ts: sem campo `payment_intent`/`charge` na Invoice, só um
 * relacionamento via invoice_payments). Por isso, quando não bate com
 * nenhuma das 3 tabelas com stripe_payment_intent_id direto, busca o
 * invoice pelo payment_intent via stripe.invoicePayments.list.
 */
async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const admin = createAdminClient()

  const { data: existing } = await admin.from('payment_disputes').select('id').eq('stripe_dispute_id', dispute.id).maybeSingle()
  if (existing) {
    console.info('[stripe/webhook] Redelivery of already-recorded dispute — skipping:', dispute.id)
    return
  }

  const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id
  const amount   = dispute.amount / 100
  const currency = dispute.currency.toUpperCase()

  let sourceType: 'credit_purchases' | 'app_purchases' | 'campaign_purchases' | 'subscription_invoices' | null = null
  let sourceId:   string | null = null
  let heldAmount: number | null = null

  if (paymentIntentId) {
    const { data: campaignPurchase } = await admin.from('campaign_purchases').select('id, campaign_id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
    if (campaignPurchase) {
      sourceType = 'campaign_purchases'
      sourceId   = campaignPurchase.id
      await admin.from('campaign_purchases').update({ status: 'disputed' }).eq('id', campaignPurchase.id)
      await admin
        .from('sponsored_campaigns')
        .update({ paused_at: new Date().toISOString(), paused_by: null, paused_reason: DISPUTE_PAUSE_REASON })
        .eq('id', campaignPurchase.campaign_id)
        .is('paused_at', null)
        .is('cancelled_at', null)
    } else {
      const { data: creditPurchase } = await admin.from('credit_purchases').select('id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
      if (creditPurchase) {
        sourceType = 'credit_purchases'
        sourceId   = creditPurchase.id
        const { data: held } = await admin.rpc('freeze_credit_purchase_for_dispute', { p_purchase_id: creditPurchase.id })
        heldAmount = held ?? 0
      } else {
        const { data: appPurchase } = await admin.from('app_purchases').select('id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
        if (appPurchase) {
          sourceType = 'app_purchases'
          sourceId   = appPurchase.id
          await admin.from('app_purchases').update({ status: 'disputed' }).eq('id', appPurchase.id)
        } else {
          const invoicePayments = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: paymentIntentId }, limit: 1 })
          const invoiceRef = invoicePayments.data[0]?.invoice
          const invoiceId  = typeof invoiceRef === 'string' ? invoiceRef : invoiceRef?.id
          if (invoiceId) {
            const { data: subInvoice } = await admin.from('subscription_invoices').select('id, subscription_id').eq('stripe_invoice_id', invoiceId).maybeSingle()
            if (subInvoice) {
              sourceType = 'subscription_invoices'
              sourceId   = subInvoice.id
              await admin.from('subscriptions').update({ disputed: true }).eq('id', subInvoice.subscription_id)
            }
          }
        }
      }
    }
  }

  if (!sourceType) {
    console.error('[stripe/webhook] Dispute created but no matching purchase found:', dispute.id, paymentIntentId)
  }

  await admin.from('payment_disputes').insert({
    stripe_dispute_id:        dispute.id,
    stripe_payment_intent_id: paymentIntentId ?? null,
    source_type:              sourceType,
    source_id:                sourceId,
    amount,
    currency,
    reason:                   dispute.reason,
    status:                   dispute.status,
    held_amount:              heldAmount,
    opened_at:                new Date(dispute.created * 1000).toISOString(),
  })

  console.info('[stripe/webhook] Dispute recorded and frozen:', dispute.id, sourceType, sourceId)

  const { data: leaders } = await admin.from('profiles').select('email').eq('role', 'technician').eq('is_leader', true)
  const leaderEmails = (leaders ?? []).map(l => l.email as string | null).filter((e): e is string => Boolean(e))
  if (leaderEmails.length === 0) return

  const html = buildDisputeCreatedEmailHtml({
    amountFormatted: new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount),
    reason:          dispute.reason,
    sourceType,
    ctaUrl:          `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/admin/disputas`,
  })
  await Promise.all(leaderEmails.map(email => sendEmail(email, '[LOBBY] Disputa Stripe aberta', html)))
}

/** charge.dispute.closed — 'won' desfaz o congelamento (dinheiro voltou
 *  pra LOBBY); qualquer outro status terminal (lost, warning_closed)
 *  mantém o congelamento pra sempre — decisão manual do líder a partir
 *  daqui, o sistema não reverte sozinho quando a LOBBY perdeu a disputa. */
async function handleDisputeClosed(dispute: Stripe.Dispute) {
  const admin = createAdminClient()

  const { data: record } = await admin.from('payment_disputes').select('*').eq('stripe_dispute_id', dispute.id).maybeSingle()
  if (!record) {
    console.error('[stripe/webhook] dispute.closed for unknown dispute:', dispute.id)
    return
  }
  if (record.closed_at) {
    console.info('[stripe/webhook] Redelivery of already-closed dispute — skipping:', dispute.id)
    return
  }

  await admin.from('payment_disputes').update({ status: dispute.status, closed_at: new Date().toISOString() }).eq('id', record.id)

  if (dispute.status !== 'won') {
    console.info('[stripe/webhook] Dispute closed as', dispute.status, '— congelamento permanente:', dispute.id)
    return
  }

  if (record.source_type === 'credit_purchases' && record.source_id) {
    await admin.rpc('unfreeze_credit_purchase_for_dispute', { p_purchase_id: record.source_id, p_held_amount: record.held_amount })
  } else if (record.source_type === 'app_purchases' && record.source_id) {
    await admin.from('app_purchases').update({ status: 'paid' }).eq('id', record.source_id).eq('status', 'disputed')
  } else if (record.source_type === 'campaign_purchases' && record.source_id) {
    const { data: cp } = await admin.from('campaign_purchases').select('campaign_id').eq('id', record.source_id).single()
    await admin.from('campaign_purchases').update({ status: 'paid' }).eq('id', record.source_id).eq('status', 'disputed')
    if (cp) {
      await admin
        .from('sponsored_campaigns')
        .update({ paused_at: null, paused_by: null, paused_reason: null })
        .eq('id', cp.campaign_id)
        .eq('paused_reason', DISPUTE_PAUSE_REASON)
    }
  } else if (record.source_type === 'subscription_invoices' && record.source_id) {
    const { data: si } = await admin.from('subscription_invoices').select('subscription_id').eq('id', record.source_id).single()
    if (si) await admin.from('subscriptions').update({ disputed: false }).eq('id', si.subscription_id)
  }

  console.info('[stripe/webhook] Dispute won, unfrozen:', dispute.id, record.source_type, record.source_id)
}
