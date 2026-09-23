import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { derivePublicationStatus, deriveReviewStatus, type SubmissionStatus } from '@/lib/marketplace'
import { deriveRegistrationStatus, deriveTermsStatus, partnerDisplayName } from '@/lib/partners'
import PartnerDetailClient from './PartnerDetailClient'

export default async function PartnerDetailPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const { data: partner } = await supabase
    .from('profiles')
    .select('id, full_name, email, company_name, created_at, onboarded, marketplace_new_apps_blocked, marketplace_blocked_at, marketplace_blocked_reason')
    .eq('id', partnerId)
    .single()
  if (!partner) notFound()

  const { data: drafts } = await supabase
    .from('app_drafts')
    .select('id, name, short_description, logo_url, category, status, created_at, updated_at, application_id, applications(id, slug, is_published, suspended_at)')
    .eq('created_by', partnerId)
    .order('updated_at', { ascending: false })

  type DraftFull = { id: string; name: string | null; short_description: string | null; logo_url: string | null; category: string | null; status: string; created_at: string; updated_at: string; application_id: string | null; applications: { id: string; slug: string; is_published: boolean; suspended_at: string | null } | { id: string; slug: string; is_published: boolean; suspended_at: string | null }[] | null }
  const myDrafts = (drafts ?? []) as unknown as DraftFull[]
  const draftIds = myDrafts.map(d => d.id)

  type SubmissionRow = { id: string; app_draft_id: string; status: SubmissionStatus; submitted_at: string; reviewed_at: string | null; published_at: string | null }
  type AcceptanceRow = { id: string; app_draft_id: string; accepted_partner_terms: boolean; accepted_commercial_terms: boolean; partner_terms_version: string | null; commercial_terms_version: string | null; accepted_at: string; user_id: string }
  type TeamMemberRow = { id: string; app_draft_id: string; user_id: string; role: string; scope: string; joined_at: string }
  type TeamInviteRow = { id: string; app_draft_id: string; invited_email: string; invited_name: string | null; scope: string; status: string; sent_at: string; expires_at: string }
  type EventRow = { id: string; app_draft_id: string | null; action: string; reason: string | null; previous_status: string | null; new_status: string | null; actor_id: string | null; created_at: string }

  const [{ data: submissions }, { data: acceptances }, { data: teamMembers }, { data: teamInvites }, eventsByPartner, eventsByDrafts] = await Promise.all([
    draftIds.length ? supabase.from('app_submissions').select('id, app_draft_id, status, submitted_at, reviewed_at, published_at').in('app_draft_id', draftIds).order('submitted_at', { ascending: false }) : Promise.resolve({ data: [] as SubmissionRow[] }),
    draftIds.length ? supabase.from('app_review_acceptances').select('id, app_draft_id, accepted_partner_terms, accepted_commercial_terms, partner_terms_version, commercial_terms_version, accepted_at, user_id').in('app_draft_id', draftIds).order('accepted_at', { ascending: false }) : Promise.resolve({ data: [] as AcceptanceRow[] }),
    draftIds.length ? supabase.from('app_team_members').select('id, app_draft_id, user_id, role, scope, joined_at').in('app_draft_id', draftIds) : Promise.resolve({ data: [] as TeamMemberRow[] }),
    draftIds.length ? supabase.from('app_team_invitations').select('id, app_draft_id, invited_email, invited_name, scope, status, sent_at, expires_at').in('app_draft_id', draftIds) : Promise.resolve({ data: [] as TeamInviteRow[] }),
    supabase.from('app_admin_events').select('id, app_draft_id, action, reason, previous_status, new_status, actor_id, created_at').eq('partner_id', partnerId).order('created_at', { ascending: false }),
    draftIds.length ? supabase.from('app_admin_events').select('id, app_draft_id, action, reason, previous_status, new_status, actor_id, created_at').in('app_draft_id', draftIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as EventRow[] }),
  ])
  const events = [...(eventsByPartner.data ?? []), ...(eventsByDrafts.data ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const actorIds = [...new Set([
    ...(teamMembers ?? []).map(m => m.user_id),
    ...(acceptances ?? []).map(a => a.user_id),
    ...events.map(e => e.actor_id).filter(Boolean),
  ])] as string[]
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const actorMap = new Map((actors ?? []).map(a => [a.id, a.full_name || a.email || 'Usuário removido']))

  const submissionsByDraft = new Map<string, SubmissionRow[]>()
  for (const s of (submissions ?? []) as SubmissionRow[]) {
    const arr = submissionsByDraft.get(s.app_draft_id) ?? []
    arr.push(s)
    submissionsByDraft.set(s.app_draft_id, arr)
  }

  const apps = myDrafts.map(d => {
    const application = Array.isArray(d.applications) ? (d.applications[0] ?? null) : d.applications
    const subs = submissionsByDraft.get(d.id) ?? []
    const latest = subs[0] ?? null
    const publishedSub = subs.find(s => s.published_at) ?? null
    const publication = derivePublicationStatus(application)
    const review = deriveReviewStatus(latest, publication.key === 'publicado', publishedSub?.id ?? null)
    return {
      id: d.id, name: d.name || 'Sem nome', shortDescription: d.short_description, logoUrl: d.logo_url,
      category: d.category || 'Sem categoria', updatedAt: d.updated_at, publication, review,
    }
  })

  const hasAcceptance = (acceptances ?? []).some(a => a.accepted_partner_terms && a.accepted_commercial_terms)

  const teamByApp = draftIds.map(id => ({
    appDraftId: id,
    appName: myDrafts.find(d => d.id === id)?.name || 'Sem nome',
    members: (teamMembers ?? []).filter(m => m.app_draft_id === id).map(m => ({ ...m, name: actorMap.get(m.user_id) ?? 'Usuário removido' })),
    invitations: (teamInvites ?? []).filter(i => i.app_draft_id === id),
  })).filter(g => g.members.length > 0 || g.invitations.length > 0)

  return (
    <PartnerDetailClient
      user={user} profile={profile}
      partner={{
        id: partner.id, name: partnerDisplayName(partner), email: partner.email, companyName: partner.company_name,
        createdAt: partner.created_at, registration: deriveRegistrationStatus(partner), terms: deriveTermsStatus(hasAcceptance),
        blocked: partner.marketplace_new_apps_blocked, blockedAt: partner.marketplace_blocked_at, blockedReason: partner.marketplace_blocked_reason,
      }}
      apps={apps}
      appsInAnalysis={apps.filter(a => a.review.key === 'aguardando_analise' || a.review.key === 'nova_versao_em_analise').length}
      acceptances={(acceptances ?? []).map(a => ({ ...a, userName: actorMap.get(a.user_id) ?? 'Usuário removido' }))}
      teamByApp={teamByApp}
      events={events.map(e => ({ ...e, actorName: e.actor_id ? (actorMap.get(e.actor_id) ?? 'Usuário removido') : 'Sistema' }))}
    />
  )
}
