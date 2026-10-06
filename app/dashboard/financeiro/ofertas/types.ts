export interface PlanOption {
  id: string
  appDraftId: string
  applicationId: string | null
  categoryId: string | null
  appName: string
  planName: string
  price: number | null
  currency: string
  billingPeriod: 'one-time' | 'monthly' | 'yearly' | 'lifetime' | null
  planStatus: string
}

export interface PromotionRow {
  id: string
  planId: string
  name: string | null
  appName: string
  planName: string
  currency: string
  billingPeriod: 'one-time' | 'monthly' | 'yearly' | 'lifetime' | null
  promoPrice: number
  originalPrice: number | null
  discountPercentage: number | null
  discountDurationType: 'primeira_cobranca' | 'ciclos_fixos' | null
  discountCycles: number | null
  startsAt: string
  endsAt: string
  isApproved: boolean
  isActive: boolean
  cancelledAt: string | null
  pausedAt: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
  previousVersionId: string | null
  supersededAt: string | null
  /** Preço ATUAL do plano (live) — comparar com originalPrice pra detectar
   *  drift. Nunca usado pra recalcular desconto, só pra avisar na UI. */
  planCurrentPrice: number | null
  planStatus: string
}
