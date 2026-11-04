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

/**
 * Janela pra pedir reembolso voluntário de app_purchases — RPC
 * refund_app_purchase. Sempre fecha antes de PAYOUT_RETENTION_DAYS
 * (16 dias) ficar elegível, por desenho (spec: 2026-09-30-app-purchase-
 * refund-design.md) — garante que nunca existe venda simultaneamente
 * reembolsável e elegível pra repasse.
 */
export const REFUND_WINDOW_DAYS = 15

/**
 * Reserva de disputa do parceiro: 10% do partner_amount fica retido até
 * 120 dias sem disputa (janela de chargeback das bandeiras é bem maior
 * que os 16 dias de retenção da fatia principal). Snapshot no checkout,
 * nunca recalculado depois — mesmo princípio de PAYOUT_RETENTION_DAYS.
 */
export const RESERVE_PERCENT = 10
export const DISPUTE_RESERVE_WINDOW_DAYS = 120

/** Calcula a reserva em centavos — arredonda pro centavo mais próximo,
 *  nunca trunca (mesmo padrão de arredondamento já usado em todo o
 *  resto do fluxo financeiro). */
export function calculateReserveAmountCents(partnerAmountCents: number): number {
  return Math.round(partnerAmountCents * RESERVE_PERCENT / 100)
}

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

export interface AppPurchasePayoutInputs {
  amount:          number
  partnerAmount:   number
  reserveAmount:   number
  refundedAmount:  number
}

export interface AppPurchasePayoutAmounts {
  /** Valor líquido da fatia principal (partner_amount - reserve_amount),
   *  já descontado o reembolso parcial proporcional dessa fatia. */
  mainNet:    number
  /** Valor líquido da reserva, já descontado o reembolso parcial
   *  proporcional dessa fatia — independente do desconto da fatia
   *  principal, nunca derivado de um desconto único repartido (as duas
   *  pernas podem ser pagas em momentos bem diferentes: dia 16 vs dia
   *  120). */
  reserveNet: number
}

/**
 * Única fonte de verdade (lado TS) pra quanto, de uma venda de app com
 * parceiro, ainda é devido em cada perna (principal/reserva) — mesma
 * fórmula usada pela RPC create_partner_payout. Centraliza aqui porque
 * essa conta já divergiu entre telas duas vezes em planos consecutivos
 * (Etapa 5, peças 6 e 7: /admin/marketplace/repasses e
 * /admin/financeiro/contas cada uma reimplementando por conta própria).
 * Qualquer tela que precise mostrar "quanto o parceiro ainda vai receber
 * desta venda" antes do líder confirmar o repasse deve chamar esta função,
 * nunca recalcular por conta própria.
 */
export function calculateAppPurchasePayoutAmounts({
  amount, partnerAmount, reserveAmount, refundedAmount,
}: AppPurchasePayoutInputs): AppPurchasePayoutAmounts {
  const mainBase = partnerAmount - reserveAmount
  const mainRefundedShare = Math.round(refundedAmount * mainBase / amount * 100) / 100
  const mainNet = mainBase - mainRefundedShare

  const reserveRefundedShare = Math.round(refundedAmount * reserveAmount / amount * 100) / 100
  const reserveNet = reserveAmount - reserveRefundedShare

  return { mainNet, reserveNet }
}

/** Classifica uma compra paga (com parceiro) em retido/elegível/pago,
 *  dado o conjunto de itens de repasse CONFIRMADOS que já a cobrem. */
export function classifyPurchasePayoutStatus(
  paidAt: string,
  coveredByConfirmedPayout: boolean,
  retentionDays: number = PAYOUT_RETENTION_DAYS,
): 'retido' | 'elegivel' | 'pago' {
  if (coveredByConfirmedPayout) return 'pago'
  const cutoff = new Date(paidAt).getTime() + retentionDays * 86400_000
  return Date.now() >= cutoff ? 'elegivel' : 'retido'
}
