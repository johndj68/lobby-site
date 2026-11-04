import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Consulta de disponibilidade — só leitura, nunca reserva. Espelha a mesma
 * régua de capacidade da RPC reserve_ad_capacity (contagem de held/confirmed
 * não expirados sobrepondo o período, contra max_concurrent_campaigns do
 * espaço), sem o advisory lock nem o insert/update que só fazem sentido no
 * momento de reservar de verdade — uma checagem aqui NUNCA garante a vaga
 * (seção 7): outra campanha pode reservar entre a consulta e a contratação.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const spaceId = body?.spaceId
  const startsAt = body?.startsAt
  const endsAt = body?.endsAt
  if (!spaceId || !startsAt || !endsAt) {
    return NextResponse.json({ error: 'Informe espaço, início e término.' }, { status: 400 })
  }
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
  }

  const { data: space } = await supabase.from('ad_spaces').select('id, name, is_active, max_concurrent_campaigns').eq('id', spaceId).single()
  if (!space) return NextResponse.json({ error: 'Espaço não encontrado.' }, { status: 404 })
  if (!space.is_active) {
    return NextResponse.json({ status: 'indisponivel', reason: 'Este espaço está inativo para veiculação no momento.' })
  }

  const { count, error } = await supabase
    .from('ad_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('space_id', spaceId)
    .neq('campaign_id', campaignId)
    .in('status', ['held', 'confirmed'])
    .or(`status.eq.confirmed,expires_at.gt.${new Date().toISOString()}`)
    .lt('starts_at', end.toISOString())
    .gt('ends_at', start.toISOString())

  if (error) {
    console.error('[campaigns/check-availability]', error)
    return NextResponse.json({ status: 'erro', reason: 'Não foi possível verificar agora — tente novamente.' })
  }

  const used = count ?? 0
  const max = space.max_concurrent_campaigns
  if (used >= max) {
    return NextResponse.json({ status: 'indisponivel', used, max, reason: `Capacidade do espaço ocupada para esse período (${used}/${max} campanhas simultâneas).` })
  }
  return NextResponse.json({ status: 'disponivel', used, max })
}
