import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Contas a pagar requer técnico líder.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  const { description, amount, category, dueDate, notes } = body
  if (!description || typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'Informe a descrição.' }, { status: 400 })
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'Informe um valor válido.' }, { status: 400 })
  }

  const { data: created, error } = await supabase
    .from('accounts_payable')
    .insert({
      description: description.trim(),
      amount,
      category: category || null,
      due_date: dueDate || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !created) return NextResponse.json({ error: 'Não foi possível criar a conta.' }, { status: 500 })
  return NextResponse.json({ ok: true, id: created.id })
}
