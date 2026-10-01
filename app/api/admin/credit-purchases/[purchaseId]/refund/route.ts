import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'

/**
 * Reembolso parcial ou total de compra de créditos via Stripe — só técnico
 * líder. Mesma ordem de app/api/admin/campaigns/[campaignId]/refund/route.ts:
 * chama o Stripe PRIMEIRO, só grava estado local depois do provedor aceitar
 * o pedido (nunca marca "processing" sem o Stripe ter confirmado o request).
 * O débito de créditos (se houver) e a trava de reembolso em voo ficam na
 * RPC refund_credit_purchase — não aqui.
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
  const { amount, reason, creditsToDeduct } = body as { amount?: number; reason?: string; creditsToDeduct?: number }

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo do reembolso.' }, { status: 400 })
  }
  if (typeof amount !== 'number' || !(amount > 0)) {
    return NextResponse.json({ error: 'Informe um valor de reembolso válido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: purchase } = await admin
    .from('credit_purchases')
    .select('id, status, amount_paid, refunded_amount, refund_status, stripe_payment_intent_id')
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
  const remaining = Number(purchase.amount_paid) - Number(purchase.refunded_amount)
  if (amount > remaining) {
    return NextResponse.json({ error: `Valor maior que o saldo ainda reembolsável (R$ ${remaining.toFixed(2)}).` }, { status: 400 })
  }

  try {
    // Idempotency key derivado do estado ANTES desta chamada (refunded_amount
    // atual + valor pedido) — uma retentativa do mesmo pedido lógico (ex:
    // admin clica de novo depois do RPC ter falhado mas o Stripe já ter
    // aceitado) reusa a mesma chave e o Stripe devolve o reembolso original
    // em vez de criar um segundo. Mesmo padrão de
    // app/api/admin/app-purchases/[purchaseId]/refund/route.ts.
    await stripe.refunds.create({
      payment_intent: purchase.stripe_payment_intent_id,
      amount: Math.round(amount * 100),
    }, {
      idempotencyKey: `credit-purchase-refund:${purchaseId}:${purchase.refunded_amount}:${Math.round(amount * 100)}`,
    })
  } catch (err) {
    console.error('[credit-purchases/refund] stripe error', err)
    return NextResponse.json({ error: 'Falha ao solicitar o reembolso no provedor de pagamento.' }, { status: 502 })
  }

  const { data: result, error: rpcError } = await supabase.rpc('refund_credit_purchase', {
    p_purchase_id: purchaseId,
    p_amount: amount,
    p_reason: reason.trim(),
    p_credits_to_deduct: creditsToDeduct && creditsToDeduct > 0 ? Math.floor(creditsToDeduct) : 0,
  })

  if (rpcError) {
    // Stripe já aceitou o reembolso mas o registro local falhou — o webhook
    // charge.refunded ainda vai confirmar o valor no Stripe; sinaliza pro
    // admin que precisa conferir manualmente em vez de fingir sucesso total.
    console.error('[credit-purchases/refund] rpc error after stripe accepted refund', rpcError)
    return NextResponse.json({
      error: `Reembolso aceito no Stripe, mas não foi possível atualizar o registro local: ${rpcError.message}. Confira manualmente.`,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, purchase: result })
}
