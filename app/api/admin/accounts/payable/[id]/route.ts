import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'

// Edição só de campos pré-liquidação (descrição/categoria/vencimento/
// observações/anexo) — nunca valor liquidado ou status: essas transições
// são exclusivas de settle/cancel (RPC transacional, ver
// app/api/admin/accounts/payable/[id]/settle e /cancel). A cláusula
// .eq('amount_settled', 0).eq('status', 'pendente') dá concorrência
// otimista barata: se outra operação liquidou a conta entre o load da tela
// e este PATCH, a query não atualiza nenhuma linha e devolve 409.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  let userId: string
  try {
    const { user } = await requireLeaderApi(supabase)
    userId = user.id
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  const { description, amount, category, dueDate, notes, attachmentPath, reference } = body

  const update: Record<string, unknown> = { updated_by: userId, updated_at: new Date().toISOString() }
  if (description !== undefined) {
    if (typeof description !== 'string' || !description.trim()) return NextResponse.json({ error: 'Descrição inválida.' }, { status: 400 })
    update.description = description.trim()
  }
  if (amount !== undefined) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 })
    update.amount = amount
  }
  if (category !== undefined) update.category = category || null
  if (dueDate !== undefined) update.due_date = dueDate || null
  if (notes !== undefined) update.notes = notes || null
  if (attachmentPath !== undefined) update.attachment_path = attachmentPath || null
  if (reference !== undefined) update.reference = reference || null

  const { data: rows, error } = await supabase
    .from('accounts_payable')
    .update(update)
    .eq('id', id).eq('amount_settled', 0).eq('status', 'pendente')
    .select('id')
  if (error) return NextResponse.json({ error: 'Não foi possível atualizar.' }, { status: 500 })
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Conta não encontrada ou já liquidada/cancelada — não é mais editável.' }, { status: 409 })
  }

  await supabase.from('account_audit_events').insert({ account_kind: 'payable', account_id: id, actor_id: userId, action: 'editado' })

  return NextResponse.json({ ok: true })
}
