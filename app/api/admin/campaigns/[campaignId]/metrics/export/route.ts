import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { formatDateTimeBR } from '@/lib/marketplace'
import { resolveRange, aggregate, isValidPeriod, fillDays, type DesempenhoPeriod } from '@/lib/services/campaign-metrics'

/** Blinda contra fórmula maliciosa em planilha (CSV injection): se o texto
 *  começar com um caractere que o Excel/Sheets interpretaria como início de
 *  fórmula, prefixa com apóstrofo — só o nome interno da campanha é texto
 *  livre aqui, o resto é sempre número/data gerado pelo servidor. */
function csvSafeText(value: string): string {
  const escaped = value.replace(/"/g, '""')
  return /^[=+\-@\t\r]/.test(escaped) ? `'${escaped}` : escaped
}
function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${csvSafeText(s)}"` : csvSafeText(s)
}

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

  const { data: campaign } = await supabase.from('sponsored_campaigns').select('id, internal_name, starts_at, ends_at').eq('id', campaignId).single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })

  const sp = req.nextUrl.searchParams
  const periodParam = sp.get('period')
  const period: DesempenhoPeriod = isValidPeriod(periodParam) ? periodParam : '30d'
  const range = resolveRange(period, sp.get('from'), sp.get('to'), campaign)
  if (range.end.getTime() < range.start.getTime()) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
  }

  // ad_events não tem policy de select pra usuário autenticado (só
  // service_role) — mesma correção da rota de métricas, permissão já
  // validada acima.
  const admin = createAdminClient()
  const result = await aggregate(admin, campaignId, range)
  if (!result.ok) {
    console.error('[campaigns/metrics/export]', result.error)
    return NextResponse.json({ error: 'Não foi possível gerar a exportação agora — tente novamente.' }, { status: 500 })
  }

  const lines: string[] = []
  lines.push(['Campanha', 'ID da campanha', 'Início do intervalo', 'Fim do intervalo', 'Fuso', 'Granularidade', 'Gerado em']
    .map(csvCell).join(','))
  lines.push([
    campaign.internal_name ?? 'Sem nome', campaign.id,
    formatDateTimeBR(range.start.toISOString()), formatDateTimeBR(range.end.toISOString()),
    'America/Sao_Paulo (Brasília)', 'Diária', formatDateTimeBR(new Date().toISOString()),
  ].map(csvCell).join(','))
  lines.push('')
  lines.push(['Data', 'Impressões', 'Cliques', 'CTR (%)'].map(csvCell).join(','))
  const daysWithZeros = fillDays(result.byDay, range.start.toISOString(), range.end.toISOString())
  for (const d of daysWithZeros) {
    const ctr = d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(2) : ''
    lines.push([d.day, d.impressions, d.clicks, ctr].map(csvCell).join(','))
  }
  lines.push(['Total', result.impressions, result.clicks, result.ctr != null ? result.ctr.toFixed(2) : ''].map(csvCell).join(','))

  const csv = '﻿' + lines.join('\r\n')
  const filename = `destaque-${campaignId.slice(0, 8)}-${range.start.toISOString().slice(0, 10)}-a-${range.end.toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
