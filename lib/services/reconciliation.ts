import { stripe } from '@/lib/stripe'
import type { createAdminClient } from '@/lib/supabase-admin'

type AdminClient = ReturnType<typeof createAdminClient>

export interface MatchedPurchase {
  table:          'campaign_purchases' | 'credit_purchases' | 'app_purchases' | 'subscription_invoices'
  id:             string
  amount:         number
  status:         string
  refundedAmount: number
}

/**
 * Mesma cascata de lookup por payment_intent usada em handleDisputeCreated
 * (app/api/stripe/webhook/route.ts) — duplicada aqui de propósito em vez
 * de compartilhada: a versão do webhook está testada e em produção,
 * mexer nela pra extrair um helper genérico é risco desnecessário pra
 * uma tela de conciliação manual que não tem pressa.
 *
 * app_purchases/subscription_invoices não têm coluna de reembolso
 * parcial (peça 1 só cobriu credit_purchases/financial_transactions —
 * gap já sinalizado, não resolvido aqui) — refundedAmount fica sempre 0
 * pra essas duas, nunca inventado.
 */
export async function findPurchaseByPaymentIntentId(admin: AdminClient, paymentIntentId: string): Promise<MatchedPurchase | null> {
  const { data: campaignPurchase } = await admin
    .from('campaign_purchases').select('id, amount, status, refund_status')
    .eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
  if (campaignPurchase) {
    return {
      table: 'campaign_purchases', id: campaignPurchase.id, amount: Number(campaignPurchase.amount),
      status: campaignPurchase.status, refundedAmount: campaignPurchase.refund_status === 'refunded' ? Number(campaignPurchase.amount) : 0,
    }
  }

  const { data: creditPurchase } = await admin
    .from('credit_purchases').select('id, amount_paid, status, refunded_amount')
    .eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
  if (creditPurchase) {
    return {
      table: 'credit_purchases', id: creditPurchase.id, amount: Number(creditPurchase.amount_paid),
      status: creditPurchase.status, refundedAmount: Number(creditPurchase.refunded_amount ?? 0),
    }
  }

  const { data: appPurchase } = await admin
    .from('app_purchases').select('id, amount, status')
    .eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
  if (appPurchase) {
    return { table: 'app_purchases', id: appPurchase.id, amount: Number(appPurchase.amount), status: appPurchase.status, refundedAmount: 0 }
  }

  const invoicePayments = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: paymentIntentId }, limit: 1 })
  const invoiceRef = invoicePayments.data[0]?.invoice
  const invoiceId  = typeof invoiceRef === 'string' ? invoiceRef : invoiceRef?.id
  if (invoiceId) {
    const { data: subInvoice } = await admin
      .from('subscription_invoices').select('id, amount')
      .eq('stripe_invoice_id', invoiceId).maybeSingle()
    if (subInvoice) {
      return { table: 'subscription_invoices', id: subInvoice.id, amount: Number(subInvoice.amount), status: 'paid', refundedAmount: 0 }
    }
  }

  return null
}
