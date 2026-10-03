// Resolução de período/granularidade pra Visão geral de Vendas e
// financeiro — lógica pura, sem I/O, reaproveitada pelo client da
// página e pela rota de export (nunca duas implementações divergentes
// do mesmo cálculo de datas).

export type PeriodoPreset = 'este_mes' | 'mes_anterior' | 'ultimos_30_dias' | 'personalizado'

export interface PeriodoRange {
  /** ISO, inclusivo */
  from: string
  /** ISO, exclusivo */
  to: string
}

export const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  este_mes: 'Este mês',
  mes_anterior: 'Mês anterior',
  ultimos_30_dias: 'Últimos 30 dias',
  personalizado: 'Personalizado',
}

/** Início exclusivo do dia seguinte a `date` (meia-noite local) — usado
 *  como limite superior exclusivo em todo período calculado aqui. */
function startOfNextDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
}

export function resolvePeriodoRange(
  preset: PeriodoPreset,
  customFrom?: string | null,
  customTo?: string | null,
): PeriodoRange {
  const now = new Date()

  if (preset === 'personalizado' && customFrom && customTo) {
    const from = new Date(`${customFrom}T00:00:00`)
    const to = startOfNextDay(new Date(`${customTo}T00:00:00`))
    return { from: from.toISOString(), to: to.toISOString() }
  }

  if (preset === 'mes_anterior') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const to = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: from.toISOString(), to: to.toISOString() }
  }

  if (preset === 'ultimos_30_dias') {
    const to = startOfNextDay(now)
    const from = new Date(to.getTime() - 30 * 86400_000)
    return { from: from.toISOString(), to: to.toISOString() }
  }

  // 'este_mes' (default, inclui o caso 'personalizado' sem datas ainda escolhidas)
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** ≤31 dias de período → agrupa por dia; maior → por mês. Mesma regra
 *  usada tanto no gráfico quanto, implicitamente, em qualquer leitor do
 *  período (export inclusive, se um dia precisar de granularidade). */
export function resolveGranularidade(from: string, to: string): 'day' | 'month' {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86400_000
  return days <= 31 ? 'day' : 'month'
}
