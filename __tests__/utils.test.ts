import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cn, timeAgo } from '@/lib/utils'

// ── cn ────────────────────────────────────────────────────────────────────────

describe('cn', () => {
  it('combina classes simples', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('remove classes conflitantes do Tailwind (tailwind-merge)', () => {
    // p-4 e p-8 conflitam — deve vencer o último
    expect(cn('p-4', 'p-8')).toBe('p-8')
  })

  it('ignora valores falsy', () => {
    expect(cn('a', false && 'b', undefined, null as unknown as string)).toBe('a')
  })

  it('aceita objeto condicional', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500')
  })

  it('retorna string vazia sem args', () => {
    expect(cn()).toBe('')
  })
})

// ── timeAgo ───────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  const NOW = new Date('2026-07-20T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna fallback para null', () => {
    expect(timeAgo(null)).toBe('—')
  })

  it('retorna fallback para undefined', () => {
    expect(timeAgo(undefined)).toBe('—')
  })

  it('retorna fallback customizado', () => {
    expect(timeAgo(null, 'N/A')).toBe('N/A')
  })

  it('retorna "agora mesmo" para menos de 60s atrás', () => {
    const d = new Date(NOW - 30 * 1000).toISOString()
    expect(timeAgo(d)).toBe('agora mesmo')
  })

  it('retorna minutos para menos de 1h', () => {
    const d = new Date(NOW - 5 * 60 * 1000).toISOString()
    expect(timeAgo(d)).toBe('há 5 min')
  })

  it('retorna horas para menos de 1 dia', () => {
    const d = new Date(NOW - 3 * 3600 * 1000).toISOString()
    expect(timeAgo(d)).toBe('há 3h')
  })

  it('retorna 1 dia (singular)', () => {
    const d = new Date(NOW - 1 * 86400 * 1000 - 1000).toISOString()
    expect(timeAgo(d)).toBe('há 1 dia')
  })

  it('retorna dias (plural)', () => {
    const d = new Date(NOW - 5 * 86400 * 1000).toISOString()
    expect(timeAgo(d)).toBe('há 5 dias')
  })
})
