import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import {
  derivePublicationStatus, deriveReviewStatus,
  type AppDraftRow, type ApplicationRow, type SubmissionRow,
} from '@/lib/marketplace'
import ManageAppClient from './ManageAppClient'

export default async function ManageAppPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const { data: draft } = await supabase
    .from('app_drafts')
    .select(`
      id, name, short_description, full_description, logo_url, category, status, created_at, updated_at, created_by,
      application_id, media_gallery, support_email, documentation_url, website_url,
      applications(id, slug, is_published, suspended_at, suspended_reason, suspended_by, updated_at)
    `)
    .eq('id', appId)
    .single()

  if (!draft) notFound()

  type DraftFull = AppDraftRow & {
    full_description: string | null; media_gallery: unknown; support_email: string | null
    documentation_url: string | null; website_url: string | null
    applications: ApplicationRow | ApplicationRow[] | null
  }
  const d = draft as unknown as DraftFull
  const application = Array.isArray(d.applications) ? (d.applications[0] ?? null) : d.applications

  const [{ data: submissions }, { data: plans }, { data: activationConfig }, { data: events }, { data: partnerProfile }] = await Promise.all([
    supabase.from('app_submissions').select('id, status, submitted_at, reviewed_at, reviewer_id, submitted_by, public_feedback, published_at')
      .eq('app_draft_id', appId).order('submitted_at', { ascending: false }),
    supabase.from('app_plans').select('id, name, price, currency, billing_period, features, users_limit, support_level')
      .eq('app_draft_id', appId).order('display_order', { ascending: true }),
    supabase.from('app_activation_config').select('activation_method, activation_link, support_email, instructions').eq('app_draft_id', appId).maybeSingle(),
    supabase.from('app_admin_events').select('id, action, reason, previous_status, new_status, actor_id, created_at').eq('app_draft_id', appId).order('created_at', { ascending: false }),
    supabase.from('profiles').select('full_name, email, company_name, role').eq('id', d.created_by).single(),
  ])

  const actorIds = [...new Set((events ?? []).map(e => e.actor_id).filter(Boolean))] as string[]
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const actorMap = new Map((actors ?? []).map(a => [a.id, a.full_name || a.email || 'Usuário removido']))

  const subs = (submissions ?? []) as (SubmissionRow & { public_feedback: string | null; published_at: string | null })[]
  const latestSubmission = subs[0] ?? null
  const publishedSubmission = subs.find(s => s.published_at) ?? null
  const publication = derivePublicationStatus(application)
  const review = deriveReviewStatus(latestSubmission, publication.key === 'publicado', publishedSubmission?.id ?? null)
  const origin: 'lobby' | 'partner' = partnerProfile?.role === 'technician' ? 'lobby' : 'partner'
  const partnerName = partnerProfile?.company_name || partnerProfile?.full_name || partnerProfile?.email || 'Sem nome cadastrado'

  return (
    <ManageAppClient
      user={user}
      profile={profile}
      draft={{
        id: d.id, name: d.name || 'Sem nome', shortDescription: d.short_description, fullDescription: d.full_description,
        logoUrl: d.logo_url, category: d.category || 'Sem categoria', createdAt: d.created_at, updatedAt: d.updated_at || d.created_at,
        websiteUrl: d.website_url, mediaGallery: Array.isArray(d.media_gallery) ? d.media_gallery as { type: string; url: string }[] : [],
      }}
      origin={origin}
      partnerName={partnerName}
      publication={publication}
      review={review}
      canPublish={review.key === 'aprovado' && publication.key === 'nao_publicado'}
      canSuspend={publication.key === 'publicado'}
      canReactivate={publication.key === 'suspenso'}
      applicationSlug={application?.slug ?? null}
      suspendedReason={application?.suspended_reason ?? null}
      plans={(plans ?? []) as { id: string; name: string; price: number | null; currency: string; billing_period: string; features: string[] | null; users_limit: number | null; support_level: string | null }[]}
      activationConfig={activationConfig ?? null}
      submissions={subs.map(s => ({ ...s, actorName: actorMap.get(s.submitted_by) ?? null }))}
      events={(events ?? []).map(e => ({ ...e, actorName: e.actor_id ? (actorMap.get(e.actor_id) ?? 'Usuário removido') : 'Sistema' }))}
    />
  )
}
