import { describe, it, expect } from 'vitest'
import { PAYOUT_RETENTION_DAYS, REFUND_WINDOW_DAYS, classifyPurchasePayoutStatus, RESERVE_PERCENT, DISPUTE_RESERVE_WINDOW_DAYS, calculateReserveAmountCents, calculateAppPurchasePayoutAmounts } from '@/lib/services/payouts'

describe('PAYOUT_RETENTION_DAYS', () => {
  it('é 16 dias — um dia depois do fim da janela de reembolso de 15 dias', () => {
    expect(PAYOUT_RETENTION_DAYS).toBe(16)
  })
})

describe('REFUND_WINDOW_DAYS', () => {
  it('é 15 dias', () => {
    expect(REFUND_WINDOW_DAYS).toBe(15)
  })
})

describe('classifyPurchasePayoutStatus', () => {
  it('classifica como retido dentro dos 16 dias', () => {
    const paidAt = new Date(Date.now() - 10 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false)).toBe('retido')
  })

  it('classifica como elegível a partir do dia 16', () => {
    const paidAt = new Date(Date.now() - 17 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false)).toBe('elegivel')
  })

  it('classifica como elegível exatamente no limite de 16 dias', () => {
    const paidAt = new Date(Date.now() - 16 * 86400_000 - 1000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false)).toBe('elegivel')
  })

  it('classifica como retido um pouco antes do limite de 16 dias', () => {
    const paidAt = new Date(Date.now() - (16 * 86400_000 - 1000)).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false)).toBe('retido')
  })

  it('classifica como pago quando já coberto por repasse confirmado, mesmo dentro da retenção', () => {
    const paidAt = new Date(Date.now() - 1 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, true)).toBe('pago')
  })

  it('aceita retentionDays customizado — elegível antes dos 16 dias padrão se o prazo da venda for menor', () => {
    const paidAt = new Date(Date.now() - 10 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false, 7)).toBe('elegivel')
  })

  it('aceita retentionDays customizado — ainda retido depois dos 16 dias padrão se o prazo da venda for maior', () => {
    const paidAt = new Date(Date.now() - 20 * 86400_000).toISOString()
    expect(classifyPurchasePayoutStatus(paidAt, false, 30)).toBe('retido')
  })
})

describe('calculateReserveAmountCents', () => {
  it('é 10% do valor do parceiro', () => {
    expect(RESERVE_PERCENT).toBe(10)
    expect(calculateReserveAmountCents(10000)).toBe(1000) // R$100,00 de partner_amount → R$10,00 de reserva
  })

  it('arredonda pro centavo mais próximo', () => {
    expect(calculateReserveAmountCents(9999)).toBe(1000) // 999.9 arredonda pra 1000
    expect(calculateReserveAmountCents(10001)).toBe(1000) // 1000.1 arredonda pra 1000
  })

  it('zero fica zero (app sem parceiro)', () => {
    expect(calculateReserveAmountCents(0)).toBe(0)
  })
})

describe('DISPUTE_RESERVE_WINDOW_DAYS', () => {
  it('é 120 dias', () => {
    expect(DISPUTE_RESERVE_WINDOW_DAYS).toBe(120)
  })
})

describe('calculateAppPurchasePayoutAmounts', () => {
  it('sem reembolso: mainNet é partner_amount menos a reserva, reserveNet é a reserva inteira', () => {
    const { mainNet, reserveNet } = calculateAppPurchasePayoutAmounts({
      amount: 100, partnerAmount: 80, reserveAmount: 8, refundedAmount: 0,
    })
    expect(mainNet).toBe(72)
    expect(reserveNet).toBe(8)
  })

  it('reembolso parcial: desconta cada perna de forma independente, proporcional à sua própria base', () => {
    // amount=100, partnerAmount=80 (mainBase=72, reserveAmount=8), refundedAmount=30 (30% do total)
    const { mainNet, reserveNet } = calculateAppPurchasePayoutAmounts({
      amount: 100, partnerAmount: 80, reserveAmount: 8, refundedAmount: 30,
    })
    expect(mainNet).toBe(72 - 21.6) // 30% de 72
    expect(reserveNet).toBe(8 - 2.4) // 30% de 8
  })

  it('reembolso total: as duas pernas zeram', () => {
    const { mainNet, reserveNet } = calculateAppPurchasePayoutAmounts({
      amount: 100, partnerAmount: 80, reserveAmount: 8, refundedAmount: 100,
    })
    expect(mainNet).toBe(0)
    expect(reserveNet).toBe(0)
  })

  it('sem parceiro (reserveAmount=0): mainNet é o partner_amount inteiro, reserveNet é zero', () => {
    const { mainNet, reserveNet } = calculateAppPurchasePayoutAmounts({
      amount: 100, partnerAmount: 100, reserveAmount: 0, refundedAmount: 0,
    })
    expect(mainNet).toBe(100)
    expect(reserveNet).toBe(0)
  })
})
