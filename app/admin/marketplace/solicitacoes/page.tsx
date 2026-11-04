import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import SubmissionsClient, { type SubmissionRow } from './SubmissionsClient'

interface SearchParams {
  q?: string
  status?: string
  sort?: string
  page?: string
  per_page?: string
}

const PAGE_SIZES = [10, 20, 50]

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const supabase = await createServerSupabaseClient()

  // requireTechnicianSession já valida a role de técnico
  const { user, profile } = await requireTechnicianSession(supabase)

  const { data: submissions, error: submissionsError } = await supabase
    .from('app_submissions')
    .select(`
      id, status, submitted_at, app_draft_id, submitted_by, public_feedback,
      app_drafts(id, name, short_description, logo_url, category, created_by)
    `)
    .order('submitted_at', { ascending: false })

  type DraftInfo = { id: string; name: string | null; short_description: string | null; logo_url: string | null; category: string | null; created_by: string | null }
  type RawSubmission = {
    id: string; status: string; submitted_at: string; app_draft_id: string; submitted_by: string; public_feedback: string | null
    app_drafts: DraftInfo | DraftInfo[] | null
  }
  const rawSubmissions = (submissions ?? []) as unknown as RawSubmission[]

  // Desenvolvedor/parceiro é quem criou o rascunho do app (mesma origem usada
  // em Aplicativos), não quem clicou em "enviar" — o submitted_by às vezes é
  // um técnico LOBBY revisando em nome do parceiro.
  const developerIds = [...new Set(rawSubmissions.map(s => {
    const draft = Array.isArray(s.app_drafts) ? s.app_drafts[0] : s.app_drafts
    return draft?.created_by ?? null
  }).filter((id): id is string => !!id))]

  const { data: people } = developerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name').in('id', developerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null }[] }
  const peopleMap = new Map((people ?? []).map(p => [p.id, p]))

  const allRows: SubmissionRow[] = rawSubmissions.map(s => {
    const draft = Array.isArray(s.app_drafts) ? (s.app_drafts[0] ?? null) : s.app_drafts
    const person = draft?.created_by ? peopleMap.get(draft.created_by) : undefined
    return {
      id: s.id,
      status: s.status,
      submittedAt: s.submitted_at,
      appName: draft?.name || 'Sem nome',
      shortDescription: draft?.short_description ?? null,
      logoUrl: draft?.logo_url ?? null,
      category: draft?.category || 'Sem categoria',
      developerName: person?.company_name || person?.full_name || person?.email || null,
    }
  })

  // Indicadores vêm de TODAS as solicitações (resumo geral), não das filtradas.
  const indicators = {
    pending: allRows.filter(r => r.status === 'pending').length,
    in_review: allRows.filter(r => r.status === 'in_review').length,
    changes_requested: allRows.filter(r => r.status === 'changes_requested').length,
    approved: allRows.filter(r => r.status === 'approved').length,
    rejected: allRows.filter(r => r.status === 'rejected').length,
  }

  let filtered = allRows
  const q = (sp.q ?? '').trim().toLowerCase()
  if (q) {
    filtered = filtered.filter(r =>
      r.appName.toLowerCase().includes(q) || (r.developerName ?? '').toLowerCase().includes(q)
    )
  }
  if (sp.status && sp.status !== 'todas') filtered = filtered.filter(r => r.status === sp.status)

  const sort = sp.sort || 'enviado_recente'
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'nome') return a.appName.localeCompare(b.appName)
    return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  })

  const pageSize = PAGE_SIZES.includes(Number(sp.per_page)) ? Number(sp.per_page) : 20
  const totalFiltered = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages)
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <SubmissionsClient
      user={user}
      profile={profile}
      rows={pageRows}
      indicators={indicators}
      totalFiltered={totalFiltered}
      page={page}
      pageSize={pageSize}
      totalPages={totalPages}
      loadError={!!submissionsError}
      filters={{ q: sp.q ?? '', status: sp.status ?? 'todas', sort }}
    />
  )
}
