/**
 * Regras de negócio de /admin/marketplace/ofertas — disponibilidade,
 * estado de promoção, sobreposição e formatação de preço. Um "plano"
 * (app_plans) já É a oferta comercial vendável — nada aqui cria um
 * conceito de "offer" paralelo.
 *
 * Não existe checkout/pedido/assinatura para aplicativos neste projeto
 * (só para pacotes de créditos internos e ebooks) — por isso
 * "disponibilidade" aqui mede prontidão do catálogo (app publicado, oferta
 * aprovada, ativação configurada, estoque de código quando aplicável),
 * nunca uma integração de pagamento real, que ainda não existe.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { MARKETPLACE_COLORS, derivePublicationStatus, deriveReviewStatus, type PublicationStatus, type ReviewStatus, type SubmissionStatus } from '@/lib/marketplace'
import { partnerDisplayName } from '@/lib/partners'

export type PlanStatus = 'draft' | 'active' | 'paused' | 'archived'

export type AvailabilityKey =
  | 'disponivel'
  | 'pausada'
  | 'arquivada'
  | 'sem_estoque'
  | 'nao_publicado'
  | 'bloqueada_por_pendencia'

export interface AvailabilityResult {
  key: AvailabilityKey
  label: string
  color: string
  /** Motivos — vazio só quando key === 'disponivel'. */
  reasons: string[]
}

export interface AvailabilityInput {
  planStatus: PlanStatus
  billingPeriod: string | null
  appPublished: boolean
  appSuspended: boolean
  latestSubmissionApproved: boolean
  hasOpenBlockers: boolean
  activationConfigured: boolean
  partnerBlocked: boolean
  requiresStock: boolean
  availableCodes: number
}

/** Deriva a disponibilidade real de uma oferta — nunca aceita um booleano
 *  vindo do cliente, sempre recalculada a partir dos fatores reais. */
export function computeOfferAvailability(input: AvailabilityInput): AvailabilityResult {
  if (input.planStatus === 'archived') {
    return { key: 'arquivada', label: 'Arquivada', color: MARKETPLACE_COLORS.textSecondary, reasons: ['Oferta arquivada — fora de comercialização.'] }
  }
  if (input.planStatus === 'paused') {
    return { key: 'pausada', label: 'Pausada', color: MARKETPLACE_COLORS.warning, reasons: ['Pausada manualmente pelo time LOBBY.'] }
  }
  if (!input.appPublished || input.appSuspended) {
    return {
      key: 'nao_publicado',
      label: input.appSuspended ? 'Aplicativo suspenso' : 'Fora do catálogo',
      color: MARKETPLACE_COLORS.textSecondary,
      reasons: [input.appSuspended ? 'Aplicativo suspenso — nenhuma oferta dele fica disponível.' : 'Aplicativo ainda não foi publicado.'],
    }
  }

  const pending: string[] = []
  if (!input.latestSubmissionApproved) pending.push('Revisão do aplicativo ainda não aprovada.')
  if (input.hasOpenBlockers) pending.push('Existem bloqueios de revisão em aberto.')
  if (!input.billingPeriod) pending.push('Oferta sem modalidade de cobrança definida.')
  if (!input.activationConfigured) pending.push('Entrega/ativação não configurada para este aplicativo.')
  if (input.partnerBlocked) pending.push('Parceiro responsável está com novos cadastros bloqueados.')
  if (pending.length > 0) {
    return { key: 'bloqueada_por_pendencia', label: 'Bloqueada por pendência', color: MARKETPLACE_COLORS.error, reasons: pending }
  }

  if (input.requiresStock && input.availableCodes <= 0) {
    return { key: 'sem_estoque', label: 'Sem estoque', color: MARKETPLACE_COLORS.error, reasons: ['Nenhum código de ativação disponível no momento.'] }
  }

  return { key: 'disponivel', label: 'Disponível', color: MARKETPLACE_COLORS.success, reasons: [] }
}

export type PromotionStatusKey = 'rascunho' | 'programada' | 'ativa' | 'pausada' | 'encerrada' | 'cancelada'

export interface PromotionStatus {
  key: PromotionStatusKey
  label: string
  color: string
}

export interface PromotionStatusInput {
  is_approved: boolean
  is_active: boolean
  starts_at: string
  ends_at: string
  cancelled_at: string | null
  paused_at: string | null
}

/** Vigência calculada pelo horário do servidor — início inclusivo, término
 *  exclusivo. Cancelamento/pausa têm prioridade sobre a janela de datas. */
export function getPromotionStatus(p: PromotionStatusInput, now: Date = new Date()): PromotionStatus {
  if (p.cancelled_at) return { key: 'cancelada', label: 'Cancelada', color: MARKETPLACE_COLORS.textSecondary }
  if (p.paused_at) return { key: 'pausada', label: 'Pausada', color: MARKETPLACE_COLORS.warning }
  if (!p.is_approved) return { key: 'rascunho', label: 'Rascunho', color: MARKETPLACE_COLORS.textSecondary }

  const t = now.getTime()
  const start = new Date(p.starts_at).getTime()
  const end = new Date(p.ends_at).getTime()
  if (t < start) return { key: 'programada', label: 'Programada', color: MARKETPLACE_COLORS.primary }
  if (t >= end) return { key: 'encerrada', label: 'Encerrada', color: MARKETPLACE_COLORS.textSecondary }
  if (!p.is_active) return { key: 'pausada', label: 'Pausada', color: MARKETPLACE_COLORS.warning }
  return { key: 'ativa', label: 'Ativa', color: MARKETPLACE_COLORS.success }
}

/** Bloqueia sobreposição de promoções na MESMA oferta (mesmo plan_id, ou
 *  mesma applications quando a promoção é do app inteiro / plan_id nulo).
 *  Intervalo [starts_at, ends_at) — mesma regra de início inclusivo/fim
 *  exclusivo usada em getPromotionStatus. */
export async function checkPromotionOverlap(
  supabase: SupabaseClient,
  params: { applicationId: string; planId: string | null; startsAt: string; endsAt: string; excludePromotionId?: string },
): Promise<{ conflict: true; withPromotionId: string } | { conflict: false }> {
  let query = supabase
    .from('promotions')
    .select('id')
    .eq('application_id', params.applicationId)
    .is('cancelled_at', null)
    .lt('starts_at', params.endsAt)
    .gt('ends_at', params.startsAt)

  query = params.planId ? query.eq('plan_id', params.planId) : query.is('plan_id', null)
  if (params.excludePromotionId) query = query.neq('id', params.excludePromotionId)

  const { data } = await query.limit(1)
  if (data && data.length > 0) return { conflict: true, withPromotionId: data[0].id }
  return { conflict: false }
}

const BILLING_LABEL: Record<string, string> = {
  'one-time': 'pagamento único',
  monthly: '/mês',
  yearly: '/ano',
  lifetime: 'pagamento único (acesso vitalício)',
}

/** "R$ 149,00 — pagamento único" / "R$ 79,00/mês" — nunca chama one-time de
 *  vitalício; billing_period já distingue os dois na origem (app_plans). */
export function formatOfferPrice(price: number | null, currency: string, billingPeriod: string | null): string {
  if (price == null || !billingPeriod) return 'Preço pendente'
  const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(price)
  const suffix = BILLING_LABEL[billingPeriod]
  if (!suffix) return amount
  return suffix.startsWith('/') ? `${amount}${suffix}` : `${amount} — ${suffix}`
}

/** Desconto sempre calculado a partir de um preço de referência real
 *  (a versão regular aplicável) — nunca inventado para parecer maior. */
export function computeDiscountPercent(promoPrice: number, originalPrice: number | null, storedPercent: number | null): number | null {
  if (originalPrice != null && originalPrice > 0) return Math.round((1 - promoPrice / originalPrice) * 100)
  return storedPercent ?? null
}

/** Arredondamento monetário consistente em centavos — evita o clássico
 *  erro de ponto flutuante ao calcular preço promocional a partir de
 *  percentual (seção 11: "sem cálculos monetários imprecisos"). */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/** Calcula o preço promocional final a partir de um percentual de desconto
 *  sobre o preço regular atual da oferta — nunca inventa um "preço
 *  anterior" fictício para parecer um desconto maior. */
export function computePromoPriceFromPercent(regularPrice: number, discountPercent: number): number {
  const regularCents = Math.round(regularPrice * 100)
  const promoCents = Math.round((regularCents * (100 - discountPercent)) / 100)
  return promoCents / 100
}

/** Neutraliza injeção de fórmula em CSV (=, +, -, @, tab, CR na primeira
 *  posição) — exigido antes de qualquer exportação (seção 20). */
export function csvSafe(value: string | number | null | undefined): string {
  const s = String(value ?? '')
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${guarded.replace(/"/g, '""')}"`
}

export interface OfferPromotion {
  id: string
  status: PromotionStatus
  promoPrice: number
  originalPrice: number | null
  discountPercent: number | null
  startsAt: string
  endsAt: string
}

export interface OfferRow {
  id: string // app_plans.id — planId = offerId
  appDraftId: string
  applicationId: string | null
  appName: string
  appLogoUrl: string | null
  applicationSlug: string | null
  partnerId: string
  partnerName: string
  origin: 'lobby' | 'partner'
  planName: string
  currency: string
  price: number | null
  billingPeriod: string | null
  status: PlanStatus
  /** Estado de REVISÃO (rascunho/aguardando análise/aprovado/…) — dimensão
   *  independente de disponibilidade e de publicação (seção 6/7). */
  review: ReviewStatus
  /** Estado de PUBLICAÇÃO do aplicativo — idem, dimensão própria. */
  publication: PublicationStatus
  availability: AvailabilityResult
  promotion: OfferPromotion | null
  createdAt: string
  updatedAt: string
}

/** Busca e junta (em memória, mesmo padrão de /admin/marketplace/parceiros)
 *  todas as ofertas do catálogo com os dados reais necessários pra
 *  disponibilidade, preço e promoção — usada pela listagem e pela
 *  exportação, pra nunca divergir entre as duas. `error` reflete só a
 *  consulta principal (app_plans), mesmo critério de loadError já usado em
 *  parceiros/page.tsx e aplicativos/page.tsx (checar `error` da query
 *  principal, nunca um `let` reatribuído depois do await). */
export async function fetchOfferRows(supabase: SupabaseClient): Promise<{ rows: OfferRow[]; error: boolean }> {
  const [
    { data: plans, error: plansError }, { data: drafts }, { data: submissions }, { data: issues },
    { data: activationConfigs }, { data: codes }, { data: promotions },
  ] = await Promise.all([
    supabase.from('app_plans').select('id, app_draft_id, name, currency, price, billing_period, features, activation_method, status, created_at, updated_at'),
    supabase.from('app_drafts').select('id, name, logo_url, created_by, application_id, applications(id, slug, is_published, suspended_at)'),
    supabase.from('app_submissions').select('id, app_draft_id, status, submitted_at, published_at').order('submitted_at', { ascending: false }),
    supabase.from('review_issues').select('submission_id, severity, resolved_at').eq('severity', 'blocker').is('resolved_at', null),
    supabase.from('app_activation_config').select('app_draft_id'),
    supabase.from('app_activation_codes').select('plan_id, status'),
    supabase.from('promotions').select('id, plan_id, promo_price, original_price, discount_percentage, starts_at, ends_at, is_approved, is_active, cancelled_at, paused_at'),
  ])

  type DraftRow = { id: string; name: string | null; logo_url: string | null; created_by: string; application_id: string | null; applications: { id: string; slug: string; is_published: boolean; suspended_at: string | null } | { id: string; slug: string; is_published: boolean; suspended_at: string | null }[] | null }
  const draftById = new Map((drafts ?? []).map(d => [d.id, d as unknown as DraftRow]))

  const submissionsByDraft = new Map<string, { id: string; status: SubmissionStatus; published_at: string | null }[]>()
  for (const s of (submissions ?? []) as { app_draft_id: string; id: string; status: SubmissionStatus; published_at: string | null }[]) {
    const arr = submissionsByDraft.get(s.app_draft_id) ?? []
    arr.push(s)
    submissionsByDraft.set(s.app_draft_id, arr)
  }
  const blockedSubmissionIds = new Set((issues ?? []).map(i => i.submission_id))
  const activationConfiguredDrafts = new Set((activationConfigs ?? []).map(c => c.app_draft_id))

  const codesByPlan = new Map<string, { total: number; available: number }>()
  for (const c of (codes ?? []) as { plan_id: string; status: string }[]) {
    const entry = codesByPlan.get(c.plan_id) ?? { total: 0, available: 0 }
    entry.total++
    if (c.status === 'available') entry.available++
    codesByPlan.set(c.plan_id, entry)
  }

  type PromotionRow = { id: string; plan_id: string | null; promo_price: number; original_price: number | null; discount_percentage: number | null; starts_at: string; ends_at: string; is_approved: boolean; is_active: boolean; cancelled_at: string | null; paused_at: string | null }
  const promotionsByPlan = new Map<string, PromotionRow>()
  for (const p of (promotions ?? []) as PromotionRow[]) {
    if (!p.plan_id) continue
    const existing = promotionsByPlan.get(p.plan_id)
    // uma oferta pode ter várias promoções no histórico — mantém a mais
    // relevante pra exibir na listagem: ativa/programada antes de encerrada
    if (!existing || getPromotionStatus(p).key !== 'encerrada') promotionsByPlan.set(p.plan_id, p)
  }

  const partnerIds = [...new Set((drafts ?? []).map(d => d.created_by))]
  const { data: partners } = partnerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name, role, marketplace_new_apps_blocked').in('id', partnerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null; role: string; marketplace_new_apps_blocked: boolean }[] }
  const partnerById = new Map((partners ?? []).map(p => [p.id, p]))

  const rows: OfferRow[] = (plans ?? []).map(plan => {
    const draft = draftById.get(plan.app_draft_id)
    const application = draft ? (Array.isArray(draft.applications) ? (draft.applications[0] ?? null) : draft.applications) : null
    const partner = draft ? partnerById.get(draft.created_by) : undefined
    const subs = draft ? (submissionsByDraft.get(draft.id) ?? []) : []
    const latestSubmission = subs[0] ?? null
    const publishedSubmission = subs.find(s => s.published_at) ?? null

    const publication = derivePublicationStatus(application)
    const review = deriveReviewStatus(latestSubmission, publication.key === 'publicado', publishedSubmission?.id ?? null)
    const hasOpenBlockers = !!latestSubmission && blockedSubmissionIds.has(latestSubmission.id)

    const codeStats = codesByPlan.get(plan.id)
    const requiresStock = plan.activation_method === 'manual' && !!codeStats // só exige estoque quando o parceiro de fato importou um lote de códigos

    const availability = computeOfferAvailability({
      planStatus: plan.status as PlanStatus,
      billingPeriod: plan.billing_period,
      appPublished: publication.key === 'publicado',
      appSuspended: publication.key === 'suspenso',
      latestSubmissionApproved: review.key === 'aprovado' || review.key === 'nova_versao_em_analise',
      hasOpenBlockers,
      activationConfigured: draft ? activationConfiguredDrafts.has(draft.id) : false,
      partnerBlocked: !!partner?.marketplace_new_apps_blocked,
      requiresStock,
      availableCodes: codeStats?.available ?? 0,
    })

    const promo = promotionsByPlan.get(plan.id)
    const promotion: OfferPromotion | null = promo ? {
      id: promo.id,
      status: getPromotionStatus(promo),
      promoPrice: promo.promo_price,
      originalPrice: promo.original_price,
      discountPercent: computeDiscountPercent(promo.promo_price, promo.original_price, promo.discount_percentage),
      startsAt: promo.starts_at,
      endsAt: promo.ends_at,
    } : null

    return {
      id: plan.id,
      appDraftId: plan.app_draft_id,
      applicationId: draft?.application_id ?? null,
      appName: draft?.name || 'Sem nome',
      appLogoUrl: draft?.logo_url ?? null,
      applicationSlug: application?.slug ?? null,
      partnerId: draft?.created_by ?? '',
      partnerName: partner ? partnerDisplayName(partner) : 'Parceiro removido',
      origin: partner?.role === 'technician' ? 'lobby' : 'partner',
      planName: plan.name,
      currency: plan.currency || 'BRL',
      price: plan.price,
      billingPeriod: plan.billing_period,
      status: plan.status as PlanStatus,
      review,
      publication,
      availability,
      promotion,
      createdAt: plan.created_at,
      updatedAt: plan.updated_at ?? plan.created_at,
    }
  })

  return { rows, error: !!plansError }
}
