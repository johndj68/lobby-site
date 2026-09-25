import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Solicita reembolso via Stripe — só técnico líder. NÃO marca como
 * reembolsado aqui: fica "processing" até o webhook confirmar o evento
 * `charge.refunded` do provedor (seção 20 — nunca fingir conclusão antes da
 * confirmação). Repetir a chamada numa cobrança já reembolsada é
 * idempotente (Stripe rejeita, tratamos como no-op informado).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Reembolso só pode ser solicitado por um técnico líder.' }, { status: 403 })
  }

  const { reason } = await req.json().catch(() => ({}))
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo do reembolso.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: purchase } = await admin
    .from('campaign_purchases')
    .select('id, status, kind, stripe_payment_intent_id, refund_status')
    .eq('campaign_id', campaignId)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!purchase) return NextResponse.json({ error: 'Nenhum pagamento confirmado encontrado para reembolsar.' }, { status: 404 })
  if (purchase.kind !== 'stripe' || !purchase.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'Este pagamento não foi processado via Stripe — reembolso manual precisa de procedimento próprio.' }, { status: 400 })
  }
  if (purchase.refund_status === 'processing' || purchase.refund_status === 'refunded') {
    return NextResponse.json({ error: 'Já existe um reembolso em andamento ou concluído para este pagamento.' }, { status: 409 })
  }

  try {
    await stripe.refunds.create({ payment_intent: purchase.stripe_payment_intent_id })
  } catch (err) {
    console.error('[campaigns/refund] stripe error', err)
    return NextResponse.json({ error: 'Falha ao solicitar o reembolso no provedor de pagamento.' }, { status: 502 })
  }

  await admin.from('campaign_purchases').update({ refund_status: 'processing', refund_reason: reason.trim(), refunded_by: user.id }).eq('id', purchase.id)

  await logAppAdminEvent(supabase, {
    campaignId, actorId: user.id, action: 'refund_campaign', reason: reason.trim(),
    previousStatus: 'pago', newStatus: 'reembolso_solicitado',
  })

  return NextResponse.json({ ok: true, status: 'processing' })
}
