import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Aprovar/rejeitar uma solicitação de alteração de destino de recebimento.
 * Corpo: { action: 'approve' | 'reject', reason?: string }
 *
 * A escrita de verdade acontece nas RPCs security definer
 * (approve_partner_payout_destination_request/reject_...,
 * 20261006140000) — são elas que tocam profiles.payout_* (UPDATE direto
 * foi revogado pra authenticated, 20261006130000) e checam is_technician
 * de novo, então esta rota é só uma casca fina de validação de corpo +
 * tradução de erro, mesmo padrão de
 * app/api/admin/offers/promotions/[promotionId]/route.ts.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para gerenciar dados de recebimento.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { action } = body

  if (action === 'approve') {
    const { data, error } = await supabase.rpc('approve_partner_payout_destination_request', { p_request_id: requestId })
    if (error || !data) return NextResponse.json({ error: error?.message || 'Não foi possível aprovar.' }, { status: 409 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) return NextResponse.json({ error: 'Informe o motivo da rejeição.' }, { status: 400 })
    const { data, error } = await supabase.rpc('reject_partner_payout_destination_request', { p_request_id: requestId, p_reason: reason })
    if (error || !data) return NextResponse.json({ error: error?.message || 'Não foi possível rejeitar.' }, { status: 409 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
}
