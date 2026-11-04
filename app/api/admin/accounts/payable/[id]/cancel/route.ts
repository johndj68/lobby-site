import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'

/** Cancela obrigação ainda não liquidada — RPC recusa se amount_settled > 0 (estorne a liquidação antes). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    return NextResponse.json({ error: 'Informe o motivo do cancelamento.' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('cancel_account', { p_account_kind: 'payable', p_account_id: id, p_reason: reason })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, account: data })
}
