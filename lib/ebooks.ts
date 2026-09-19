import type { Resource, SaleStatus, DeliveryType, PurchaseStatus } from '@/types'

/** Só técnico líder cadastra, edita ou publica e-book pago — mesma regra
 *  já usada em /admin/equipe e /admin/financeiro (profiles.is_leader). */
export function canManagePaidEbooks(profile: { role?: string; is_leader?: boolean } | null): boolean {
  return profile?.role === 'technician' && profile?.is_leader === true
}

/** Gratuito: sempre pode baixar. Pago: só com compra confirmada
 *  (`purchasedEbookIds` vem de uma query em ebook_purchases). */
export function canDownloadEbook(resource: Resource, purchasedEbookIds: Set<string>): boolean {
  if (!resource.isPaid) return true
  return purchasedEbookIds.has(resource.id)
}

export function getEbookAccessLabel(resource: Resource): string {
  return resource.isPaid ? 'Pago' : 'Gratuito'
}

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  active:       'Ativo',
  inactive:     'Inativo',
  coming_soon:  'Em breve',
}

export const DELIVERY_TYPE_LABEL: Record<DeliveryType, string> = {
  automatic:      'Download automático após pagamento',
  manual:         'Liberação manual',
  external_link:  'Link externo',
}

// Linha de ebook_purchases com dados do e-book e do comprador anexados —
// usada só na tela de Financeiro (leader confirma pagamento manualmente).
export interface PendingEbookPurchase {
  id:          string
  ebook_id:    string
  user_id:     string
  amount:      number
  status:      PurchaseStatus
  created_at:  string
  ebook_title: string
  buyer_name?:  string | null
  buyer_email?: string | null
}

export function getPurchaseStatusStyle(status: PurchaseStatus): { label: string; color: string; bg: string } {
  const map: Record<PurchaseStatus, { label: string; color: string; bg: string }> = {
    pending:   { label: 'Pendente',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    paid:      { label: 'Pago',        color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    canceled:  { label: 'Cancelado',   color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
    refunded:  { label: 'Reembolsado', color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
    failed:    { label: 'Falhou',      color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  }
  return map[status]
}
