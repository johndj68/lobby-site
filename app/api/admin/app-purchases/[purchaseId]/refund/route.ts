import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { REFUND_WINDOW_DAYS } from '@/lib/services/payouts'

/**
 * Reembolso parcial ou total de compra de app via Stripe — só técnico
 * líder. Mesma ordem de app/api/admin/credit-purchases/[purchaseId]/refund/
 * route.ts: chama o Stripe PRIMEIRO, só grava estado local depois do
 * provedor aceitar o pedido. A janela de reembolso vem de
 * `purchase.refund_window_days` — snapshot da venda, não uma constante
 * fixa — e é checada aqui também (feedback mais rápido, sem round-trip ao
 * Stripe) e de novo dentro da RPC refund_app_purchase (fonte de verdade).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
) {
  const { purchaseId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Reembolso só pode ser solicitado por um técnico líder.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { amount, reason } = body as { amount?: number; reason?: string }

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo do reembolso.' }, { status: 400 })
  }
  if (typeof amount !== 'number' || !(amount > 0)) {
    return NextResponse.json({ error: 'Informe um valor de reembolso válido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: purchase } = await admin
    .from('app_purchases')
    .select('id, status, amount, refunded_amount, refund_status, paid_at, stripe_payment_intent_id, refund_window_days')
    .eq('id', purchaseId)
    .single()

  if (!purchase) return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 })
  if (purchase.status !== 'paid') {
    return NextResponse.json({ error: 'Só é possível reembolsar uma compra paga.' }, { status: 400 })
  }
  if (!purchase.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'Esta compra não foi processada via Stripe — reembolso precisa de procedimento manual próprio.' }, { status: 400 })
  }
  if (purchase.refund_status === 'processing') {
    return NextResponse.json({ error: 'Já existe um reembolso em andamento para esta compra.' }, { status: 409 })
  }
  const refundWindowDays = purchase.refund_window_days ?? REFUND_WINDOW_DAYS
  if (!purchase.paid_at || new Date(purchase.paid_at).getTime() <= Date.now() - refundWindowDays * 86400_000) {
    return NextResponse.json({ error: `Fora do prazo de reembolso — só é possível solicitar até ${refundWindowDays} dias após o pagamento.` }, { status: 400 })
  }
  const remaining = Number(purchase.amount) - Number(purchase.refunded_amount)
  if (amount > remaining) {
    return NextResponse.json({ error: `Valor maior que o saldo ainda reembolsável (R$ ${remaining.toFixed(2)}).` }, { status: 400 })
  }

  try {
    // Idempotency key derivado do estado ANTES desta chamada (refunded_amount
    // atual + valor pedido) — uma retentativa do mesmo pedido lógico (ex:
    // líder clica de novo depois do RPC ter falhado mas o Stripe já ter
    // aceitado) reusa a mesma chave e o Stripe devolve o reembolso original
    // em vez de criar um segundo. Um pedido de reembolso genuinamente novo
    // (refunded_amount já avançou) gera uma chave diferente.
    await stripe.refunds.create({
      payment_intent: purchase.stripe_payment_intent_id,
      amount: Math.round(amount * 100),
    }, {
      idempotencyKey: `app-purchase-refund:${purchaseId}:${purchase.refunded_amount}:${Math.round(amount * 100)}`,
    })
  } catch (err) {
    console.error('[app-purchases/refund] stripe error', err)
    return NextResponse.json({ error: 'Falha ao solicitar o reembolso no provedor de pagamento.' }, { status: 502 })
  }

  const { data: result, error: rpcError } = await supabase.rpc('refund_app_purchase', {
    p_purchase_id: purchaseId,
    p_amount: amount,
    p_reason: reason.trim(),
  })

  if (rpcError) {
    // Stripe já aceitou o reembolso mas o registro local falhou — o webhook
    // charge.refunded ainda vai chegar depois e corrigir o estado local.
    console.error('[app-purchases/refund] rpc error after stripe accepted refund', rpcError)
    return NextResponse.json({
      error: `Reembolso aceito no Stripe, mas não foi possível atualizar o registro local: ${rpcError.message}. Confira manualmente.`,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, purchase: result })
}
