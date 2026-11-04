import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { derivePublicationStatus, type ApplicationRow } from '@/lib/marketplace'
import SubmissionDetailClient from './SubmissionDetailClient'

export const metadata: Metadata = {
  title: 'Análise | Admin LOBBY',
}

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  // Nota: reviewer_id/submitted_by referenciam auth.users, não profiles — sem FK
  // declarada pra profiles o PostgREST rejeita o embed (PGRST200), por isso
  // reviewer/parceiro são buscados em queries separadas abaixo, não via join.
  const { data: submission } = await supabase
    .from('app_submissions')
    .select(`
      id, app_draft_id, status, submitted_at, reviewed_at, reviewer_id, submitted_by,
      public_feedback, internal_notes, draft_message, draft_internal_notes, data, content_snapshot,
      app_drafts(
        id, name, short_description, full_description, logo_url, category, target_audience,
        languages, platforms, requirements, features, benefits, integrations, media_gallery,
        video_url, support_email, documentation_url, setup_instructions, created_by, status,
        application_id, applications(id, slug, is_published, suspended_at, suspended_reason)
      )
    `)
    .eq('id', id)
    .single()

  if (!submission) notFound()

  type DraftInfo = {
    id: string; name: string | null; short_description: string | null; full_description: string | null
    logo_url: string | null; category: string | null; target_audience: string | null; languages: string[] | null
    platforms: string[] | null; requirements: string | null; features: unknown; benefits: unknown; integrations: unknown
    media_gallery: unknown; video_url: string | null; support_email: string | null; documentation_url: string | null
    setup_instructions: string | null; created_by: string; status: string; application_id: string | null
    applications: ApplicationRow | ApplicationRow[] | null
  }
  const raw = submission as unknown as Omit<typeof submission, 'app_drafts'> & { app_drafts: DraftInfo | DraftInfo[] | null }
  const draft = Array.isArray(raw.app_drafts) ? (raw.app_drafts[0] ?? null) : raw.app_drafts
  const application = draft ? (Array.isArray(draft.applications) ? (draft.applications[0] ?? null) : draft.applications) : null

  const [{ data: plans }, { data: activationConfig }, { data: checklistItems }, { data: issues }, { data: otherSubmissions }] = await Promise.all([
    draft ? supabase.from('app_plans').select('*').eq('app_draft_id', draft.id) : Promise.resolve({ data: [] }),
    draft ? supabase.from('app_activation_config').select('*').eq('app_draft_id', draft.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('review_checklist_items').select('*').eq('submission_id', id),
    supabase.from('review_issues').select('*').eq('submission_id', id),
    draft
      ? supabase.from('app_submissions')
          .select('id, status, submitted_at, reviewed_at, reviewer_id, submitted_by')
          .eq('app_draft_id', draft.id)
          .order('submitted_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const peopleIds = [...new Set([
    draft?.created_by, submission.reviewer_id, submission.submitted_by,
    ...(otherSubmissions ?? []).map(s => s.reviewer_id),
  ].filter((v): v is string => !!v))]
  const { data: people } = peopleIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name').in('id', peopleIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null }[] }
  const peopleMap = new Map((people ?? []).map(p => [p.id, p]))

  function personLabel(id: string | null | undefined) {
    if (!id) return null
    const p = peopleMap.get(id)
    return p?.full_name || p?.email || 'Usuário removido'
  }

  const publication = derivePublicationStatus(application)

  return (
    <SubmissionDetailClient
      user={user}
      profile={profile}
      submission={{
        id: submission.id,
        status: submission.status,
        submittedAt: submission.submitted_at,
        reviewedAt: submission.reviewed_at,
        reviewerName: personLabel(submission.reviewer_id),
        publicFeedback: submission.public_feedback,
        internalNotes: submission.internal_notes,
        draftMessage: submission.draft_message,
        draftInternalNotes: submission.draft_internal_notes,
        previewData: submission.content_snapshot ?? submission.data ?? {},
      }}
      app={draft ? {
        id: draft.id,
        applicationId: draft.application_id,
        name: draft.name || 'Sem nome',
        shortDescription: draft.short_description,
        fullDescription: draft.full_description,
        logoUrl: draft.logo_url,
        category: draft.category || 'Sem categoria',
        targetAudience: draft.target_audience,
        languages: draft.languages ?? [],
        platforms: draft.platforms ?? [],
        requirements: draft.requirements,
        features: (draft.features as { name?: string; description?: string }[] | null) ?? [],
        benefits: (draft.benefits as { title?: string; description?: string }[] | null) ?? [],
        integrations: (draft.integrations as { name?: string; url?: string }[] | null) ?? [],
        mediaGallery: (draft.media_gallery as { url: string; alt_text?: string; type?: string }[] | null) ?? [],
        videoUrl: draft.video_url,
        supportEmail: draft.support_email,
        documentationUrl: draft.documentation_url,
        setupInstructions: draft.setup_instructions,
        partnerName: personLabel(draft.created_by) ?? 'Sem parceiro cadastrado',
      } : null}
      publication={publication}
      plans={(plans ?? []).map(p => ({
        id: p.id, name: p.name, price: p.price, currency: p.currency, billing_period: p.billing_period,
        features: p.features ?? [], users_limit: p.users_limit, support_level: p.support_level,
      }))}
      activation={activationConfig ? {
        method: activationConfig.activation_method,
        link: activationConfig.activation_link,
        supportEmail: activationConfig.support_email,
        instructions: (activationConfig.instructions as { id?: string; position?: number; text: string }[] | null) ?? [],
      } : null}
      checklistItems={(checklistItems ?? []).map(c => ({
        id: c.id, section: c.section, itemKey: c.item_key, itemLabel: c.item_label, itemDescription: c.item_description,
        status: c.status, note: c.note, blocked: c.blocked, markedAt: c.marked_at,
      }))}
      blockerCount={(issues ?? []).filter(i => i.severity === 'blocker' && !i.resolved_at).length}
      warnings={(issues ?? []).map(i => ({ id: i.id, section: i.section, severity: i.severity, message: i.message, guidance: i.guidance, resolvedAt: i.resolved_at }))}
      history={(otherSubmissions ?? []).map(s => ({
        id: s.id, status: s.status, submittedAt: s.submitted_at, reviewedAt: s.reviewed_at,
        reviewerName: personLabel(s.reviewer_id), submittedByName: personLabel(s.submitted_by), isCurrent: s.id === submission.id,
      }))}
    />
  )
}
