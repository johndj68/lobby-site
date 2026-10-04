'use client'

import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL } from '@/lib/finance'

export interface DesempenhoRow {
  application_id:           string
  application_name:         string
  vendas_confirmadas_qtd:   number
  vendas_confirmadas_valor: number
  participacao_valor:       number
}

interface Props {
  rows:          DesempenhoRow[]
  loading:       boolean
  error:         boolean
  onRetry:       () => void
  /** Oculta a seção quando só há 1 app ou um filtro de app já está
   *  ativo — o número já está visível nos cards de Resultados do
   *  período, um ranking de 1 item só repetiria essa mesma informação. */
  hidden:        boolean
}

export default function DesempenhoPorApp({ rows, loading, error, onRetry, hidden }: Props) {
  if (hidden) return null

  return (
    <div className="mb-6 rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
      <p className="mb-3 text-sm font-bold" style={{ color: colors.text }}>Desempenho por aplicativo</p>
      <p className="mb-3 text-[11px]" style={{ color: colors.textMuted }}>Ordenado por valor vendido no período.</p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: colors.text }}>
          Não foi possível carregar.
          <button onClick={onRetry} className="rounded-lg border px-2 py-1 font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhuma venda neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-xs">
            <thead>
              <tr style={{ color: colors.textSecondary }}>
                <th className="pb-2 pr-3 font-semibold">Aplicativo</th>
                <th className="pb-2 pr-3 font-semibold">Vendas</th>
                <th className="pb-2 pr-3 font-semibold">Valor vendido</th>
                <th className="pb-2 font-semibold">Sua participação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.application_id} className="border-t" style={{ borderColor: colors.borderLight }}>
                  <td className="py-2 pr-3" style={{ color: colors.text }}>{r.application_name}</td>
                  <td className="py-2 pr-3 tabular-nums" style={{ color: colors.textSecondary }}>{r.vendas_confirmadas_qtd}</td>
                  <td className="py-2 pr-3 tabular-nums font-semibold" style={{ color: colors.text }}>{formatCurrencyBRL(r.vendas_confirmadas_valor)}</td>
                  <td className="py-2 tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(r.participacao_valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
