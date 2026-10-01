import { describe, it, expect } from 'vitest'
import { PAYOUT_RETENTION_DAYS, classifyPurchasePayoutStatus, RESERVE_PERCENT, DISPUTE_RESERVE_WINDOW_DAYS, calculateReserveAmountCents } from '@/lib/services/payouts'

describe('PAYOUT_RETENTION_DAYS', () => {
  it('é 16 dias — um dia depois do fim da janela de reembolso de 15 dias', () => {
    expect(PAYOUT_RETENTION_DAYS).toBe(16)
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
