import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import {
  derivePublicationStatus, deriveReviewStatus,
  type AppDraftRow, type ApplicationRow, type SubmissionRow,
} from '@/lib/marketplace'
import MeusAppsClient, { type AppRow } from './MeusAppsClient'

export const metadata: Metadata = { title: 'Meus aplicativos | LOBBY', robots: { index: false, follow: false } }

interface SearchParams {
  q?: string
  analise?: string
  publicacao?: string
  em_analise?: string
  sort?: string
  page?: string
  per_page?: string
}

const PAGE_SIZES = [10, 20, 50]
// Bucket "em análise" dos cards de resumo — mais amplo que o filtro
// "Análise" (que distingue aguardando/em análise), conforme a definição do
// card: "submissão atual aguardando análise ou em revisão".
const UNDER_ANALYSIS_KEYS = new Set(['aguardando_analise', 'em_analise', 'nova_versao_em_analise'])

export default async function MeusAppsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  // RLS já restringe a apps próprios OU onde o usuário é membro de equipe
  // (app_team_members) — sem filtro explícito por created_by/user.id aqui:
  // confiar em RLS, não num id vindo do cliente.
  const { data: drafts, error: draftsError } = await supabase
    .from('app_drafts')
    .select(`
      id, name, short_description, logo_url, category, status, created_at, updated_at, created_by, application_id,
      applications(id, slug, is_published, suspended_at, suspended_reason, updated_at)
    `)
    .order('updated_at', { ascending: false })

  type DraftWithApp = AppDraftRow & { applications: ApplicationRow | ApplicationRow[] | null }
  const rawDrafts = (drafts ?? []) as unknown as DraftWithApp[]
  const draftIds = rawDrafts.map(d => d.id)

  const { data: submissions } = draftIds.length
    ? await supabase
        .from('app_submissions')
        .select('id, app_draft_id, status, submitted_at, reviewed_at, reviewer_id, submitted_by, public_feedback, published_at')
        .in('app_draft_id', draftIds)
        .order('submitted_at', { ascending: false })
    : { data: [] as (SubmissionRow & { published_at: string | null; public_feedback: string | null })[] }
  const allSubmissions = (submissions ?? []) as (SubmissionRow & { published_at: string | null; public_feedback: string | null })[]

  // Papel do usuário em cada app (pra saber se pode editar ou só consultar) —
  // só busca quando há apps acessados via equipe, não via o próprio dono.
  const { data: memberships } = draftIds.length
    ? await supabase.from('app_team_members').select('app_draft_id, role, permissions').eq('user_id', user.id)
    : { data: [] as { app_draft_id: string; role: string; permissions: string[] }[] }
  const membershipMap = new Map((memberships ?? []).map(m => [m.app_draft_id, m]))

  // Nome do dono, só pros apps onde o usuário está por app_team_members (não
  // é ele o dono) — precisa pra distinguir apps de equipe na listagem.
  // Uma chamada batched pra tela inteira via RPC estreita (get_app_owners),
  // não uma consulta por linha, e não abre profiles geral.
  type OwnerRow = { app_draft_id: string; owner_id: string; full_name: string | null; company_name: string | null }
  const teamDraftIds = draftIds.filter(id => membershipMap.has(id))
  const { data: owners } = teamDraftIds.length
    ? await supabase.rpc('get_app_owners', { p_app_draft_ids: teamDraftIds }) as unknown as { data: OwnerRow[] | null }
    : { data: [] as OwnerRow[] }
  const ownerNameMap = new Map((owners ?? []).map((o: OwnerRow) => [o.app_draft_id, o.company_name || o.full_name || null]))

  const submissionsByDraft = new Map<string, typeof allSubmissions>()
  for (const s of allSubmissions) {
    const arr = submissionsByDraft.get(s.app_draft_id) ?? []
    arr.push(s)
    submissionsByDraft.set(s.app_draft_id, arr)
  }

  const allRows: AppRow[] = rawDrafts.map(d => {
    const application = Array.isArray(d.applications) ? (d.applications[0] ?? null) : d.applications
    const subs = submissionsByDraft.get(d.id) ?? []
    const latestSubmission = subs[0] ?? null
    const publishedSubmission = subs.find(s => s.published_at) ?? null
    const publication = derivePublicationStatus(application)
    const review = deriveReviewStatus(latestSubmission, publication.key === 'publicado', publishedSubmission?.id ?? null)

    const isOwner = d.created_by === user.id
    const membership = membershipMap.get(d.id)
    const canEdit = isOwner || membership?.role === 'owner' || !!membership?.permissions?.includes('edit')

    return {
      id: d.id,
      name: d.name || 'Aplicativo sem nome',
      shortDescription: d.short_description,
      logoUrl: d.logo_url,
      category: d.category || 'Não definida',
      updatedAt: d.updated_at || d.created_at,
      createdAt: d.created_at,
      publication,
      review,
      latestSubmissionId: latestSubmission?.id ?? null,
      latestSubmissionMessage: latestSubmission?.public_feedback ?? null,
      isOwner,
      canEdit,
      ownerName: isOwner ? null : (ownerNameMap.get(d.id) ?? null),
      applicationSlug: application?.slug ?? null,
    }
  })

  const indicators = {
    total: allRows.length,
    publicados: allRows.filter(r => r.publication.key === 'publicado').length,
    emAnalise: allRows.filter(r => UNDER_ANALYSIS_KEYS.has(r.review.key)).length,
    ajustesSolicitados: allRows.filter(r => r.review.key === 'ajustes_solicitados').length,
  }

  let filtered = allRows
  const q = (sp.q ?? '').trim().toLowerCase()
  if (q) {
    filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
  }
  if (sp.analise && sp.analise !== 'todas') filtered = filtered.filter(r => r.review.key === sp.analise)
  if (sp.publicacao && sp.publicacao !== 'todas') filtered = filtered.filter(r => r.publication.key === sp.publicacao)
  if (sp.em_analise === '1') filtered = filtered.filter(r => UNDER_ANALYSIS_KEYS.has(r.review.key))

  const sort = sp.sort || 'atualizado_recente'
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'nome') return a.name.localeCompare(b.name)
    if (sort === 'criados_recentemente') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const pageSize = PAGE_SIZES.includes(Number(sp.per_page)) ? Number(sp.per_page) : 20
  const totalFiltered = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages)
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <MeusAppsClient
      rows={pageRows}
      indicators={indicators}
      totalFiltered={totalFiltered}
      page={page}
      pageSize={pageSize}
      totalPages={totalPages}
      loadError={!!draftsError}
      filters={{
        q: sp.q ?? '', analise: sp.analise ?? 'todas', publicacao: sp.publicacao ?? 'todas',
        emAnalise: sp.em_analise === '1', sort,
      }}
    />
  )
}
