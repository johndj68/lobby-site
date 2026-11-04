import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'

/**
 * Estorna uma liquidação (não é reembolso externo — nunca chama Stripe/
 * gateway, só decrementa amount_settled e recalcula status localmente).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ settlementId: string }> }) {
  const { settlementId } = await params
  const supabase = await createServerSupabaseClient()
  try {
    await requireLeaderApi(supabase)
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const body = await req.json().catch(() => null)
  const reason = body?.reason
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo do estorno.' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('reverse_account_settlement', { p_settlement_id: settlementId, p_reason: reason })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, account: data })
}
