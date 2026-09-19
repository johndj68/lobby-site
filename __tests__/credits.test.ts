import { describe, it, expect } from 'vitest'
import {
  formatCredits,
  canManageCredits,
  getCreditTxStyle,
  getCreditPurchaseStyle,
} from '@/lib/credits'

describe('formatCredits', () => {
  it('singular para 1 crédito', () => {
    expect(formatCredits(1)).toBe('1 crédito')
  })

  it('plural para 0 créditos', () => {
    expect(formatCredits(0)).toBe('0 créditos')
  })

  it('plural para múltiplos créditos', () => {
    expect(formatCredits(10)).toBe('10 créditos')
  })

  it('formata números grandes com separador', () => {
    expect(formatCredits(1000)).toContain('1')
    expect(formatCredits(1000)).toContain('000')
  })
})

describe('canManageCredits', () => {
  it('retorna true para técnico líder', () => {
    expect(canManageCredits({ role: 'technician', is_leader: true })).toBe(true)
  })

  it('retorna false para técnico não-líder', () => {
    expect(canManageCredits({ role: 'technician', is_leader: false })).toBe(false)
  })

  it('retorna false para cliente', () => {
    expect(canManageCredits({ role: 'client', is_leader: false })).toBe(false)
  })

  it('retorna false para null', () => {
    expect(canManageCredits(null)).toBe(false)
  })

  it('retorna false quando is_leader ausente', () => {
    expect(canManageCredits({ role: 'technician' })).toBe(false)
  })
})

describe('getCreditTxStyle', () => {
  it('retorna estilo correto para completed', () => {
    const s = getCreditTxStyle('completed')
    expect(s.label).toBe('Concluído')
    expect(s.color).toBe('#10B981')
  })

  it('retorna estilo correto para pending', () => {
    const s = getCreditTxStyle('pending')
    expect(s.label).toBe('Pendente')
    expect(s.color).toBe('#F59E0B')
  })

  it('retorna estilo correto para failed', () => {
    const s = getCreditTxStyle('failed')
    expect(s.label).toBe('Falhou')
    expect(s.color).toBe('#EF4444')
  })

  it('retorna label e bg para todos os status', () => {
    const statuses = ['pending', 'completed', 'canceled', 'failed', 'refunded'] as const
    for (const s of statuses) {
      const style = getCreditTxStyle(s)
      expect(style.label).toBeTruthy()
      expect(style.bg).toContain('rgba')
    }
  })
})

describe('getCreditPurchaseStyle', () => {
  it('retorna estilo correto para paid', () => {
    const s = getCreditPurchaseStyle('paid')
    expect(s.label).toBe('Pago')
    expect(s.color).toBe('#10B981')
  })

  it('retorna estilo correto para canceled', () => {
    const s = getCreditPurchaseStyle('canceled')
    expect(s.label).toBe('Cancelado')
  })

  it('cobre todos os status possíveis', () => {
    const statuses = ['pending', 'paid', 'canceled', 'failed', 'refunded'] as const
    for (const s of statuses) {
      const style = getCreditPurchaseStyle(s)
      expect(style.label).toBeTruthy()
      expect(style.color).toMatch(/^#/)
    }
  })
})
