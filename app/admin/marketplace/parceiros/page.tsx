import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { derivePublicationStatus } from '@/lib/marketplace'
import { deriveRegistrationStatus, deriveTermsStatus, partnerDisplayName, type PartnerProfile } from '@/lib/partners'
import ParceirosClient, { type PartnerRow } from './ParceirosClient'

interface SearchParams {
  q?: string; situacao?: string; bloqueado?: string; termos?: string; publicados?: string
  cadastro?: string; sort?: string; page?: string; per_page?: string
}

const PAGE_SIZES = [10, 20, 50]

export default async function ParceirosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const [{ data: drafts, error: draftsError }, { data: submissions }, { data: acceptances }] = await Promise.all([
    supabase.from('app_drafts').select('id, status, created_by, created_at, updated_at, application_id, applications(is_published, suspended_at)'),
    supabase.from('app_submissions').select('id, app_draft_id, status, submitted_at').order('submitted_at', { ascending: false }),
    supabase.from('app_review_acceptances').select('app_draft_id, accepted_partner_terms, accepted_commercial_terms'),
  ])

  type DraftRow = { id: string; status: string; created_by: string; created_at: string; updated_at: string; application_id: string | null; applications: { is_published: boolean; suspended_at: string | null } | { is_published: boolean; suspended_at: string | null }[] | null }
  const allDrafts = (drafts ?? []) as unknown as DraftRow[]
  const partnerIds = [...new Set(allDrafts.map(d => d.created_by))]

  const { data: people } = partnerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name, created_at, onboarded, marketplace_new_apps_blocked, marketplace_blocked_at, marketplace_blocked_reason').in('id', partnerIds)
    : { data: [] as PartnerProfile[] }

  const draftsByPartner = new Map<string, DraftRow[]>()
  for (const d of allDrafts) {
    const arr = draftsByPartner.get(d.created_by) ?? []
    arr.push(d)
    draftsByPartner.set(d.created_by, arr)
  }
  const submissionsByDraft = new Map<string, { id: string; status: string; submitted_at: string }[]>()
  for (const s of submissions ?? []) {
    const arr = submissionsByDraft.get(s.app_draft_id) ?? []
    arr.push(s)
    submissionsByDraft.set(s.app_draft_id, arr)
  }
  const acceptedDraftIds = new Set((acceptances ?? []).filter(a => a.accepted_partner_terms && a.accepted_commercial_terms).map(a => a.app_draft_id))

  const allRows: PartnerRow[] = (people ?? []).map(p => {
    const myDrafts = draftsByPartner.get(p.id) ?? []
    let appsPublished = 0, appsInAnalysis = 0, lastActivity = p.created_at
    let hasAcceptance = false
    for (const d of myDrafts) {
      const app = Array.isArray(d.applications) ? (d.applications[0] ?? null) : d.applications
      const pub = derivePublicationStatus(app)
      if (pub.key === 'publicado') appsPublished++
      const subs = submissionsByDraft.get(d.id) ?? []
      const latest = subs[0]
      if (latest && (latest.status === 'pending' || latest.status === 'changes_requested')) appsInAnalysis++
      if (acceptedDraftIds.has(d.id)) hasAcceptance = true
      if (new Date(d.updated_at) > new Date(lastActivity)) lastActivity = d.updated_at
      if (latest && new Date(latest.submitted_at) > new Date(lastActivity)) lastActivity = latest.submitted_at
    }
    const registration = deriveRegistrationStatus(p)
    const terms = deriveTermsStatus(hasAcceptance)
    const pendencies: string[] = []
    if (registration.key === 'pendente') pendencies.push('Cadastro incompleto')
    if (terms.key === 'pendentes') pendencies.push('Termos pendentes')

    return {
      id: p.id,
      name: partnerDisplayName(p),
      email: p.email,
      createdAt: p.created_at,
      lastActivity,
      appsTotal: myDrafts.length,
      appsPublished,
      appsInAnalysis,
      registration,
      terms,
      blocked: p.marketplace_new_apps_blocked,
      blockedReason: p.marketplace_blocked_reason,
      pendencies,
    }
  })

  const indicators = {
    total: allRows.length,
    ativos: allRows.filter(r => r.registration.key === 'ativo').length,
    pendentes: allRows.filter(r => r.registration.key === 'pendente').length,
    bloqueados: allRows.filter(r => r.blocked).length,
  }
  const alerts = {
    termosPendentes: allRows.filter(r => r.terms.key === 'pendentes').length,
    semRecebimento: 0, // sem integração de recebimento no projeto — não fabricar contagem
  }

  let filtered = allRows
  const q = (sp.q ?? '').trim().toLowerCase()
  if (q) filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
  if (sp.situacao && sp.situacao !== 'todas') filtered = filtered.filter(r => r.registration.key === sp.situacao)
  if (sp.bloqueado === '1') filtered = filtered.filter(r => r.blocked)
  if (sp.bloqueado === '0') filtered = filtered.filter(r => !r.blocked)
  if (sp.termos && sp.termos !== 'todos') filtered = filtered.filter(r => r.terms.key === sp.termos)
  if (sp.publicados === '1') filtered = filtered.filter(r => r.appsPublished > 0)
  if (sp.publicados === '0') filtered = filtered.filter(r => r.appsPublished === 0)
  if (sp.cadastro && sp.cadastro !== 'todos') {
    const days = sp.cadastro === '7d' ? 7 : sp.cadastro === '30d' ? 30 : sp.cadastro === '90d' ? 90 : null
    if (days) { const cutoff = Date.now() - days * 86400000; filtered = filtered.filter(r => new Date(r.createdAt).getTime() >= cutoff) }
  }

  const sort = sp.sort || 'atualizado_recente'
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'nome') return a.name.localeCompare(b.name)
    if (sort === 'data_cadastro') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    if (sort === 'apps_publicados') return b.appsPublished - a.appsPublished
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  })

  const pageSize = PAGE_SIZES.includes(Number(sp.per_page)) ? Number(sp.per_page) : 20
  const totalFiltered = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages)
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <ParceirosClient
      user={user} profile={profile} rows={pageRows} indicators={indicators} alerts={alerts}
      totalFiltered={totalFiltered} page={page} pageSize={pageSize} totalPages={totalPages}
      loadError={!!draftsError}
      filters={{
        q: sp.q ?? '', situacao: sp.situacao ?? 'todas', bloqueado: sp.bloqueado ?? 'todos',
        termos: sp.termos ?? 'todos', publicados: sp.publicados ?? 'todos', cadastro: sp.cadastro ?? 'todos', sort,
      }}
    />
  )
}
