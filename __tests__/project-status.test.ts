import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getDeadlineBadge,
  isDeadlineOverdue,
  getDeadlineOverdueDays,
  getVisualStatusStyles,
  getModuleStatusStyle,
  normalizeSecurityItems,
  getProgressStatusWarning,
  STATUS_CFG,
  PHASE_STATUS_STYLE,
} from '@/lib/project-status'

const NOW = new Date('2026-07-20T12:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

// ── getDeadlineBadge ──────────────────────────────────────────────────────────

describe('getDeadlineBadge', () => {
  it('retorna "Sem prazo definido" para undefined', () => {
    const b = getDeadlineBadge(undefined)
    expect(b.label).toBe('Sem prazo definido')
    expect(b.color).toBe('#64748B')
  })

  it('retorna "Atrasado" para prazo no passado', () => {
    const b = getDeadlineBadge('2026-07-01')
    expect(b.label).toBe('Atrasado')
    expect(b.color).toBe('#EF4444')
  })

  it('retorna "No prazo" para prazo futuro', () => {
    const b = getDeadlineBadge('2026-08-01')
    expect(b.label).toBe('No prazo')
    expect(b.color).toBe('#10B981')
  })
})

// ── isDeadlineOverdue ─────────────────────────────────────────────────────────

describe('isDeadlineOverdue', () => {
  it('retorna false para undefined', () => {
    expect(isDeadlineOverdue(undefined)).toBe(false)
  })

  it('retorna true para prazo passado', () => {
    expect(isDeadlineOverdue('2026-07-01')).toBe(true)
  })

  it('retorna false para prazo futuro', () => {
    expect(isDeadlineOverdue('2026-08-01')).toBe(false)
  })
})

// ── getDeadlineOverdueDays ────────────────────────────────────────────────────

describe('getDeadlineOverdueDays', () => {
  it('retorna 0 para undefined', () => {
    expect(getDeadlineOverdueDays(undefined)).toBe(0)
  })

  it('retorna 0 para prazo futuro (não atrasado)', () => {
    expect(getDeadlineOverdueDays('2026-08-01')).toBe(0)
  })

  it('retorna dias de atraso para prazo passado', () => {
    // 2026-07-20 - 2026-07-15 = 5 dias de atraso
    const days = getDeadlineOverdueDays('2026-07-15')
    expect(days).toBeGreaterThanOrEqual(5)
  })
})

// ── getVisualStatusStyles ─────────────────────────────────────────────────────

describe('getVisualStatusStyles', () => {
  it('retorna estilo correto para aprovado', () => {
    const s = getVisualStatusStyles('aprovado')
    expect(s.label).toBe('Aprovado')
    expect(s.color).toBe('#10B981')
  })

  it('retorna estilo de fallback para status desconhecido', () => {
    const s = getVisualStatusStyles('status_inexistente')
    expect(s.label).toBeDefined()
    expect(s.color).toBeDefined()
  })

  it('retorna estilo para aguardando_aprovacao', () => {
    const s = getVisualStatusStyles('aguardando_aprovacao')
    expect(s.label).toBe('Aguardando aprovação')
    expect(s.color).toBe('#F59E0B')
  })
})

// ── STATUS_CFG ────────────────────────────────────────────────────────────────

describe('STATUS_CFG', () => {
  const expectedStatuses = [
    'solicitado', 'em_analise', 'em_desenvolvimento',
    'em_validacao', 'concluido', 'pausado',
  ]

  it.each(expectedStatuses)('possui config para status "%s"', (status) => {
    expect(STATUS_CFG[status]).toBeDefined()
    expect(STATUS_CFG[status].label).toBeTruthy()
    expect(STATUS_CFG[status].color).toMatch(/^#/)
    expect(STATUS_CFG[status].icon).toBeDefined()
  })
})

// ── PHASE_STATUS_STYLE ────────────────────────────────────────────────────────

describe('PHASE_STATUS_STYLE', () => {
  const expectedPhases = ['concluido', 'atual', 'proximo', 'aguardando_cliente', 'bloqueado']

  it.each(expectedPhases)('possui estilo para fase "%s"', (phase) => {
    expect(PHASE_STATUS_STYLE[phase]).toBeDefined()
    expect(PHASE_STATUS_STYLE[phase].label).toBeTruthy()
    expect(PHASE_STATUS_STYLE[phase].color).toMatch(/^#/)
  })
})

// ── getModuleStatusStyle ──────────────────────────────────────────────────────

describe('getModuleStatusStyle', () => {
  const knownStatuses = [
    'nao_iniciado', 'em_andamento', 'aguardando_validacao',
    'concluido', 'aguardando_cliente', 'bloqueado',
  ]

  it.each(knownStatuses)('retorna estilo para "%s"', (status) => {
    const s = getModuleStatusStyle(status)
    expect(s.label).toBeTruthy()
    expect(s.color).toMatch(/^#/)
    expect(s.bg).toContain('rgba')
    expect(s.border).toContain('rgba')
  })

  it('fallback para status desconhecido retorna nao_iniciado', () => {
    const s = getModuleStatusStyle('status_qualquer')
    expect(s).toEqual(getModuleStatusStyle('nao_iniciado'))
  })

  it('concluido tem cor verde', () => {
    expect(getModuleStatusStyle('concluido').color).toBe('#10B981')
  })

  it('bloqueado tem cor vermelha', () => {
    expect(getModuleStatusStyle('bloqueado').color).toBe('#EF4444')
  })
})

// ── normalizeSecurityItems ────────────────────────────────────────────────────

describe('normalizeSecurityItems', () => {
  it('retorna array vazio para undefined', () => {
    expect(normalizeSecurityItems(undefined)).toEqual([])
  })

  it('retorna array vazio para array vazio', () => {
    expect(normalizeSecurityItems([])).toEqual([])
  })

  it('converte strings em objetos SecurityChecklistItem', () => {
    const result = normalizeSecurityItems(['Item A', 'Item B'])
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('Item A')
    expect(result[0].checked).toBe(true)
    expect(result[0].visibleToClient).toBe(true)
    expect(result[0].id).toBe('sec-0')
  })

  it('preserva objetos já normalizados', () => {
    const item = { id: 'x', label: 'Test', checked: false, visibleToClient: false }
    const result = normalizeSecurityItems([item])
    expect(result[0]).toEqual(item)
  })

  it('trata array misto de strings e objetos', () => {
    const item = { id: 'obj-1', label: 'Objeto', checked: true, visibleToClient: true }
    const result = normalizeSecurityItems(['String item', item])
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('String item')
    expect(result[1]).toEqual(item)
  })
})

// ── getProgressStatusWarning ──────────────────────────────────────────────────

describe('getProgressStatusWarning', () => {
  it('retorna aviso quando em_desenvolvimento com progresso < 20', () => {
    const w = getProgressStatusWarning('em_desenvolvimento', 5)
    expect(w).not.toBeNull()
    expect(w).toContain('progresso')
  })

  it('retorna null quando em_desenvolvimento com progresso >= 20', () => {
    expect(getProgressStatusWarning('em_desenvolvimento', 20)).toBeNull()
    expect(getProgressStatusWarning('em_desenvolvimento', 80)).toBeNull()
  })

  it('retorna aviso quando concluido com progresso < 100', () => {
    const w = getProgressStatusWarning('concluido', 90)
    expect(w).not.toBeNull()
    expect(w).toContain('100')
  })

  it('retorna null quando concluido com progresso = 100', () => {
    expect(getProgressStatusWarning('concluido', 100)).toBeNull()
  })

  it('retorna aviso quando solicitado com progresso > 10', () => {
    const w = getProgressStatusWarning('solicitado', 50)
    expect(w).not.toBeNull()
    expect(w).toContain('status')
  })

  it('retorna null quando solicitado com progresso <= 10', () => {
    expect(getProgressStatusWarning('solicitado', 10)).toBeNull()
    expect(getProgressStatusWarning('solicitado', 0)).toBeNull()
  })

  it('retorna null para status sem regra definida', () => {
    expect(getProgressStatusWarning('pausado', 50)).toBeNull()
    expect(getProgressStatusWarning('em_validacao', 70)).toBeNull()
  })
})
