'use client'

import { formatCurrencyBRL, FINANCE_TYPE_LABEL, FINANCE_STATUS_LABEL, getFinanceTypeStyle, getFinanceStatusStyle } from '@/lib/finance'
import type { FinanceMetrics } from '@/lib/finance'

const MONTH_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTH_LABEL[Number(m) - 1]}/${y.slice(2)}`
}

/**
 * Gráficos em CSS puro — o projeto não usa nenhuma biblioteca de charts,
 * então em vez de adicionar uma dependência nova só pra isso, os
 * indicadores viram barras/listas com largura proporcional ao valor.
 */
export default function FinanceCharts({ metrics }: { metrics: FinanceMetrics }) {
  const maxMonthly  = Math.max(1, ...metrics.monthly.map(m => m.total))
  const maxType     = Math.max(1, ...metrics.byType.map(t => t.total))
  const maxClient   = Math.max(1, ...metrics.topClients.map(c => c.total))
  const statusTotal = metrics.byStatus.reduce((s, x) => s + x.total, 0) || 1

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Receita por mês */}
      <section className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
        <h3 className="mb-4 text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Receita por mês</h3>
        {metrics.monthly.length === 0 ? (
          <p className="text-xs text-white/30">Sem dados no período.</p>
        ) : (
          <div className="flex items-end gap-2" style={{ height: 140 }}>
            {metrics.monthly.map(m => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5" title={formatCurrencyBRL(m.total)}>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-[#005BFF] to-[#7B2CFF] transition-all"
                    style={{ height: `${Math.max(4, (m.total / maxMonthly) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-white/35">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Receita por categoria */}
      <section className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
        <h3 className="mb-4 text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Receita por categoria</h3>
        {metrics.byType.length === 0 ? (
          <p className="text-xs text-white/30">Sem dados no período.</p>
        ) : (
          <div className="space-y-3">
            {metrics.byType.sort((a, b) => b.total - a.total).map(t => {
              const s = getFinanceTypeStyle(t.type)
              return (
                <div key={t.type}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-white/70">{FINANCE_TYPE_LABEL[t.type]}</span>
                    <span className="font-bold text-white/90">{formatCurrencyBRL(t.total)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${(t.total / maxType) * 100}%`, background: s.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Status financeiro */}
      <section className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
        <h3 className="mb-4 text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Status financeiro</h3>
        {metrics.byStatus.length === 0 ? (
          <p className="text-xs text-white/30">Sem dados no período.</p>
        ) : (
          <>
            <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
              {metrics.byStatus.map(st => {
                const s = getFinanceStatusStyle(st.status)
                return <div key={st.status} style={{ width: `${(st.total / statusTotal) * 100}%`, background: s.color }} title={FINANCE_STATUS_LABEL[st.status]} />
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {metrics.byStatus.map(st => {
                const s = getFinanceStatusStyle(st.status)
                return (
                  <span key={st.status} className="flex items-center gap-1.5 text-[11px] text-white/60">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                    {FINANCE_STATUS_LABEL[st.status]} · {formatCurrencyBRL(st.total)} ({st.count})
                  </span>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* Top clientes */}
      <section className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
        <h3 className="mb-4 text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Top clientes por receita</h3>
        {metrics.topClients.length === 0 ? (
          <p className="text-xs text-white/30">Sem dados no período.</p>
        ) : (
          <div className="space-y-3">
            {metrics.topClients.map(c => (
              <div key={c.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium text-white/70">{c.name}</span>
                  <span className="shrink-0 font-bold text-white/90">{formatCurrencyBRL(c.total)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]" style={{ width: `${(c.total / maxClient) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
