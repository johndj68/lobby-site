import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { parseEventFilters, buildEventsQuery, resolveActorLabels, resolveSearchActorIds, sanitizeSearch } from '@/lib/services/campaign-events-query'
import type { EventOrigin, FieldChange } from '@/lib/services/campaign-events'

const PAGE_SIZE = 15

interface EventRow {
  id: string; action: string; reason: string | null; previous_status: string | null; new_status: string | null
  actor_id: string | null; created_at: string; creative_id: string | null; internal_note: string | null; field_changes: FieldChange[] | null
}

/**
 * Histórico de auditoria da campanha (aba Histórico) — busca, filtro,
 * ordenação e paginação sempre no backend (nunca só nos itens já
 * carregados, seção 5). O resumo lateral (summary) ignora os filtros de
 * propósito e sempre reflete o histórico completo — ele é rotulado como tal
 * na UI, nunca como "resultado do filtro atual" (seção 11).
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

  const { data: campaign } = await supabase.from('sponsored_campaigns').select('id, created_at').eq('id', campaignId).single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })

  const sp = req.nextUrl.searchParams
  const filters = parseEventFilters(sp)
  const page = Math.max(0, parseInt(sp.get('page') ?? '0', 10) || 0)

  // app_admin_events tem RLS só pra service_role (mesmo padrão de
  // ad_events/metrics) — permissão já validada acima via profiles.role.
  const admin = createAdminClient()

  const searchActorIds = filters.q ? await resolveSearchActorIds(admin, sanitizeSearch(filters.q)) : []
  const listQuery = buildEventsQuery(admin, campaignId, filters, searchActorIds)
  const { data: rows, count, error } = await listQuery.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1) as { data: EventRow[] | null; count: number | null; error: { message: string } | null }
  if (error) {
    console.error('[campaigns/events]', error)
    return NextResponse.json({ error: 'Não foi possível consultar o histórico agora — tente novamente.' }, { status: 500 })
  }

  const [{ count: totalUnfiltered }, { data: lastActivityRow }, { data: lastCreativeRow }, { data: allActorRows }] = await Promise.all([
    admin.from('app_admin_events').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId),
    admin.from('app_admin_events').select('action, actor_id, created_at').eq('campaign_id', campaignId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
    admin.from('app_admin_events').select('action, created_at').eq('campaign_id', campaignId)
      .in('action', ['review_creative_approve', 'review_creative_changes', 'review_creative_reject'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('app_admin_events').select('actor_id').eq('campaign_id', campaignId),
  ])

  const pageActorIds = (rows ?? []).map(r => r.actor_id).filter((v): v is string => !!v)
  const allActorIds = (allActorRows ?? []).map(r => r.actor_id).filter((v): v is string => !!v)
  const actorMap = await resolveActorLabels(admin, [...new Set([...pageActorIds, ...allActorIds, ...(lastActivityRow?.actor_id ? [lastActivityRow.actor_id] : [])])])

  function actorView(actorId: string | null) {
    if (!actorId) return { actorId: null, actorName: 'Sistema', actorOrigin: 'sistema' as const }
    const found = actorMap.get(actorId)
    if (!found) return { actorId, actorName: 'Responsável não registrado', actorOrigin: 'admin' as const }
    return { actorId, actorName: found.name, actorOrigin: (found.role === 'technician' ? 'admin' : 'parceiro') as EventOrigin }
  }

  const items = (rows ?? []).map(r => ({
    id: r.id, action: r.action, reason: r.reason, previousStatus: r.previous_status, newStatus: r.new_status,
    createdAt: r.created_at, creativeId: r.creative_id, internalNote: r.internal_note, fieldChanges: r.field_changes,
    ...actorView(r.actor_id),
  }))

  const actorOptions = [
    { id: 'sistema', name: 'Sistema' },
    ...[...new Set(allActorIds)].map(id => ({ id, name: actorMap.get(id)?.name ?? 'Responsável não registrado' })),
  ]

  return NextResponse.json({
    items, total: count ?? 0, page, pageSize: PAGE_SIZE,
    summary: {
      campaignCreatedAt: campaign.created_at,
      totalEvents: totalUnfiltered ?? 0,
      lastActivity: lastActivityRow ? { createdAt: lastActivityRow.created_at, action: lastActivityRow.action, ...actorView(lastActivityRow.actor_id) } : null,
      lastCreativeDecision: lastCreativeRow ? { createdAt: lastCreativeRow.created_at, action: lastCreativeRow.action } : null,
    },
    actorOptions,
    fetchedAt: new Date().toISOString(),
  })
}
