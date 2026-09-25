import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { periodRange, type PeriodKey } from '@/lib/marketplace'

/**
 * Métricas reais de impressões/cliques do período — sem conversão/receita
 * atribuída (não há janela de atribuição implementada, seção 19). CTR = —
 * com zero impressões.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const period = (sp.get('period') as PeriodKey) || '30d'
  const { start, end } = periodRange(period, sp.get('from'), sp.get('to'))

  const { data: events } = await supabase
    .from('ad_events')
    .select('event_type, device_type, created_at')
    .eq('campaign_id', campaignId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())

  const rows = events ?? []
  const impressions = rows.filter(e => e.event_type === 'impression').length
  const clicks = rows.filter(e => e.event_type === 'click').length
  const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : null

  const byDay = new Map<string, { impressions: number; clicks: number }>()
  for (const e of rows) {
    const day = e.created_at.slice(0, 10)
    const entry = byDay.get(day) ?? { impressions: 0, clicks: 0 }
    if (e.event_type === 'impression') entry.impressions++
    else entry.clicks++
    byDay.set(day, entry)
  }

  const byDevice = new Map<string, number>()
  for (const e of rows) {
    if (e.event_type !== 'impression') continue
    const key = e.device_type || 'unknown'
    byDevice.set(key, (byDevice.get(key) ?? 0) + 1)
  }

  return NextResponse.json({
    impressions,
    clicks,
    ctr,
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
    byDevice: Object.fromEntries(byDevice),
  })
}
