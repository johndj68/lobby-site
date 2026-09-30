import { describe, it, expect } from 'vitest'
import { PAYOUT_RETENTION_DAYS, classifyPurchasePayoutStatus } from '@/lib/services/payouts'

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
