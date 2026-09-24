import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { getCreativeReviewBadge, getPaymentBadge, computeCampaignEligibility, type PurchaseStatus, type ReservationStatus } from '@/lib/services/campaigns'
import { derivePublicationStatus } from '@/lib/marketplace'
import DestaquesParceiroClient from './DestaquesParceiroClient'

export const metadata: Metadata = { title: 'Destaques patrocinados | LOBBY', robots: { index: false, follow: false } }

export default async function DestaquesParceiroPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  const [{ data: myApps }, { data: campaigns }, { data: spaces }, { data: packages }] = await Promise.all([
    supabase.from('app_drafts').select('id, name, logo_url, application_id').eq('created_by', user.id).not('application_id', 'is', null),
    supabase.from('sponsored_campaigns').select('*, app_drafts(id, name, logo_url, applications(is_published, suspended_at)), ad_creatives(*)').eq('created_by', user.id).order('created_at', { ascending: false }),
    supabase.from('ad_spaces').select('id, name').eq('is_active', true),
    supabase.from('ad_packages').select('*').eq('status', 'active'),
  ])

  const campaignIds = (campaigns ?? []).map(c => c.id)
  const [{ data: reservations }, { data: purchases }] = campaignIds.length
    ? await Promise.all([
        supabase.from('ad_reservations').select('*').in('campaign_id', campaignIds).order('created_at', { ascending: false }),
        supabase.from('campaign_purchases').select('*').in('campaign_id', campaignIds).order('created_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }]

  const now = new Date()
  const rows = (campaigns ?? []).map(c => {
    type DraftRef = { id: string; name: string | null; logo_url: string | null; applications: { is_published: boolean; suspended_at: string | null } | { is_published: boolean; suspended_at: string | null }[] | null }
    const draft = Array.isArray(c.app_drafts) ? c.app_drafts[0] : (c.app_drafts as DraftRef | null)
    const application = draft ? (Array.isArray(draft.applications) ? draft.applications[0] : draft.applications) : null
    const publication = derivePublicationStatus(application)
    const reservation = (reservations ?? []).find(r => r.campaign_id === c.id && r.status === 'confirmed') ?? (reservations ?? []).find(r => r.campaign_id === c.id)
    const purchase = (purchases ?? []).find(p => p.campaign_id === c.id && (p.status === 'paid' || p.status === 'isento')) ?? (purchases ?? []).find(p => p.campaign_id === c.id)

    const eligibility = computeCampaignEligibility({
      reviewStatus: c.review_status, hasLiveCreative: !!c.live_creative_id,
      appPublished: publication.key === 'publicado', appSuspended: publication.key === 'suspenso',
      partnerBlocked: !!profile?.marketplace_new_apps_blocked, spaceActive: true,
      paymentStatus: (purchase?.status as PurchaseStatus) ?? null,
      reservationStatus: (reservation?.status as ReservationStatus) ?? null,
      reservationCoversNow: !!reservation && reservation.status === 'confirmed' && new Date(reservation.starts_at) <= now && now < new Date(reservation.ends_at),
      pausedAt: c.paused_at, cancelledAt: c.cancelled_at, startsAt: c.starts_at, endsAt: c.ends_at, now,
    })

    type CreativeRow = { id: string; version: number; title: string | null; description: string | null; image_url: string | null; image_alt: string | null; cta_label: string | null; review_status: string; partner_feedback: string | null }
    const creativesArr: CreativeRow[] = (Array.isArray(c.ad_creatives) ? c.ad_creatives : []).sort((a: CreativeRow, b: CreativeRow) => b.version - a.version)

    return {
      id: c.id, internalName: c.internal_name, appName: draft?.name || 'Sem nome', appLogoUrl: draft?.logo_url ?? null,
      spaceId: c.space_id, packageId: c.package_id, startsAt: c.starts_at, endsAt: c.ends_at,
      review: getCreativeReviewBadge(c.review_status), payment: getPaymentBadge(purchase ? { status: purchase.status, kind: purchase.kind } : null),
      eligibility,
      creatives: creativesArr.map(cr => ({
        id: cr.id, version: cr.version, title: cr.title, description: cr.description, imageUrl: cr.image_url, imageAlt: cr.image_alt,
        ctaLabel: cr.cta_label, reviewStatus: cr.review_status, partnerFeedback: cr.partner_feedback, isLive: cr.id === c.live_creative_id,
      })),
    }
  })

  return (
    <DestaquesParceiroClient
      apps={(myApps ?? []).map(a => ({ id: a.id, name: a.name || 'Sem nome', logoUrl: a.logo_url }))}
      campaigns={rows}
      spaces={spaces ?? []}
      packages={(packages ?? []).map(p => ({ id: p.id, spaceId: p.space_id, name: p.name, description: p.description, durationDays: p.duration_days, price: p.price, currency: p.currency, cancellationPolicy: p.cancellation_policy, pausePolicy: p.pause_policy }))}
    />
  )
}
