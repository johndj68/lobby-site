import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Só transição de status (pago/cancelado) — nunca exclusão real, mesmo
// princípio de audit trail dos outros registros financeiros da sessão
// (financial_transactions também não tem delete pela UI).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Contas a pagar requer técnico líder.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const status = body?.status as string | undefined
  if (!status || !['pendente', 'pago', 'cancelado'].includes(status)) {
    return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { status }
  if (status === 'pago') {
    update.paid_at = new Date().toISOString()
    update.paid_by = user.id
  }

  const { error } = await supabase.from('accounts_payable').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: 'Não foi possível atualizar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
