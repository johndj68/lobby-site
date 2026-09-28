import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { findPurchaseByPaymentIntentId } from '@/lib/services/reconciliation'

const MAX_CHARGES = 2000 // teto de segurança — período muito longo pede em vários lotes menores

export interface Divergence {
  type:              'sem_correspondencia' | 'status_divergente' | 'valor_divergente' | 'reembolso_divergente'
  stripeChargeId:    string
  paymentIntentId:   string | null
  stripeAmount:      number
  stripeRefunded:    number
  createdAt:         string
  table?:            string
  purchaseId?:       string
  localAmount?:      number
  localStatus?:      string
  localRefunded?:    number
}

// Concilia manualmente, sob demanda: lista as cobranças bem-sucedidas do
// Stripe no período e compara com o que está gravado localmente
// (campaign_purchases/credit_purchases/app_purchases/subscription_invoices).
// Não persiste nada — é um relatório efêmero, recalculado a cada clique
// (decisão do usuário: manual, sem job agendado).
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Conciliação requer técnico líder.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const startDate = body?.startDate as string | undefined
  const endDate   = body?.endDate as string | undefined
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Informe o período (data inicial e final).' }, { status: 400 })
  }

  const gte = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000)
  const lte = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000)
  if (!Number.isFinite(gte) || !Number.isFinite(lte) || gte > lte) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const divergences: Divergence[] = []
  let checkedCount = 0
  let startingAfter: string | undefined
  let hasMore = true

  while (hasMore && checkedCount < MAX_CHARGES) {
    const page = await stripe.charges.list({
      created: { gte, lte },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const charge of page.data) {
      if (charge.status !== 'succeeded') continue
      checkedCount++

      const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
      const stripeAmount   = charge.amount / 100
      const stripeRefunded = charge.amount_refunded / 100
      const createdAt      = new Date(charge.created * 1000).toISOString()

      if (!paymentIntentId) {
        divergences.push({ type: 'sem_correspondencia', stripeChargeId: charge.id, paymentIntentId: null, stripeAmount, stripeRefunded, createdAt })
        continue
      }

      const match = await findPurchaseByPaymentIntentId(admin, paymentIntentId)

      if (!match) {
        divergences.push({ type: 'sem_correspondencia', stripeChargeId: charge.id, paymentIntentId, stripeAmount, stripeRefunded, createdAt })
        continue
      }

      const base = {
        stripeChargeId: charge.id, paymentIntentId, stripeAmount, stripeRefunded, createdAt,
        table: match.table, purchaseId: match.id, localAmount: match.amount, localStatus: match.status, localRefunded: match.refundedAmount,
      }

      const isPaidLocally = match.status === 'paid' || match.status === 'disputed'
      if (!isPaidLocally) {
        divergences.push({ ...base, type: 'status_divergente' })
        continue // já é divergência suficiente, evita duplicar com valor/reembolso na mesma linha
      }
      if (Math.abs(match.amount - stripeAmount) > 0.01) {
        divergences.push({ ...base, type: 'valor_divergente' })
      }
      if (Math.abs(match.refundedAmount - stripeRefunded) > 0.01) {
        divergences.push({ ...base, type: 'reembolso_divergente' })
      }
    }

    hasMore = page.has_more && checkedCount < MAX_CHARGES
    startingAfter = page.data[page.data.length - 1]?.id
  }

  return NextResponse.json({ checkedCount, divergences })
}
