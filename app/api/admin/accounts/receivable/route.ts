import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'

export async function POST(req: NextRequest) {
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
  const { description, amount, payerName, dueDate, notes, attachmentPath, reference } = body
  if (!description || typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'Informe a descrição.' }, { status: 400 })
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Informe um valor válido.' }, { status: 400 })
  }

  const { data: created, error } = await supabase
    .from('accounts_receivable')
    .insert({
      description: description.trim(),
      amount,
      payer_name: payerName || null,
      due_date: dueDate || null,
      notes: notes || null,
      attachment_path: attachmentPath || null,
      reference: reference || null,
      created_by: userId,
    })
    .select('id, status')
    .single()

  if (error || !created) return NextResponse.json({ error: 'Não foi possível criar a conta.' }, { status: 500 })

  await supabase.from('account_audit_events').insert({
    account_kind: 'receivable', account_id: created.id, actor_id: userId, action: 'criado', new_status: created.status,
  })

  return NextResponse.json({ ok: true, id: created.id })
}
