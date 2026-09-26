import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { derivePublicationStatus } from '@/lib/marketplace'
import { partnerDisplayName } from '@/lib/partners'
import { computeCampaignEligibility, getCreativeReviewBadge, getPaymentBadge, type ReservationStatus, type PurchaseStatus } from '@/lib/services/campaigns'
import CampaignDetailClient from './CampaignDetailClient'

export default async function CampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('*, app_drafts(id, name, logo_url, created_by, applications(id, slug, is_published, suspended_at)), space:ad_spaces(id, name, slug, description, accepted_formats), package:ad_packages(id, name, price, currency, duration_days, description, cancellation_policy, pause_policy)')
    .eq('id', campaignId)
    .single()
  if (!campaign) notFound()

  type DraftRef = { id: string; name: string | null; logo_url: string | null; created_by: string; applications: { id: string; slug: string; is_published: boolean; suspended_at: string | null } | { id: string; slug: string; is_published: boolean; suspended_at: string | null }[] | null }
  const draft = Array.isArray(campaign.app_drafts) ? campaign.app_drafts[0] : (campaign.app_drafts as DraftRef | null)
  const application = draft ? (Array.isArray(draft.applications) ? (draft.applications[0] ?? null) : draft.applications) : null
  const space = Array.isArray(campaign.space) ? campaign.space[0] : campaign.space
  const pkg = Array.isArray(campaign.package) ? campaign.package[0] : campaign.package

  const [
    { data: creatives }, { data: reservation }, { data: purchases }, { data: partner },
    { data: spaces }, { data: packages }, { data: events },
  ] = await Promise.all([
    supabase.from('ad_creatives').select('*').eq('campaign_id', campaignId).order('version', { ascending: false }),
    supabase.from('ad_reservations').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('campaign_purchases').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }),
    draft ? supabase.from('profiles').select('id, full_name, email, company_name, role, marketplace_new_apps_blocked').eq('id', draft.created_by).single() : Promise.resolve({ data: null }),
    supabase.from('ad_spaces').select('id, name, slug, description, accepted_formats, is_active').eq('is_active', true),
    supabase.from('ad_packages').select('id, name, space_id, price, currency, duration_days, description, cancellation_policy, pause_policy').eq('status', 'active'),
    supabase.from('app_admin_events').select('id, action, reason, previous_status, new_status, actor_id, created_at').eq('campaign_id', campaignId).order('created_at', { ascending: false }),
  ])

  // Um único mapa de atores serve tanto o histórico (app_admin_events) quanto
  // o "responsável" de cada versão do criativo (ad_creatives.reviewer_id) —
  // mesma tabela, mesma regra de exibição, nunca duas buscas equivalentes.
  const creativeReviewerIds = [...new Set((creatives ?? []).map(c => c.reviewer_id).filter(Boolean))] as string[]
  const actorIds = [...new Set([...(events ?? []).map(e => e.actor_id), ...creativeReviewerIds].filter(Boolean))] as string[]
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const actorMap = new Map((actors ?? []).map(a => [a.id, a.full_name || a.email || 'Usuário removido']))

  const latestPurchase = (purchases ?? []).find(p => p.status === 'paid' || p.status === 'isento') ?? (purchases ?? [])[0] ?? null
  const publication = derivePublicationStatus(application)
  const review = getCreativeReviewBadge(campaign.review_status)
  const payment = getPaymentBadge(latestPurchase ? { status: latestPurchase.status as PurchaseStatus, kind: latestPurchase.kind } : null)

  const now = new Date()
  const eligibility = computeCampaignEligibility({
    reviewStatus: campaign.review_status,
    hasLiveCreative: !!campaign.live_creative_id,
    appPublished: publication.key === 'publicado',
    appSuspended: publication.key === 'suspenso',
    partnerBlocked: !!partner?.marketplace_new_apps_blocked,
    spaceActive: !!space,
    paymentStatus: (latestPurchase?.status as PurchaseStatus) ?? null,
    reservationStatus: (reservation?.status as ReservationStatus) ?? null,
    reservationCoversNow: !!reservation && reservation.status === 'confirmed' && new Date(reservation.starts_at) <= now && now < new Date(reservation.ends_at),
    pausedAt: campaign.paused_at, cancelledAt: campaign.cancelled_at, startsAt: campaign.starts_at, endsAt: campaign.ends_at, now,
  })

  return (
    <CampaignDetailClient
      user={user} profile={profile}
      campaign={{
        id: campaign.id, internalName: campaign.internal_name, startsAt: campaign.starts_at, endsAt: campaign.ends_at,
        spaceId: campaign.space_id, packageId: campaign.package_id, pausedReason: campaign.paused_reason,
        createdAt: campaign.created_at, updatedAt: campaign.updated_at,
      }}
      app={{ id: draft?.id ?? '', name: draft?.name || 'Sem nome', logoUrl: draft?.logo_url ?? null, applicationSlug: application?.slug ?? null }}
      origin={partner?.role === 'technician' ? 'lobby' : 'partner'}
      partnerName={partner ? partnerDisplayName(partner) : 'Parceiro removido'}
      publication={publication}
      review={review}
      payment={payment}
      eligibility={eligibility}
      space={space ? { id: space.id, name: space.name, slug: space.slug, description: space.description, acceptedFormats: space.accepted_formats ?? null } : null}
      pkg={pkg ? {
        id: pkg.id, name: pkg.name, price: pkg.price, currency: pkg.currency, durationDays: pkg.duration_days,
        description: pkg.description, cancellationPolicy: pkg.cancellation_policy, pausePolicy: pkg.pause_policy,
      } : null}
      spaceOptions={(spaces ?? []).map(s => ({ id: s.id, name: s.name, slug: s.slug, description: s.description, acceptedFormats: s.accepted_formats ?? null }))}
      packageOptions={(packages ?? []).map(p => ({
        id: p.id, name: p.name, spaceId: p.space_id, price: p.price, currency: p.currency, durationDays: p.duration_days,
        description: p.description, cancellationPolicy: p.cancellation_policy, pausePolicy: p.pause_policy,
      }))}
      latestReservation={reservation ? { id: reservation.id, status: reservation.status, startsAt: reservation.starts_at, endsAt: reservation.ends_at, expiresAt: reservation.expires_at } : null}
      creatives={(creatives ?? []).map(c => ({
        id: c.id, version: c.version, title: c.title, description: c.description, imageUrl: c.image_url, imageAlt: c.image_alt,
        ctaLabel: c.cta_label, ctaHref: c.cta_href, reviewStatus: c.review_status, reviewerNotes: c.reviewer_notes,
        partnerFeedback: c.partner_feedback, reviewedAt: c.reviewed_at, isLive: c.id === campaign.live_creative_id,
        reviewerName: c.reviewer_id ? (actorMap.get(c.reviewer_id) ?? null) : null, createdAt: c.created_at,
      }))}
      purchases={(purchases ?? []).map(p => ({
        id: p.id, amount: p.amount, currency: p.currency, kind: p.kind, status: p.status,
        isentoReason: p.isento_reason, refundStatus: p.refund_status, createdAt: p.created_at, paidAt: p.paid_at,
      }))}
      events={(events ?? []).map(e => ({ ...e, actorName: e.actor_id ? (actorMap.get(e.actor_id) ?? 'Usuário removido') : 'Sistema' }))}
    />
  )
}
