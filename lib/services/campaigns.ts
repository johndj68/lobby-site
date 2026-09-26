/**
 * Regras de negócio de /admin/marketplace/destaques (campanhas de destaque
 * patrocinado) — elegibilidade, checkout, e busca agregada. `sponsored_campaigns`
 * continua sendo a própria campanha (seu id = campaignId); nada aqui cria um
 * conceito de "campaign" paralelo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { MARKETPLACE_COLORS, derivePublicationStatus, type PublicationStatus } from '@/lib/marketplace'
import { partnerDisplayName } from '@/lib/partners'
// Rótulos puros ficam em campaign-labels.ts (sem import de lib/stripe) —
// importados e reexportados aqui pra quem já importa deste arquivo
// continuar igual. NUNCA importar valor (não-tipo) deste módulo a partir de
// um componente client: o `stripe` acima roda `new Stripe(...)` na carga do
// módulo — use campaign-labels.ts direto nesse caso.
import { getCreativeReviewBadge, getPaymentBadge, type CampaignStatusBadge, type CreativeReviewStatus, type PurchaseStatus } from './campaign-labels'
export { getCreativeReviewBadge, getPaymentBadge, type CampaignStatusBadge, type CreativeReviewStatus, type PurchaseStatus, type PaymentBadgeKey } from './campaign-labels'

export type ReservationStatus = 'held' | 'confirmed' | 'released'

export type EligibilityKey =
  | 'em_exibicao'
  | 'programada'
  | 'pausada'
  | 'encerrada'
  | 'cancelada'
  | 'em_revisao'
  | 'aguardando_pagamento'
  | 'bloqueada_por_pendencia'
  | 'fora_do_catalogo'

export interface EligibilityResult {
  key: EligibilityKey
  label: string
  color: string
  reasons: string[]
}

export interface EligibilityInput {
  reviewStatus: CreativeReviewStatus
  hasLiveCreative: boolean
  appPublished: boolean
  appSuspended: boolean
  partnerBlocked: boolean
  spaceActive: boolean
  paymentStatus: PurchaseStatus | null
  reservationStatus: ReservationStatus | null
  reservationCoversNow: boolean
  pausedAt: string | null
  cancelledAt: string | null
  startsAt: string
  endsAt: string
  now?: Date
}

/** Deriva se a campanha participa do carrossel agora, e por quê não, quando
 *  bloqueada — nunca aceita um booleano vindo do cliente. */
export function computeCampaignEligibility(input: EligibilityInput): EligibilityResult {
  const now = input.now ?? new Date()
  const t = now.getTime()
  const start = new Date(input.startsAt).getTime()
  const end = new Date(input.endsAt).getTime()

  // Cancelada/pausada são impedimentos definitivos por si só, mas nunca são
  // a ÚNICA causa real quando o app também está suspenso/despublicado (ou
  // outro impedimento do mesmo nível já existe) — reportar só a primeira
  // sugeriria que resolver aquela sozinha bastaria (seção 6). O par
  // cancelada+app suspenso do exemplo da spec é exatamente este caso.
  if (input.cancelledAt || input.pausedAt) {
    const reasons = [input.cancelledAt ? 'Campanha cancelada.' : 'Pausada manualmente pelo time LOBBY.']
    if (!input.appPublished || input.appSuspended) reasons.push(input.appSuspended ? 'Aplicativo suspenso.' : 'Aplicativo ainda não publicado.')
    if (input.partnerBlocked) reasons.push('Parceiro responsável está com novos cadastros bloqueados.')
    if (!input.spaceActive) reasons.push('Espaço de exibição indisponível para veiculação no momento.')
    return input.cancelledAt
      ? { key: 'cancelada', label: 'Cancelada', color: MARKETPLACE_COLORS.textSecondary, reasons }
      : { key: 'pausada', label: 'Pausada', color: MARKETPLACE_COLORS.warning, reasons }
  }

  const pending: string[] = []
  if (!input.appPublished || input.appSuspended) pending.push(input.appSuspended ? 'Aplicativo suspenso.' : 'Aplicativo ainda não publicado.')
  if (input.partnerBlocked) pending.push('Parceiro responsável está com novos cadastros bloqueados.')
  if (!input.spaceActive) pending.push('Espaço de exibição indisponível para veiculação no momento.')
  if (pending.length > 0) {
    return { key: 'bloqueada_por_pendencia', label: 'Bloqueada por pendência', color: MARKETPLACE_COLORS.error, reasons: pending }
  }

  if (input.reviewStatus !== 'aprovado' || !input.hasLiveCreative) {
    return { key: 'em_revisao', label: 'Anúncio em revisão', color: MARKETPLACE_COLORS.warning, reasons: ['Nenhuma versão do anúncio foi aprovada ainda.'] }
  }

  const paid = input.paymentStatus === 'paid' || input.paymentStatus === 'isento'
  if (!paid) {
    return { key: 'aguardando_pagamento', label: 'Aguardando pagamento', color: MARKETPLACE_COLORS.warning, reasons: ['Pagamento não confirmado e sem isenção concedida.'] }
  }

  if (input.reservationStatus !== 'confirmed' || !input.reservationCoversNow) {
    return { key: 'bloqueada_por_pendencia', label: 'Bloqueada por pendência', color: MARKETPLACE_COLORS.error, reasons: ['Reserva de espaço não confirmada para o período atual.'] }
  }

  if (t < start) return { key: 'programada', label: 'Programada', color: MARKETPLACE_COLORS.primary, reasons: [] }
  if (t >= end) return { key: 'encerrada', label: 'Encerrada', color: MARKETPLACE_COLORS.textSecondary, reasons: [] }
  return { key: 'em_exibicao', label: 'Em exibição', color: MARKETPLACE_COLORS.success, reasons: [] }
}

/** Cria (ou reaproveita) a sessão de checkout Stripe pra pagamento de
 *  publicidade — espelha app/api/stripe/checkout/route.ts, mesmo provedor,
 *  mesma disciplina de nunca confiar em preço vindo do cliente. Usada tanto
 *  pela rota admin quanto pela do parceiro. */
export async function createCampaignCheckoutSession(
  admin: SupabaseClient,
  params: {
    campaignId: string
    packageId: string
    payerUserId: string
    payerEmail: string | null
    successUrl: string
    cancelUrl: string
  },
): Promise<{ url: string | null; purchaseId: string } | { error: string }> {
  const { data: pkg } = await admin
    .from('ad_packages')
    .select('id, name, description, price, currency, status, cancellation_policy, pause_policy')
    .eq('id', params.packageId)
    .eq('status', 'active')
    .single()

  if (!pkg || pkg.price == null) {
    return { error: 'Pacote não encontrado ou sem preço configurado.' }
  }

  const termsSnapshot = [
    pkg.cancellation_policy ? `Cancelamento: ${pkg.cancellation_policy}` : null,
    pkg.pause_policy ? `Pausa: ${pkg.pause_policy}` : null,
  ].filter(Boolean).join(' · ') || null

  const { data: purchase, error: insertError } = await admin
    .from('campaign_purchases')
    .insert({
      campaign_id: params.campaignId,
      package_id: pkg.id,
      payer_user_id: params.payerUserId,
      amount: pkg.price,
      currency: pkg.currency,
      kind: 'stripe',
      status: 'pending',
      accepted_terms_at: new Date().toISOString(),
      accepted_terms_version: pkg.id,
      package_terms_snapshot: termsSnapshot,
    })
    .select('id')
    .single()

  if (insertError || !purchase) {
    return { error: 'Não foi possível iniciar a cobrança agora — tente novamente.' }
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_email: params.payerEmail ?? undefined,
    client_reference_id: purchase.id,
    line_items: [{
      price_data: {
        currency: (pkg.currency ?? 'brl').toLowerCase(),
        unit_amount: Math.round(pkg.price * 100),
        product_data: {
          name: `${pkg.name} — Destaque patrocinado LOBBY`,
          description: pkg.description ?? undefined,
        },
      },
      quantity: 1,
    }],
    metadata: {
      kind: 'campaign',
      purchase_id: purchase.id,
      campaign_id: params.campaignId,
      package_id: pkg.id,
    },
  })

  await admin.from('campaign_purchases').update({ stripe_session_id: session.id }).eq('id', purchase.id)

  return { url: session.url, purchaseId: purchase.id }
}

/** Confirma a reserva de capacidade via RPC (service role) e trata o caso em
 *  que a vaga sumiu entre o hold e a confirmação — nunca finge sucesso. */
export async function confirmReservationOrFlagConflict(
  admin: SupabaseClient,
  campaignId: string,
): Promise<{ ok: true } | { ok: false; conflict: boolean; error: string }> {
  const { error } = await admin.rpc('confirm_ad_reservation', { p_campaign_id: campaignId })
  if (!error) return { ok: true }
  if (error.message?.includes('CAPACITY_LOST_ON_CONFIRM')) {
    return { ok: false, conflict: true, error: 'A vaga expirou e foi ocupada por outra campanha antes da confirmação do pagamento.' }
  }
  return { ok: false, conflict: false, error: error.message }
}

export interface CampaignRow {
  id: string
  internalName: string | null
  appName: string
  appLogoUrl: string | null
  applicationSlug: string | null
  partnerId: string
  partnerName: string
  origin: 'lobby' | 'partner'
  spaceId: string | null
  spaceName: string | null
  packageId: string | null
  packageName: string | null
  startsAt: string
  endsAt: string
  publication: PublicationStatus
  review: CampaignStatusBadge
  payment: CampaignStatusBadge
  eligibility: EligibilityResult
  createdAt: string
  updatedAt: string
}

/** Busca e junta (em memória, mesmo padrão de fetchOfferRows) todas as
 *  campanhas com os dados reais necessários pra listar/exportar. */
export async function fetchCampaignRows(supabase: SupabaseClient): Promise<{ rows: CampaignRow[]; error: boolean }> {
  const [
    { data: campaigns, error: campaignsError }, { data: drafts }, { data: spaces }, { data: packages },
    { data: reservations }, { data: purchases },
  ] = await Promise.all([
    supabase.from('sponsored_campaigns').select('id, internal_name, app_draft_id, space_id, package_id, starts_at, ends_at, is_approved, is_active, is_paid, review_status, live_creative_id, paused_at, cancelled_at, updated_at, created_at, application:applications(slug)'),
    supabase.from('app_drafts').select('id, name, logo_url, created_by, application_id, applications(is_published, suspended_at)'),
    supabase.from('ad_spaces').select('id, name, is_active'),
    supabase.from('ad_packages').select('id, name'),
    supabase.from('ad_reservations').select('campaign_id, status, expires_at, starts_at, ends_at').order('created_at', { ascending: false }),
    supabase.from('campaign_purchases').select('campaign_id, status, kind').order('created_at', { ascending: false }),
  ])

  type DraftRow = { id: string; name: string | null; logo_url: string | null; created_by: string; application_id: string | null; applications: { is_published: boolean; suspended_at: string | null } | { is_published: boolean; suspended_at: string | null }[] | null }
  const draftById = new Map((drafts ?? []).map(d => [d.id, d as unknown as DraftRow]))
  const spaceById = new Map((spaces ?? []).map(s => [s.id, s]))
  const packageById = new Map((packages ?? []).map(p => [p.id, p]))

  const latestReservationByCampaign = new Map<string, { status: ReservationStatus; expires_at: string | null; starts_at: string; ends_at: string }>()
  for (const r of reservations ?? []) {
    if (!latestReservationByCampaign.has(r.campaign_id)) latestReservationByCampaign.set(r.campaign_id, r as { status: ReservationStatus; expires_at: string | null; starts_at: string; ends_at: string })
  }
  const latestPurchaseByCampaign = new Map<string, { status: PurchaseStatus; kind: string }>()
  for (const p of purchases ?? []) {
    if (!latestPurchaseByCampaign.has(p.campaign_id)) latestPurchaseByCampaign.set(p.campaign_id, p as { status: PurchaseStatus; kind: string })
  }

  const partnerIds = [...new Set((drafts ?? []).map(d => d.created_by))]
  const { data: partners } = partnerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name, role, marketplace_new_apps_blocked').in('id', partnerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null; role: string; marketplace_new_apps_blocked: boolean }[] }
  const partnerById = new Map((partners ?? []).map(p => [p.id, p]))

  const rows: CampaignRow[] = (campaigns ?? []).map(c => {
    const draft = c.app_draft_id ? draftById.get(c.app_draft_id) : undefined
    const application = draft ? (Array.isArray(draft.applications) ? (draft.applications[0] ?? null) : draft.applications) : null
    const partner = draft ? partnerById.get(draft.created_by) : undefined
    const space = c.space_id ? spaceById.get(c.space_id) : undefined
    const pkg = c.package_id ? packageById.get(c.package_id) : undefined
    const reservation = latestReservationByCampaign.get(c.id)
    const purchase = latestPurchaseByCampaign.get(c.id)
    const publication = derivePublicationStatus(application)

    const now = new Date()
    const eligibility = computeCampaignEligibility({
      reviewStatus: c.review_status as CreativeReviewStatus,
      hasLiveCreative: !!c.live_creative_id,
      appPublished: publication.key === 'publicado',
      appSuspended: publication.key === 'suspenso',
      partnerBlocked: !!partner?.marketplace_new_apps_blocked,
      spaceActive: !!space?.is_active,
      paymentStatus: purchase?.status ?? null,
      reservationStatus: reservation?.status ?? null,
      reservationCoversNow: !!reservation && reservation.status === 'confirmed' && new Date(reservation.starts_at) <= now && now < new Date(reservation.ends_at),
      pausedAt: c.paused_at,
      cancelledAt: c.cancelled_at,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      now,
    })

    const appSlug = Array.isArray(c.application) ? c.application[0]?.slug : (c.application as { slug: string } | null)?.slug

    return {
      id: c.id,
      internalName: c.internal_name,
      appName: draft?.name || 'Sem nome',
      appLogoUrl: draft?.logo_url ?? null,
      applicationSlug: appSlug ?? null,
      partnerId: draft?.created_by ?? '',
      partnerName: partner ? partnerDisplayName(partner) : 'Parceiro removido',
      origin: partner?.role === 'technician' ? 'lobby' : 'partner',
      spaceId: c.space_id,
      spaceName: space?.name ?? null,
      packageId: c.package_id,
      packageName: pkg?.name ?? null,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      publication,
      review: getCreativeReviewBadge(c.review_status as CreativeReviewStatus),
      payment: getPaymentBadge(purchase ?? null),
      eligibility,
      createdAt: c.created_at,
      updatedAt: c.updated_at ?? c.created_at,
    }
  })

  return { rows, error: !!campaignsError }
}
