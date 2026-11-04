import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'

/** Mesma rota de payable/[id]/settle, kind='receivable'. */
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
  const amount = body?.amount
  const effectiveDate = body?.effectiveDate
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Informe um valor válido.' }, { status: 400 })
  }
  if (!effectiveDate || typeof effectiveDate !== 'string') {
    return NextResponse.json({ error: 'Informe a data efetiva.' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('settle_account', {
    p_account_kind: 'receivable', p_account_id: id, p_amount: amount, p_effective_date: effectiveDate,
    p_payment_method: body?.paymentMethod || null, p_reference: body?.reference || null,
    p_receipt_path: body?.receiptPath || null, p_notes: body?.notes || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, account: data })
}
