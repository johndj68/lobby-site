import type { SupabaseClient } from '@supabase/supabase-js'
import { periodRange } from '@/lib/marketplace'

/**
 * Agregação real de desempenho de campanha (impressões/cliques/CTR) — usada
 * tanto pela rota de métricas quanto pela de exportação, pra nunca haver
 * dois cálculos divergentes do mesmo número (seção 16: "totais coerentes
 * entre cards, gráfico, tabela e exportação").
 */

export type DesempenhoPeriod = 'hoje' | '7d' | '30d' | 'campanha' | 'custom'

export interface Range { start: Date; end: Date }

/** "Todo o período da campanha" usa as datas contratadas reais — nunca uma
 *  janela arbitrária. Se o período contratado ainda não terminou, o fim
 *  efetivo é agora (não faz sentido pedir eventos do futuro); a resposta
 *  informa quando isso acontece (`clampedToNow`) pra a UI não confundir
 *  "período contratado" com "período efetivamente coberto por dados". */
export function resolveRange(period: DesempenhoPeriod, from: string | null, to: string | null, campaign: { starts_at: string; ends_at: string }): Range & { clampedToNow: boolean } {
  const now = new Date()
  if (period === 'campanha') {
    const start = new Date(campaign.starts_at)
    const rawEnd = new Date(campaign.ends_at)
    const end = rawEnd.getTime() < now.getTime() ? rawEnd : now
    return { start, end, clampedToNow: rawEnd.getTime() > now.getTime() }
  }
  if (period === 'custom') {
    const r = periodRange('custom', from, to)
    return { ...r, clampedToNow: false }
  }
  const r = periodRange(period === 'hoje' ? 'hoje' : period === '7d' ? '7d' : '30d')
  return { ...r, clampedToNow: false }
}

/** Janela imediatamente anterior, mesma duração — nunca um período fixo
 *  diferente do selecionado (seção 6). */
export function comparisonRange({ start, end }: Range): Range {
  const durationMs = end.getTime() - start.getTime()
  const compEnd = new Date(start.getTime() - 1)
  const compStart = new Date(compEnd.getTime() - durationMs)
  return { start: compStart, end: compEnd }
}

export interface AggregateResult {
  ok: true
  impressions: number
  clicks: number
  ctr: number | null
  byDay: { day: string; impressions: number; clicks: number }[]
  byDevice: Record<string, number>
  byCreative: { creativeId: string; impressions: number; clicks: number }[]
}
export interface AggregateError { ok: false; error: unknown }

export async function aggregate(supabase: SupabaseClient, campaignId: string, range: Range): Promise<AggregateResult | AggregateError> {
  const { data: events, error } = await supabase
    .from('ad_events')
    .select('event_type, device_type, creative_id, created_at')
    .eq('campaign_id', campaignId)
    .gte('created_at', range.start.toISOString())
    .lte('created_at', range.end.toISOString())

  if (error) return { ok: false, error }

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
  const byCreative = new Map<string, { impressions: number; clicks: number }>()
  for (const e of rows) {
    if (e.event_type === 'impression') byDevice.set(e.device_type || 'unknown', (byDevice.get(e.device_type || 'unknown') ?? 0) + 1)
    const cid = e.creative_id ?? 'desconhecida'
    const entry = byCreative.get(cid) ?? { impressions: 0, clicks: 0 }
    if (e.event_type === 'impression') entry.impressions++
    else entry.clicks++
    byCreative.set(cid, entry)
  }

  return {
    ok: true, impressions, clicks, ctr,
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
    byDevice: Object.fromEntries(byDevice),
    byCreative: [...byCreative.entries()].map(([creativeId, v]) => ({ creativeId, ...v })),
  }
}

export function isValidPeriod(value: string | null): value is DesempenhoPeriod {
  return !!value && (['hoje', '7d', '30d', 'campanha', 'custom'] as const).includes(value as DesempenhoPeriod)
}

export interface DayPoint { day: string; impressions: number; clicks: number }

/** Completa os dias sem nenhum evento como zero real (distinto de "sem
 *  cobertura") — usado tanto pelo gráfico/tabela (UI) quanto pela
 *  exportação CSV, pra nunca um dia zero sumir silenciosamente de um dos
 *  dois e parecer "sem dado" em vez de "zero confirmado" (seção 7/11/12). */
export function fillDays(byDay: DayPoint[], startIso: string, endIso: string): DayPoint[] {
  const map = new Map(byDay.map(d => [d.day, d]))
  const out: DayPoint[] = []
  const s = new Date(startIso.slice(0, 10) + 'T00:00:00Z')
  const e = new Date(endIso.slice(0, 10) + 'T00:00:00Z')
  for (const d = new Date(s); d.getTime() <= e.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    out.push(map.get(key) ?? { day: key, impressions: 0, clicks: 0 })
  }
  return out
}
