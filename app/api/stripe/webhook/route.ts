import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase-admin'
import { captureException } from '@/lib/monitoring'
import { sendEmail, buildCreditReceiptEmailHtml } from '@/lib/notifications'
import { completeWebhookJob, retryWebhookJob } from '@/lib/webhook-queue'
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

      default:
        // Unhandled event type — acknowledge so Stripe doesn't retry
        break
    }

    // Mark webhook as completed
    await completeWebhookJob(event.id)
  } catch (err) {
    captureException(err, { event_type: event.type, event_id: event.id })
    // Queue for retry instead of failing silently
    await retryWebhookJob(event.id)
    return NextResponse.json({ received: true, queued_for_retry: true }, { status: 200 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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

/** Reembolso confirmado pelo provedor — só agora status vira "refunded"
 *  (nunca antes, seção 20). Redelivery é idempotente via .eq('refund_status'). */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!paymentIntentId) return

  const admin = createAdminClient()
  const { data: purchase } = await admin
    .from('campaign_purchases')
    .select('id, refund_status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (!purchase) return // não é uma cobrança de campanha
  if (purchase.refund_status === 'refunded') return // redelivery — já processado

  await admin
    .from('campaign_purchases')
    .update({ status: 'refunded', refund_status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('id', purchase.id)

  console.info('[stripe/webhook] Campaign refund confirmed:', purchase.id)
}
