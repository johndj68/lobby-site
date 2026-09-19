import type { CreditTxType, CreditTxStatus, CreditPurchaseStatus } from '@/types'

export function formatCredits(amount: number): string {
  return `${amount.toLocaleString('pt-BR')} crédito${amount === 1 ? '' : 's'}`
}

/** Só técnico líder gerencia pacotes/carteiras/ajustes — mesmo campo
 *  (profiles.is_leader) já usado em /admin/equipe, /admin/financeiro e
 *  nos e-books/projetos pagos. */
export function canManageCredits(profile: { role?: string; is_leader?: boolean } | null): boolean {
  return profile?.role === 'technician' && profile?.is_leader === true
}

export const CREDIT_TX_TYPE_LABEL: Record<CreditTxType, string> = {
  purchase:          'Compra de créditos',
  ebook_purchase:    'Uso em e-book',
  project_payment:   'Uso em projeto',
  technical_visit:   'Uso em visita técnica',
  manual_adjustment: 'Ajuste manual',
  refund:            'Estorno',
  bonus:             'Bônus',
  expiration:        'Expiração',
}

export function getCreditTxStyle(status: CreditTxStatus): { label: string; color: string; bg: string } {
  const map: Record<CreditTxStatus, { label: string; color: string; bg: string }> = {
    pending:   { label: 'Pendente',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    completed: { label: 'Concluído',  color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    canceled:  { label: 'Cancelado',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
    failed:    { label: 'Falhou',     color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
    refunded:  { label: 'Estornado',  color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  }
  return map[status]
}

export function getCreditPurchaseStyle(status: CreditPurchaseStatus): { label: string; color: string; bg: string } {
  const map: Record<CreditPurchaseStatus, { label: string; color: string; bg: string }> = {
    pending:  { label: 'Pendente',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    paid:     { label: 'Pago',       color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    canceled: { label: 'Cancelado',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
    failed:   { label: 'Falhou',     color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
    refunded: { label: 'Estornado',  color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  }
  return map[status]
}
