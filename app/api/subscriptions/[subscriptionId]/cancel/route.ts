import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * Cancela ao final do ciclo atual (cancel_at_period_end) — nunca
 * imediato. É o padrão seguro de SaaS: cliente já pagou o ciclo, continua
 * com acesso até o fim dele. Cancelamento imediato com estorno
 * proporcional não foi pedido — não inventado aqui (seção 12).
 * Dono da assinatura ou líder podem cancelar.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> }
) {
  const { subscriptionId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('id, user_id, stripe_subscription_id, status')
    .eq('id', subscriptionId)
    .single()
  if (!subscription) return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  const isOwner  = subscription.user_id === user.id
  const isLeader = profile?.role === 'technician' && profile.is_leader === true
  if (!isOwner && !isLeader) {
    return NextResponse.json({ error: 'Sem permissão para cancelar esta assinatura.' }, { status: 403 })
  }

  if (subscription.status === 'canceled') {
    return NextResponse.json({ error: 'Esta assinatura já está cancelada.' }, { status: 409 })
  }
  if (!subscription.stripe_subscription_id) {
    return NextResponse.json({ error: 'Assinatura sem registro no Stripe — não é possível cancelar automaticamente.' }, { status: 400 })
  }

  try {
    await stripe.subscriptions.update(subscription.stripe_subscription_id, { cancel_at_period_end: true })
  } catch (err) {
    console.error('[subscriptions/cancel] stripe error', err)
    return NextResponse.json({ error: 'Falha ao cancelar no provedor de pagamento.' }, { status: 502 })
  }

  // Não marca cancelado aqui — cancel_at_period_end=true no Stripe ainda
  // mantém status 'active' até o fim do ciclo; customer.subscription.updated
  // confirma o estado real (seção 20: nunca fingir conclusão antes do provedor).
  await admin.from('subscriptions').update({ cancel_at_period_end: true }).eq('id', subscriptionId)

  return NextResponse.json({ ok: true })
}
