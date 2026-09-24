import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { fetchCampaignRows } from '@/lib/services/campaigns'
import DestaquesClient from './DestaquesClient'

interface SearchParams {
  q?: string; app?: string; partner?: string; origem?: string; revisao?: string
  pagamento?: string; disponibilidade?: string; espaco?: string; page?: string; per_page?: string; sort?: string
  periodo?: string
}

const PAGE_SIZES = [10, 20, 50]

export default async function DestaquesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const [{ rows: allRows, error: loadError }, { data: spaces }, { data: packages }] = await Promise.all([
    fetchCampaignRows(supabase),
    supabase.from('ad_spaces').select('*').order('name'),
    supabase.from('ad_packages').select('*').order('created_at', { ascending: false }),
  ])

  const appOptions = [...new Map(allRows.filter(r => r.partnerId).map(r => [r.appName, r.appName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const partnerOptions = [...new Map(allRows.map(r => [r.partnerId, r.partnerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const spaceOptions = (spaces ?? []).map(s => [s.id, s.name] as [string, string])

  let filtered = allRows
  const q = (sp.q ?? '').trim().toLowerCase()
  if (q) filtered = filtered.filter(r => r.appName.toLowerCase().includes(q) || (r.internalName ?? '').toLowerCase().includes(q) || r.partnerName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
  if (sp.app && sp.app !== 'todos') filtered = filtered.filter(r => r.appName === sp.app || r.id === sp.app)
  if (sp.partner && sp.partner !== 'todos') filtered = filtered.filter(r => r.partnerId === sp.partner)
  if (sp.origem === 'lobby' || sp.origem === 'partner') filtered = filtered.filter(r => r.origin === sp.origem)
  if (sp.revisao && sp.revisao !== 'todas') filtered = filtered.filter(r => r.review.key === sp.revisao)
  if (sp.pagamento && sp.pagamento !== 'todos') filtered = filtered.filter(r => r.payment.key === sp.pagamento)
  if (sp.disponibilidade && sp.disponibilidade !== 'todas') filtered = filtered.filter(r => r.eligibility.key === sp.disponibilidade)
  if (sp.espaco && sp.espaco !== 'todos') filtered = filtered.filter(r => r.spaceId === sp.espaco)

  // Indicadores sobre o escopo filtrado (mesmo critério de Ofertas) — os 3
  // primeiros representam a situação AGORA; impressões representam o
  // período (seção 5) — como ainda não há filtro de período na listagem em
  // si, mostramos impressões dos últimos 30 dias por padrão.
  const indicators = {
    emExibicao: filtered.filter(r => r.eligibility.key === 'em_exibicao').length,
    programadas: filtered.filter(r => r.eligibility.key === 'programada').length,
    aguardandoRevisao: filtered.filter(r => r.review.key === 'em_revisao').length,
  }

  const periodo = sp.periodo && ['7d', '30d', '90d'].includes(sp.periodo) ? sp.periodo : '30d'
  const periodDays = periodo === '7d' ? 7 : periodo === '90d' ? 90 : 30
  const campaignIdsInScope = filtered.map(r => r.id)
  let impressionsInPeriod = 0
  if (campaignIdsInScope.length) {
    const since = new Date(Date.now() - periodDays * 86400000).toISOString()
    const { count } = await supabase
      .from('ad_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'impression')
      .in('campaign_id', campaignIdsInScope)
      .gte('created_at', since)
    impressionsInPeriod = count ?? 0
  }

  const sort = sp.sort || 'atualizado_recente'
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'nome') return a.appName.localeCompare(b.appName)
    if (sort === 'inicio') return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const pageSize = PAGE_SIZES.includes(Number(sp.per_page)) ? Number(sp.per_page) : 20
  const totalFiltered = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages)
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Programação: reservas held/confirmed com dados da campanha, pra aba
  // "Programação" — ordenado por início.
  const { data: reservationRows } = await supabase
    .from('ad_reservations')
    .select('id, campaign_id, space_id, starts_at, ends_at, status, expires_at, sponsored_campaigns(internal_name, app_draft_id)')
    .in('status', ['held', 'confirmed'])
    .order('starts_at', { ascending: true })

  return (
    <DestaquesClient
      user={user} profile={profile}
      rows={pageRows} indicators={{ ...indicators, impressionsInPeriod }}
      totalFiltered={totalFiltered} page={page} pageSize={pageSize} totalPages={totalPages}
      loadError={loadError}
      appOptions={appOptions} partnerOptions={partnerOptions} spaceOptions={spaceOptions}
      spaces={spaces ?? []} packages={packages ?? []}
      reservations={(reservationRows ?? []).map(r => {
        const campaign = Array.isArray(r.sponsored_campaigns) ? r.sponsored_campaigns[0] : r.sponsored_campaigns
        return { id: r.id, campaignId: r.campaign_id, spaceId: r.space_id, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status as 'held' | 'confirmed', expiresAt: r.expires_at, campaignName: campaign?.internal_name ?? 'Sem nome' }
      })}
      filters={{
        q: sp.q ?? '', app: sp.app ?? 'todos', partner: sp.partner ?? 'todos', origem: sp.origem ?? 'todas',
        revisao: sp.revisao ?? 'todas', pagamento: sp.pagamento ?? 'todos', disponibilidade: sp.disponibilidade ?? 'todas',
        espaco: sp.espaco ?? 'todos', sort, periodo,
      }}
    />
  )
}
