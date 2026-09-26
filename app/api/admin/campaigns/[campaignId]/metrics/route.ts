import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { resolveRange, comparisonRange, aggregate, isValidPeriod, type DesempenhoPeriod } from '@/lib/services/campaign-metrics'

/**
 * Métricas reais de impressões/cliques do período — sem conversão/receita
 * atribuída (não há janela de atribuição implementada, seção 10). CTR = —
 * (null) com zero impressões, nunca 0 (seção 5/11).
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

  const { data: campaign } = await supabase.from('sponsored_campaigns').select('id, starts_at, ends_at, created_at').eq('id', campaignId).single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })

  const sp = req.nextUrl.searchParams
  const periodParam = sp.get('period')
  const period: DesempenhoPeriod = isValidPeriod(periodParam) ? periodParam : '30d'
  const compare = sp.get('compare') === '1'

  const range = resolveRange(period, sp.get('from'), sp.get('to'), campaign)
  if (range.end.getTime() < range.start.getTime()) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
  }

  // ad_events tem RLS habilitada e NENHUMA policy de select pra usuário
  // autenticado (só o service_role, via endpoint público, grava e o admin
  // real lê) — com o client normal essa consulta sempre voltava vazia,
  // mesmo havendo eventos reais. A permissão de quem pode ver já foi
  // validada acima (role=technician); o client admin só bypassa a RLS da
  // tabela de eventos, não pula a checagem de permissão desta rota.
  const admin = createAdminClient()

  const current = await aggregate(admin, campaignId, range)
  if (!current.ok) {
    console.error('[campaigns/metrics]', current.error)
    return NextResponse.json({ error: 'Não foi possível consultar as métricas agora — tente novamente.' }, { status: 500 })
  }

  let previous: Awaited<ReturnType<typeof aggregate>> | null = null
  let previousRange: { start: Date; end: Date } | null = null
  if (compare) {
    previousRange = comparisonRange(range)
    const prevResult = await aggregate(admin, campaignId, previousRange)
    if (!prevResult.ok) {
      console.error('[campaigns/metrics:compare]', prevResult.error)
    } else {
      previous = prevResult
    }
  }

  const { data: creatives } = await supabase.from('ad_creatives').select('id, version').eq('campaign_id', campaignId)
  const creativeVersionById = new Map((creatives ?? []).map(c => [c.id, c.version]))

  return NextResponse.json({
    period, range: { start: range.start.toISOString(), end: range.end.toISOString(), clampedToNow: range.clampedToNow },
    campaignCreatedAt: campaign.created_at, campaignStartsAt: campaign.starts_at, campaignEndsAt: campaign.ends_at,
    // "now" calculado aqui (servidor) de propósito — nunca dentro do render
    // do componente client (regra de pureza: Date.now() ali seria impuro).
    campaignNotStarted: new Date(campaign.starts_at).getTime() > Date.now(),
    impressions: current.impressions, clicks: current.clicks, ctr: current.ctr,
    byDay: current.byDay, byDevice: current.byDevice,
    byCreative: current.byCreative.map(c => ({ ...c, version: c.creativeId === 'desconhecida' ? null : creativeVersionById.get(c.creativeId) ?? null })),
    comparison: previous && previousRange ? {
      range: { start: previousRange.start.toISOString(), end: previousRange.end.toISOString() },
      impressions: previous.impressions, clicks: previous.clicks, ctr: previous.ctr, byDay: previous.byDay,
    } : null,
    fetchedAt: new Date().toISOString(),
  })
}
