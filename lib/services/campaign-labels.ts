/**
 * Rótulos/estados puros de campanha (sem nenhuma dependência de servidor) —
 * separados de lib/services/campaigns.ts de propósito. Aquele arquivo importa
 * lib/stripe.ts no topo (`new Stripe(...)` roda na carga do módulo, sem
 * verificação de ambiente); qualquer import de valor (não-tipo) dele por um
 * componente client puxa o Stripe inteiro pro bundle do navegador e derruba
 * a página se STRIPE_SECRET_KEY não estiver setada — foi exatamente o que
 * aconteceu ao importar getCreativeReviewBadge direto de campaigns.ts numa
 * tela client-side. Este arquivo é seguro de importar de qualquer lugar.
 */

import { MARKETPLACE_COLORS } from '@/lib/marketplace'

export type CreativeReviewStatus = 'rascunho' | 'em_revisao' | 'ajustes_solicitados' | 'aprovado' | 'rejeitado'
export type PurchaseStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'isento'

export interface CampaignStatusBadge {
  key: string
  label: string
  color: string
}

const REVIEW_LABEL: Record<CreativeReviewStatus, CampaignStatusBadge> = {
  rascunho: { key: 'rascunho', label: 'Rascunho', color: MARKETPLACE_COLORS.textSecondary },
  em_revisao: { key: 'em_revisao', label: 'Em revisão', color: MARKETPLACE_COLORS.warning },
  ajustes_solicitados: { key: 'ajustes_solicitados', label: 'Ajustes solicitados', color: MARKETPLACE_COLORS.warning },
  aprovado: { key: 'aprovado', label: 'Aprovado', color: MARKETPLACE_COLORS.success },
  rejeitado: { key: 'rejeitado', label: 'Rejeitado', color: MARKETPLACE_COLORS.error },
}

export function getCreativeReviewBadge(status: CreativeReviewStatus): CampaignStatusBadge {
  return REVIEW_LABEL[status] ?? REVIEW_LABEL.rascunho
}

export type PaymentBadgeKey = 'pendente' | 'pago' | 'isento' | 'falhou' | 'reembolsado' | 'sem_pagamento'

export function getPaymentBadge(purchase: { status: PurchaseStatus; kind: string } | null): CampaignStatusBadge {
  if (!purchase) return { key: 'sem_pagamento', label: 'Sem cobrança', color: MARKETPLACE_COLORS.textSecondary }
  switch (purchase.status) {
    case 'paid': return { key: 'pago', label: 'Pago', color: MARKETPLACE_COLORS.success }
    case 'isento': return { key: 'isento', label: 'Isento', color: MARKETPLACE_COLORS.primary }
    case 'failed': return { key: 'falhou', label: 'Falhou', color: MARKETPLACE_COLORS.error }
    case 'refunded': return { key: 'reembolsado', label: 'Reembolsado', color: MARKETPLACE_COLORS.textSecondary }
    default: return { key: 'pendente', label: 'Aguardando pagamento', color: MARKETPLACE_COLORS.warning }
  }
}
