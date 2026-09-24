import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Checagem read-only de capacidade pra um período proposto — não reserva
 * nada, só informa se hoje há vaga (mesma regra de sobreposição do RPC de
 * reserva). Usada pelo formulário do parceiro antes de escolher datas.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const spaceId = sp.get('spaceId')
  const startsAt = sp.get('startsAt')
  const endsAt = sp.get('endsAt')
  if (!spaceId || !startsAt || !endsAt) return NextResponse.json({ error: 'Parâmetros faltando.' }, { status: 400 })

  const { data: space } = await supabase.from('ad_spaces').select('max_concurrent_campaigns, is_active').eq('id', spaceId).single()
  if (!space || !space.is_active) return NextResponse.json({ available: false, reason: 'Espaço indisponível.' })

  const { data: overlapping } = await supabase
    .from('ad_reservations')
    .select('id, status, expires_at')
    .eq('space_id', spaceId)
    .in('status', ['held', 'confirmed'])
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt)

  const activeCount = (overlapping ?? []).filter(r => r.status === 'confirmed' || !r.expires_at || new Date(r.expires_at) > new Date()).length
  const available = activeCount < space.max_concurrent_campaigns

  return NextResponse.json({ available, capacity: space.max_concurrent_campaigns, used: activeCount })
}
