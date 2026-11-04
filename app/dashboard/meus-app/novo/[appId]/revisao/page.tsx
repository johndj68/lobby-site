import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { notFound } from 'next/navigation'
import { calculateReview } from '@/lib/validations/app-review'
import { deriveReviewStatus, derivePublicationStatus, type SubmissionRow } from '@/lib/marketplace'
import ReviewClient from './ReviewClient'

export const metadata: Metadata = {
  title: 'Revisão | LOBBY',
  description: 'Revise seu aplicativo antes de enviar',
}

interface PageProps {
  params: Promise<{ appId: string }>
}

export default async function ReviewPage({ params }: PageProps) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  // RLS (dono ou app_team_members) decide o acesso — sem filtro extra por
  // created_by aqui. Se não tiver acesso, a linha simplesmente não volta.
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('*, applications(id, slug, is_published, suspended_at, suspended_reason)')
    .eq('id', appId)
    .single()

  if (!draft) notFound()

  const application = Array.isArray(draft.applications) ? (draft.applications[0] ?? null) : draft.applications

  const [{ data: plans }, { data: config }, { data: members }, { data: invitations }, { data: submissions }, { data: membership }] = await Promise.all([
    supabase.from('app_plans').select('*').eq('app_draft_id', appId).order('display_order', { ascending: true }),
    supabase.from('app_activation_config').select('*').eq('app_draft_id', appId).maybeSingle(),
    supabase.from('app_team_members').select('*').eq('app_draft_id', appId),
    supabase.from('app_team_invitations').select('*').eq('app_draft_id', appId).eq('status', 'pending'),
    supabase.from('app_submissions')
      .select('id, status, submitted_at, reviewed_at, reviewer_id, public_feedback, published_at')
      .eq('app_draft_id', appId)
      .order('submitted_at', { ascending: false }),
    supabase.from('app_team_members').select('role, permissions').eq('app_draft_id', appId).eq('user_id', user.id).maybeSingle(),
  ])

  const review = calculateReview(draft, plans ?? [], config, members ?? [], invitations ?? [])

  const allSubmissions = (submissions ?? []) as (SubmissionRow & { published_at: string | null; public_feedback: string | null })[]
  const latestSubmission = allSubmissions[0] ?? null
  const publishedSubmission = allSubmissions.find(s => s.published_at) ?? null
  const publication = derivePublicationStatus(application)
  const submissionStatus = deriveReviewStatus(latestSubmission, publication.key === 'publicado', publishedSubmission?.id ?? null)

  const isOwner = draft.created_by === user.id
  const canEdit = isOwner || membership?.role === 'owner' || !!membership?.permissions?.includes('edit')

  const byId = new Map(review.items.map(i => [i.id, i]))
  const completion = {
    1: !!draft.name?.trim(),
    2: byId.get('basicInfo')?.status === 'complete' && byId.get('media')?.status === 'complete',
    3: byId.get('offer')?.status === 'complete',
  }

  return (
    <ReviewClient
      draft={{ id: draft.id, name: draft.name, category: draft.category, logoUrl: draft.logo_url, lastEditedAt: draft.last_edited_at ?? draft.updated_at ?? draft.created_at }}
      vendorName={profile?.company_name || profile?.full_name || null}
      review={review}
      completion={completion}
      canEdit={canEdit}
      submissionStatus={{ key: submissionStatus.key, label: submissionStatus.label, color: submissionStatus.color }}
      latestSubmission={latestSubmission ? {
        id: latestSubmission.id, status: latestSubmission.status, submittedAt: latestSubmission.submitted_at,
        publicFeedback: latestSubmission.public_feedback,
      } : null}
    />
  )
}
