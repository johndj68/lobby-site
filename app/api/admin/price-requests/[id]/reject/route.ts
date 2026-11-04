import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para rejeitar mudança de preço.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
  if (!notes) return NextResponse.json({ error: 'Informe o motivo da rejeição.' }, { status: 400 })

  // Mesmo motivo do approve: sem policy de UPDATE pra authenticated
  // em plan_price_change_requests, de propósito — troca pro client de
  // service-role depois da checagem de role.
  const admin = createAdminClient()

  const { data: request } = await admin
    .from('plan_price_change_requests')
    .select('id, status')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  if (request.status !== 'pendente') {
    return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
  }

  const { data: resolvedRequest, error } = await admin
    .from('plan_price_change_requests')
    .update({ status: 'rejeitado', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_notes: notes })
    .eq('id', id)
    .eq('status', 'pendente')
    .select('id')
    .single()

  if (error || !resolvedRequest) {
    console.error('[price-requests reject]', error)
    return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
