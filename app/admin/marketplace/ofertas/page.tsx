import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { fetchOfferRows } from '@/lib/services/offers'
import OfertasClient from './OfertasClient'

interface SearchParams {
  q?: string; app?: string; partner?: string; origem?: string; revisao?: string
  disponibilidade?: string; cobranca?: string; moeda?: string; promocao?: string
  periodo?: string; sort?: string; page?: string; per_page?: string
}

const PAGE_SIZES = [10, 20, 50]

export default async function OfertasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const { rows: allRows, error: loadError } = await fetchOfferRows(supabase)

  // Opções de filtro derivadas dos dados reais — nunca uma lista fixa que
  // possa citar um app/parceiro/moeda que não existe no catálogo.
  const appOptions = [...new Map(allRows.map(r => [r.appDraftId, r.appName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const partnerOptions = [...new Map(allRows.map(r => [r.partnerId, r.partnerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const currencyOptions = [...new Set(allRows.map(r => r.currency))].sort()

  let filtered = allRows
  const q = (sp.q ?? '').trim().toLowerCase()
  if (q) filtered = filtered.filter(r => r.appName.toLowerCase().includes(q) || r.planName.toLowerCase().includes(q) || r.partnerName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
  if (sp.app && sp.app !== 'todos') filtered = filtered.filter(r => r.appDraftId === sp.app)
  if (sp.partner && sp.partner !== 'todos') filtered = filtered.filter(r => r.partnerId === sp.partner)
  if (sp.origem === 'lobby' || sp.origem === 'partner') filtered = filtered.filter(r => r.origin === sp.origem)
  if (sp.revisao && sp.revisao !== 'todas') filtered = filtered.filter(r => r.review.key === sp.revisao)
  if (sp.disponibilidade && sp.disponibilidade !== 'todas') filtered = filtered.filter(r => r.availability.key === sp.disponibilidade)
  if (sp.cobranca && sp.cobranca !== 'todas') filtered = filtered.filter(r => r.billingPeriod === sp.cobranca)
  if (sp.moeda && sp.moeda !== 'todas') filtered = filtered.filter(r => r.currency === sp.moeda)
  if (sp.promocao === 'ativa') filtered = filtered.filter(r => r.promotion?.status.key === 'ativa')
  if (sp.promocao === 'programada') filtered = filtered.filter(r => r.promotion?.status.key === 'programada')
  if (sp.promocao === 'nenhuma') filtered = filtered.filter(r => !r.promotion || r.promotion.status.key === 'encerrada' || r.promotion.status.key === 'cancelada')
  if (sp.periodo && sp.periodo !== 'todos') {
    const days = sp.periodo === '7d' ? 7 : sp.periodo === '30d' ? 30 : sp.periodo === '90d' ? 90 : null
    if (days) { const cutoff = Date.now() - days * 86400000; filtered = filtered.filter(r => new Date(r.updatedAt).getTime() >= cutoff) }
  }

  // Indicadores calculados sobre o MESMO escopo dos filtros aplicados
  // (seção 5) — não sobre o catálogo inteiro, pra nunca mostrar um número
  // que não bate com a tabela abaixo.
  const indicators = {
    cadastradas: filtered.filter(r => r.status !== 'archived').length,
    disponiveis: filtered.filter(r => r.availability.key === 'disponivel').length,
    promocoesAtivas: filtered.filter(r => r.promotion?.status.key === 'ativa').length,
    promocoesProgramadas: filtered.filter(r => r.promotion?.status.key === 'programada').length,
  }

  const sort = sp.sort || 'atualizado_recente'
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'nome') return a.appName.localeCompare(b.appName) || a.planName.localeCompare(b.planName)
    if (sort === 'preco_asc') return (a.price ?? Infinity) - (b.price ?? Infinity)
    if (sort === 'preco_desc') return (b.price ?? -Infinity) - (a.price ?? -Infinity)
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const pageSize = PAGE_SIZES.includes(Number(sp.per_page)) ? Number(sp.per_page) : 20
  const totalFiltered = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages)
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <OfertasClient
      user={user} profile={profile} rows={pageRows} indicators={indicators}
      totalFiltered={totalFiltered} page={page} pageSize={pageSize} totalPages={totalPages}
      loadError={loadError}
      appOptions={appOptions} partnerOptions={partnerOptions} currencyOptions={currencyOptions}
      filters={{
        q: sp.q ?? '', app: sp.app ?? 'todos', partner: sp.partner ?? 'todos', origem: sp.origem ?? 'todas',
        revisao: sp.revisao ?? 'todas', disponibilidade: sp.disponibilidade ?? 'todas', cobranca: sp.cobranca ?? 'todas',
        moeda: sp.moeda ?? 'todas', promocao: sp.promocao ?? 'todas', periodo: sp.periodo ?? 'todos', sort,
      }}
    />
  )
}
