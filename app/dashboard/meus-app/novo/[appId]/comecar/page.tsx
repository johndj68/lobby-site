import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { getStepCompletion } from '@/lib/services/app-draft-steps'
import ComecarClient, { type NextStepState } from './ComecarClient'

export const metadata: Metadata = { title: 'Começar | LOBBY', robots: { index: false, follow: false } }

export default async function ComecarPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  // RLS (dono ou app_team_members) decide o acesso — sem filtro extra por
  // created_by aqui. Se não tiver acesso, a linha simplesmente não volta.
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('*, applications(id, is_published)')
    .eq('id', appId)
    .single()

  if (!draft) notFound()

  const application = Array.isArray(draft.applications) ? (draft.applications[0] ?? null) : draft.applications

  const [completion, { data: membership }, { data: submissions }] = await Promise.all([
    getStepCompletion(supabase, draft),
    supabase.from('app_team_members').select('role, permissions').eq('app_draft_id', appId).eq('user_id', user.id).maybeSingle(),
    supabase.from('app_submissions').select('id, status').eq('app_draft_id', appId).order('submitted_at', { ascending: false }).limit(1),
  ])

  const latestSubmission = submissions?.[0] ?? null
  const isOwner = draft.created_by === user.id
  const canEdit = isOwner || membership?.role === 'owner' || !!membership?.permissions?.includes('edit')

  const hasBasicData = !!(draft.name?.trim() || draft.short_description?.trim() || draft.full_description?.trim() || draft.category_id || draft.logo_url?.trim() || (Array.isArray(draft.media_gallery) && draft.media_gallery.length > 0))

  // Estado real de cada próxima etapa — mesmo motor de validação (calculateReview)
  // usado pelo editor e pela revisão. "Com pendências" só aparece quando há um
  // sinal real de que o revisor pediu ajuste (draft.status), nunca inventado.
  function stepState(isComplete: boolean, hasAnyData: boolean): NextStepState {
    if (isComplete) return 'complete'
    if (draft.status === 'changes_requested') return 'pending'
    if (hasAnyData) return 'in_progress'
    return 'not_started'
  }

  const step2State = stepState(completion.step2, hasBasicData)
  const step3State = stepState(completion.step3, completion.plansCount > 0)
  const step4State: NextStepState = latestSubmission
    ? (latestSubmission.status === 'changes_requested' ? 'pending' : 'complete')
    : (completion.step2 && completion.step3 ? 'in_progress' : 'not_started')

  // Próxima etapa real a retomar — nunca localStorage, sempre progresso real.
  const nextStep: 2 | 3 | 4 = !completion.step2 ? 2 : !completion.step3 ? 3 : 4

  return (
    <ComecarClient
      draft={{
        id: draft.id, name: draft.name, category: draft.category, status: draft.status,
        logoUrl: draft.logo_url, websiteUrl: draft.website_url,
        createdAt: draft.created_at, lastEditedAt: draft.last_edited_at ?? draft.updated_at ?? draft.created_at,
      }}
      isPublished={!!application?.is_published}
      organizationName={profile?.company_name || profile?.full_name || null}
      completion={{ 1: completion.step1, 2: completion.step2, 3: completion.step3 }}
      canEdit={canEdit}
      nextStep={nextStep}
      stepStates={{ step2: step2State, step3: step3State, step4: step4State }}
    />
  )
}
