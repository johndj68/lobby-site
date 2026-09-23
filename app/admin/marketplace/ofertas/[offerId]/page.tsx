import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { derivePublicationStatus, deriveReviewStatus } from '@/lib/marketplace'
import { partnerDisplayName } from '@/lib/partners'
import { computeOfferAvailability, getPromotionStatus, type PlanStatus } from '@/lib/services/offers'
import OfertaDetailClient from './OfertaDetailClient'

export default async function OfertaDetailPage({ params, searchParams }: { params: Promise<{ offerId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { offerId } = await params
  const { tab } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const { data: plan } = await supabase
    .from('app_plans')
    .select('id, app_draft_id, name, description, currency, price, billing_period, features, limits, users_limit, support_level, activation_method, activation_instructions, status, paused_at, paused_reason, archived_at, created_at, updated_at')
    .eq('id', offerId)
    .single()
  if (!plan) notFound()

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name, logo_url, category, created_by, application_id, applications(id, slug, is_published, suspended_at, suspended_reason)')
    .eq('id', plan.app_draft_id)
    .single()
  if (!draft) notFound()

  type AppRow = { id: string; slug: string; is_published: boolean; suspended_at: string | null; suspended_reason: string | null }
  const application = Array.isArray(draft.applications) ? (draft.applications[0] ?? null) : (draft.applications as AppRow | null)

  const [
    { data: partner }, { data: submissions }, { data: activationConfig },
    { data: codes }, { data: promotions }, { data: events },
  ] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, company_name, role, marketplace_new_apps_blocked').eq('id', draft.created_by).single(),
    supabase.from('app_submissions').select('id, status, submitted_at, published_at').eq('app_draft_id', draft.id).order('submitted_at', { ascending: false }),
    supabase.from('app_activation_config').select('activation_method, activation_link, support_email, instructions').eq('app_draft_id', draft.id).maybeSingle(),
    supabase.from('app_activation_codes').select('id, status').eq('plan_id', offerId),
    supabase.from('promotions').select('*').eq('plan_id', offerId).order('starts_at', { ascending: false }),
    supabase.from('app_admin_events').select('id, action, reason, previous_status, new_status, actor_id, created_at').eq('plan_id', offerId).order('created_at', { ascending: false }),
  ])

  const latestSubmission = submissions?.[0] ?? null
  const publishedSubmission = submissions?.find(s => s.published_at) ?? null
  const publication = derivePublicationStatus(application)
  const review = deriveReviewStatus(latestSubmission, publication.key === 'publicado', publishedSubmission?.id ?? null)

  let hasOpenBlockers = false
  if (latestSubmission) {
    const { data: issues } = await supabase.from('review_issues').select('id').eq('submission_id', latestSubmission.id).eq('severity', 'blocker').is('resolved_at', null)
    hasOpenBlockers = (issues?.length ?? 0) > 0
  }

  const codeStats = (codes ?? []).reduce((acc, c) => { acc.total++; if (c.status === 'available') acc.available++; if (c.status === 'delivered') acc.delivered++; if (c.status === 'reserved') acc.reserved++; if (c.status === 'revoked') acc.revoked++; return acc }, { total: 0, available: 0, delivered: 0, reserved: 0, revoked: 0 })
  const requiresStock = plan.activation_method === 'manual' && codeStats.total > 0

  const availability = computeOfferAvailability({
    planStatus: plan.status as PlanStatus,
    billingPeriod: plan.billing_period,
    appPublished: publication.key === 'publicado',
    appSuspended: publication.key === 'suspenso',
    latestSubmissionApproved: review.key === 'aprovado' || review.key === 'nova_versao_em_analise',
    hasOpenBlockers,
    activationConfigured: !!activationConfig,
    partnerBlocked: !!partner?.marketplace_new_apps_blocked,
    requiresStock,
    availableCodes: codeStats.available,
  })

  const actorIds = [...new Set((events ?? []).map(e => e.actor_id).filter(Boolean))] as string[]
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const actorMap = new Map((actors ?? []).map(a => [a.id, a.full_name || a.email || 'Usuário removido']))

  return (
    <OfertaDetailClient
      user={user}
      profile={profile}
      initialTab={tab === 'promocoes' ? 'Promoções' : tab === 'plano' ? 'Plano e preço' : undefined}
      offer={{
        id: plan.id,
        name: plan.name,
        description: plan.description ?? null,
        currency: plan.currency || 'BRL',
        price: plan.price,
        billingPeriod: plan.billing_period,
        features: plan.features ?? [],
        limits: plan.limits ?? null,
        usersLimit: plan.users_limit,
        supportLevel: plan.support_level,
        activationMethod: plan.activation_method,
        activationInstructions: plan.activation_instructions,
        status: plan.status as PlanStatus,
        pausedReason: plan.paused_reason,
        createdAt: plan.created_at,
        updatedAt: plan.updated_at ?? plan.created_at,
      }}
      app={{ id: draft.id, name: draft.name || 'Sem nome', logoUrl: draft.logo_url, category: draft.category, applicationSlug: application?.slug ?? null }}
      origin={partner?.role === 'technician' ? 'lobby' : 'partner'}
      partnerName={partner ? partnerDisplayName(partner) : 'Parceiro removido'}
      publication={publication}
      review={review}
      availability={availability}
      activationConfig={activationConfig ?? null}
      codeStats={requiresStock ? codeStats : null}
      promotions={(promotions ?? []).map(p => ({ ...p, status: getPromotionStatus(p) }))}
      events={(events ?? []).map(e => ({ ...e, actorName: e.actor_id ? (actorMap.get(e.actor_id) ?? 'Usuário removido') : 'Sistema' }))}
    />
  )
}
