import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { timeLabel, relTime, dateLabel } from '@/lib/messages-utils'

// ── timeLabel ─────────────────────────────────────────────────────────────────

describe('timeLabel', () => {
  it('formata horário no padrão HH:MM (pt-BR)', () => {
    const d = '2026-07-20T14:32:00Z'
    const result = timeLabel(d)
    // Verificamos que contém dois grupos de 2 dígitos separados por ':'
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })

  it('produz string não-vazia para data válida', () => {
    expect(timeLabel('2026-01-01T00:00:00Z')).toBeTruthy()
  })
})

// ── relTime ───────────────────────────────────────────────────────────────────

describe('relTime', () => {
  const NOW = new Date('2026-07-20T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna "agora" para mensagens com menos de 60 segundos', () => {
    const d = new Date(NOW - 30_000).toISOString()
    expect(relTime(d)).toBe('agora')
  })

  it('retorna "agora" para mensagem com exatamente 59 segundos', () => {
    const d = new Date(NOW - 59_000).toISOString()
    expect(relTime(d)).toBe('agora')
  })

  it('retorna "Xmin" para mensagens entre 1 e 59 minutos', () => {
    const d = new Date(NOW - 5 * 60_000).toISOString()
    expect(relTime(d)).toBe('5min')
  })

  it('retorna "1min" com exatamente 60 segundos', () => {
    const d = new Date(NOW - 60_000).toISOString()
    expect(relTime(d)).toBe('1min')
  })

  it('retorna "59min" com 59 minutos e 59 segundos', () => {
    const d = new Date(NOW - (3600_000 - 1000)).toISOString()
    expect(relTime(d)).toBe('59min')
  })

  it('retorna "Xh" para mensagens entre 1 e 23 horas', () => {
    const d = new Date(NOW - 2 * 3600_000).toISOString()
    expect(relTime(d)).toBe('2h')
  })

  it('retorna "1h" com exatamente 3600 segundos', () => {
    const d = new Date(NOW - 3600_000).toISOString()
    expect(relTime(d)).toBe('1h')
  })

  it('retorna "Xd" para mensagens com mais de 24 horas', () => {
    const d = new Date(NOW - 3 * 86400_000).toISOString()
    expect(relTime(d)).toBe('3d')
  })

  it('retorna "1d" com exatamente 24 horas', () => {
    const d = new Date(NOW - 86400_000).toISOString()
    expect(relTime(d)).toBe('1d')
  })
})

// ── dateLabel ─────────────────────────────────────────────────────────────────

describe('dateLabel', () => {
  const NOW = new Date('2026-07-20T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna "Hoje" para data no mesmo dia', () => {
    const d = new Date('2026-07-20T08:00:00Z').toISOString()
    expect(dateLabel(d)).toBe('Hoje')
  })

  it('retorna "Hoje" para timestamp de meia-noite no mesmo dia', () => {
    const d = new Date('2026-07-20T00:00:00').toISOString()
    expect(dateLabel(d)).toBe('Hoje')
  })

  it('retorna data localizada (pt-BR) para dia anterior', () => {
    const d = new Date('2026-07-19T10:00:00Z').toISOString()
    const result = dateLabel(d)
    expect(result).not.toBe('Hoje')
    // pt-BR: "19 de julho" — verificamos que contém dígitos e "de"
    expect(result).toMatch(/\d+/)
    expect(result).toContain('de')
  })

  it('não retorna "Hoje" para data de ontem', () => {
    const d = new Date(NOW - 86400_000).toISOString()
    expect(dateLabel(d)).not.toBe('Hoje')
  })
})
