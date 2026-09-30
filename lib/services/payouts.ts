/**
 * Repasse manual ao parceiro. A regra de verdade (16 dias de retenção,
 * elegibilidade, soma) vive na RPC create_partner_payout — este arquivo só
 * espelha a constante pra exibição/filtro no client.
 *
 * 16 dias, não 14: a janela de reembolso de app_purchases é de 15 dias
 * (refund_app_purchase) — a retenção de repasse fica sempre 1 dia depois
 * pra garantir que as duas janelas nunca se sobrepõem (sem isso, existiria
 * um caso de "já repassado mas ainda reembolsável" que exigiria clawback).
 */
export const PAYOUT_RETENTION_DAYS = 16

export type PartnerPayoutStatus = 'confirmado' | 'revertido'

export interface PartnerPayout {
  id:             string
  partner_id:     string
  total_amount:   number
  currency:       string
  status:         PartnerPayoutStatus
  reference:      string
  notes:          string | null
  requested_by:   string | null
  created_at:     string
  reverted_at:    string | null
  reverted_by:    string | null
  revert_reason:  string | null
}

export interface PartnerPayoutItem {
  id:              string
  payout_id:       string
  app_purchase_id: string
  amount:          number
  created_at:      string
}

/** Classifica uma compra paga (com parceiro) em retido/elegível/pago,
 *  dado o conjunto de itens de repasse CONFIRMADOS que já a cobrem. */
export function classifyPurchasePayoutStatus(
  paidAt: string,
  coveredByConfirmedPayout: boolean,
): 'retido' | 'elegivel' | 'pago' {
  if (coveredByConfirmedPayout) return 'pago'
  const cutoff = new Date(paidAt).getTime() + PAYOUT_RETENTION_DAYS * 86400_000
  return Date.now() >= cutoff ? 'elegivel' : 'retido'
}
