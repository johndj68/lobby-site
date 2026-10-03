import { describe, it, expect } from 'vitest'
import { resolvePeriodoRange, resolveGranularidade } from './financeiro-periodo'

describe('resolvePeriodoRange', () => {
  it('personalizado usa as datas informadas, to exclusivo no dia seguinte', () => {
    const { from, to } = resolvePeriodoRange('personalizado', '2026-01-10', '2026-01-15')
    expect(from).toBe(new Date('2026-01-10T00:00:00').toISOString())
    expect(to).toBe(new Date('2026-01-16T00:00:00').toISOString())
  })

  it('personalizado sem datas cai no comportamento de este_mes', () => {
    const custom = resolvePeriodoRange('personalizado')
    const esteMes = resolvePeriodoRange('este_mes')
    expect(custom).toEqual(esteMes)
  })

  it('mes_anterior cobre do dia 1 do mês passado ao dia 1 deste mês', () => {
    const now = new Date()
    const { from, to } = resolvePeriodoRange('mes_anterior')
    expect(new Date(from).getMonth()).toBe((now.getMonth() + 11) % 12)
    expect(new Date(to).getDate()).toBe(1)
  })

  it('ultimos_30_dias cobre exatamente 30 dias', () => {
    const { from, to } = resolvePeriodoRange('ultimos_30_dias')
    const days = (new Date(to).getTime() - new Date(from).getTime()) / 86400_000
    expect(days).toBe(30)
  })
})

describe('resolveGranularidade', () => {
  it('período de 7 dias agrupa por dia', () => {
    expect(resolveGranularidade('2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z')).toBe('day')
  })

  it('período de exatamente 31 dias ainda agrupa por dia', () => {
    expect(resolveGranularidade('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')).toBe('day')
  })

  it('período maior que 31 dias agrupa por mês', () => {
    expect(resolveGranularidade('2026-01-01T00:00:00Z', '2026-03-05T00:00:00Z')).toBe('month')
  })
})
