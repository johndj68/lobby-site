import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { formatDateTimeBR } from '@/lib/marketplace'
import { getActionMeta, getStatusLabel, isDateRangeStatus, type FieldChange } from '@/lib/services/campaign-events'
import { parseEventFilters, buildEventsQuery, resolveActorLabels, resolveSearchActorIds, sanitizeSearch } from '@/lib/services/campaign-events-query'

interface EventRow {
  id: string; action: string; reason: string | null; previous_status: string | null; new_status: string | null
  actor_id: string | null; created_at: string; creative_id: string | null; internal_note: string | null; field_changes: FieldChange[] | null
}

/** Blinda contra fórmula maliciosa em planilha (CSV injection) — mesma
 *  função da exportação de Desempenho, propositalmente duplicada aqui
 *  (mesmo padrão já usado entre metrics/export e offers.ts: um helper puro
 *  pequeno o bastante pra não valer a pena um módulo compartilhado só pra
 *  ele). */
function csvSafeText(value: string): string {
  const escaped = value.replace(/"/g, '""')
  return /^[=+\-@\t\r]/.test(escaped) ? `'${escaped}` : escaped
}
function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${csvSafeText(s)}"` : csvSafeText(s)
}

// Limite de segurança — histórico de uma única campanha não deveria nunca
// chegar perto disso; existe só pra nunca travar a rota se algo gerar
// eventos em excesso. A exportação avisa se cortou.
const MAX_ROWS = 5000

/** Exporta o histórico filtrado (mesmos filtros da listagem, seção 14) —
 *  nunca só a página visível, e nunca modifica a campanha (somente leitura). */
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

  const { data: campaign } = await supabase.from('sponsored_campaigns').select('id, internal_name').eq('id', campaignId).single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })

  const admin = createAdminClient()
  const filters = parseEventFilters(req.nextUrl.searchParams)
  const searchActorIds = filters.q ? await resolveSearchActorIds(admin, sanitizeSearch(filters.q)) : []
  const query = buildEventsQuery(admin, campaignId, filters, searchActorIds)
  const { data: rows, error } = await query.range(0, MAX_ROWS - 1) as { data: EventRow[] | null; error: { message: string } | null }
  if (error) {
    console.error('[campaigns/events/export]', error)
    return NextResponse.json({ error: 'Não foi possível gerar a exportação agora — tente novamente.' }, { status: 500 })
  }

  const actorIds = (rows ?? []).map(r => r.actor_id).filter((v): v is string => !!v)
  const actorMap = await resolveActorLabels(admin, actorIds)
  function actorName(actorId: string | null) {
    if (!actorId) return 'Sistema'
    return actorMap.get(actorId)?.name ?? 'Responsável não registrado'
  }
  function statusCell(action: string, code: string | null) {
    if (isDateRangeStatus(action)) return code ?? ''
    return getStatusLabel(code).label
  }

  const creativeIds = [...new Set((rows ?? []).map(r => r.creative_id).filter((v): v is string => !!v))]
  const { data: creativeRows } = creativeIds.length
    ? await admin.from('ad_creatives').select('id, version').in('id', creativeIds)
    : { data: [] as { id: string; version: number }[] }
  const versionMap = new Map((creativeRows ?? []).map(c => [c.id, c.version]))
  function fieldChangesCell(changes: FieldChange[] | null) {
    if (!changes) return ''
    return changes.map(c => `${c.label}: ${c.before ?? 'não registrado'} → ${c.after ?? 'não registrado'}`).join(' | ')
  }

  const lines: string[] = []
  lines.push(['Campanha', 'ID da campanha', 'Gerado em'].map(csvCell).join(','))
  lines.push([campaign.internal_name ?? 'Sem nome', campaign.id, formatDateTimeBR(new Date().toISOString())].map(csvCell).join(','))
  lines.push('')
  lines.push([
    'ID do evento', 'Data e hora (Brasília)', 'Tipo', 'Ação', 'Responsável', 'Estado anterior', 'Estado posterior',
    'Motivo', 'Versão do criativo', 'Campos alterados', 'Nota interna',
  ].map(csvCell).join(','))
  for (const r of rows ?? []) {
    const meta = getActionMeta(r.action)
    lines.push([
      r.id, formatDateTimeBR(r.created_at), meta.category, meta.label, actorName(r.actor_id),
      statusCell(r.action, r.previous_status), statusCell(r.action, r.new_status), r.reason ?? '',
      r.creative_id ? (versionMap.get(r.creative_id) != null ? `v${versionMap.get(r.creative_id)}` : '') : '',
      fieldChangesCell(r.field_changes), r.internal_note ?? '',
    ].map(csvCell).join(','))
  }
  if ((rows ?? []).length >= MAX_ROWS) {
    lines.push('')
    lines.push(csvCell(`Exportação limitada aos primeiros ${MAX_ROWS} eventos correspondentes aos filtros — refine o período para ver o restante.`))
  }

  const csv = '﻿' + lines.join('\r\n')
  const filename = `historico-destaque-${campaignId.slice(0, 8)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
