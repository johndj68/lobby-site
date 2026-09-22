import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import {
  derivePublicationStatus, deriveReviewStatus, summarizeOffer,
  type AppDraftRow, type ApplicationRow, type SubmissionRow, type PlanRow,
} from '@/lib/marketplace'
import AplicativosClient, { type CatalogRow } from './AplicativosClient'

interface SearchParams {
  q?: string
  publicacao?: string
  origem?: string
  categoria?: string
  revisao?: string
  parceiro?: string
  atualizado?: string
  nova_versao?: string
  sort?: string
  page?: string
  per_page?: string
}

const PAGE_SIZES = [10, 20, 50]

export default async function AplicativosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const [{ data: drafts, error: draftsError }, { data: submissions }, { data: plans }] = await Promise.all([
    supabase
      .from('app_drafts')
      .select(`
        id, name, short_description, logo_url, category, status, created_at, updated_at, created_by, application_id,
        applications(id, slug, is_published, suspended_at, suspended_reason, updated_at)
      `)
      .order('updated_at', { ascending: false }),
    supabase
      .from('app_submissions')
      .select('id, app_draft_id, status, submitted_at, reviewed_at, reviewer_id, submitted_by, published_at')
      .order('submitted_at', { ascending: false }),
    supabase
      .from('app_plans')
      .select('id, app_draft_id, billing_period, price, currency'),
  ])

  type DraftWithApp = AppDraftRow & { applications: ApplicationRow | ApplicationRow[] | null }
  const rawDrafts = (drafts ?? []) as unknown as DraftWithApp[]
  const allSubmissions = (submissions ?? []) as (SubmissionRow & { published_at: string | null })[]
  const allPlans = (plans ?? []) as PlanRow[]

  const peopleIds = [...new Set(rawDrafts.map(d => d.created_by))]
  const { data: people } = peopleIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name, role').in('id', peopleIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null; role: string }[] }
  const peopleMap = new Map((people ?? []).map(p => [p.id, p]))

  const submissionsByDraft = new Map<string, (SubmissionRow & { published_at: string | null })[]>()
  for (const s of allSubmissions) {
    const arr = submissionsByDraft.get(s.app_draft_id) ?? []
    arr.push(s)
    submissionsByDraft.set(s.app_draft_id, arr)
  }
  const plansByDraft = new Map<string, PlanRow[]>()
  for (const p of allPlans) {
    const arr = plansByDraft.get(p.app_draft_id) ?? []
    arr.push(p)
    plansByDraft.set(p.app_draft_id, arr)
  }

  const allRows: CatalogRow[] = rawDrafts.map(d => {
    const application = Array.isArray(d.applications) ? (d.applications[0] ?? null) : d.applications
    const subs = submissionsByDraft.get(d.id) ?? []
    const latestSubmission = subs[0] ?? null
    const publishedSubmission = subs.find(s => s.published_at) ?? null
    const publication = derivePublicationStatus(application)
    const review = deriveReviewStatus(latestSubmission, publication.key === 'publicado', publishedSubmission?.id ?? null)
    const person = peopleMap.get(d.created_by)
    const origin: 'lobby' | 'partner' = person?.role === 'technician' ? 'lobby' : 'partner'
    const partnerName = person?.company_name || person?.full_name || person?.email || 'Sem nome cadastrado'

    return {
      id: d.id,
      name: d.name || 'Sem nome',
      shortDescription: d.short_description,
      logoUrl: d.logo_url,
      category: d.category || 'Sem categoria',
      updatedAt: d.updated_at || d.created_at,
      createdAt: d.created_at,
      origin,
      partnerName,
      partnerId: d.created_by,
      publication,
      review,
      offerSummary: summarizeOffer(plansByDraft.get(d.id) ?? []),
      slug: application?.slug ?? null,
      applicationId: application?.id ?? null,
      canPublish: review.key === 'aprovado' && publication.key === 'nao_publicado',
    }
  })

  // Indicadores vêm do catálogo INTEIRO (resumo geral), não do filtrado.
  const indicators = {
    total: allRows.length,
    publicados: allRows.filter(r => r.publication.key === 'publicado').length,
    naoPublicados: allRows.filter(r => r.publication.key === 'nao_publicado').length,
    suspensos: allRows.filter(r => r.publication.key === 'suspenso').length,
  }
  const alerts = {
    aprovadosAguardando: allRows.filter(r => r.canPublish).length,
    novaVersaoEmAnalise: allRows.filter(r => r.review.key === 'nova_versao_em_analise').length,
  }
  const categoryOptions = [...new Set(allRows.map(r => r.category))].sort()
  const partnerOptions = [...new Map(allRows.filter(r => r.origin === 'partner').map(r => [r.partnerId, r.partnerName])).entries()]
    .map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))

  // Filtro, ordenação e paginação — computados aqui no servidor. Com o
  // volume atual (dezenas de apps) fazer isso em memória depois de um
  // único fetch é equivalente, em termos de dado exposto ao cliente
  // (só a página pedida sai daqui), a filtrar via SQL; numa base bem maior
  // isso deveria virar filtro/paginação nativos do Postgres (WHERE/LIMIT).
  let filtered = allRows
  const q = (sp.q ?? '').trim().toLowerCase()
  if (q) {
    filtered = filtered.filter(r =>
      r.name.toLowerCase().includes(q) || r.partnerName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
    )
  }
  if (sp.publicacao && sp.publicacao !== 'todas') filtered = filtered.filter(r => r.publication.key === sp.publicacao)
  if (sp.origem && sp.origem !== 'todas') filtered = filtered.filter(r => r.origin === sp.origem)
  if (sp.categoria && sp.categoria !== 'todas') filtered = filtered.filter(r => r.category === sp.categoria)
  if (sp.revisao && sp.revisao !== 'todas') filtered = filtered.filter(r => r.review.key === sp.revisao)
  if (sp.parceiro && sp.parceiro !== 'todos') filtered = filtered.filter(r => r.partnerId === sp.parceiro)
  if (sp.nova_versao === '1') filtered = filtered.filter(r => r.review.key === 'nova_versao_em_analise')
  if (sp.atualizado && sp.atualizado !== 'todos') {
    const days = sp.atualizado === '7d' ? 7 : sp.atualizado === '30d' ? 30 : sp.atualizado === '90d' ? 90 : null
    if (days) {
      const cutoff = Date.now() - days * 86400000
      filtered = filtered.filter(r => new Date(r.updatedAt).getTime() >= cutoff)
    }
  }

  const sort = sp.sort || 'atualizado_recente'
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'nome') return a.name.localeCompare(b.name)
    if (sort === 'data_cadastro') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const pageSize = PAGE_SIZES.includes(Number(sp.per_page)) ? Number(sp.per_page) : 20
  const totalFiltered = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages)
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <AplicativosClient
      user={user}
      profile={profile}
      rows={pageRows}
      indicators={indicators}
      alerts={alerts}
      categoryOptions={categoryOptions}
      partnerOptions={partnerOptions}
      totalFiltered={totalFiltered}
      page={page}
      pageSize={pageSize}
      totalPages={totalPages}
      loadError={!!draftsError}
      filters={{
        q: sp.q ?? '', publicacao: sp.publicacao ?? 'todas', origem: sp.origem ?? 'todas',
        categoria: sp.categoria ?? 'todas', revisao: sp.revisao ?? 'todas', parceiro: sp.parceiro ?? 'todos',
        atualizado: sp.atualizado ?? 'todos', nova_versao: sp.nova_versao === '1', sort,
      }}
    />
  )
}
