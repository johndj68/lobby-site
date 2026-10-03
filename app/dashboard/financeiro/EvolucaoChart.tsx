'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, type TooltipValueType } from 'recharts'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface SerieBucket {
  bucket:             string
  vendas_valor:       number
  participacao_valor: number
}

interface Props {
  data:          SerieBucket[]
  granularidade: 'day' | 'month'
  loading:       boolean
  error:         boolean
  onRetry:       () => void
}

function formatBucketLabel(bucket: string, granularidade: 'day' | 'month'): string {
  if (granularidade === 'month') {
    const [year, month] = bucket.split('-')
    return `${month}/${year}`
  }
  return formatDateBR(bucket)
}

export default function EvolucaoChart({ data, granularidade, loading, error, onRetry }: Props) {
  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl" style={{ background: colors.borderLight }} />
  }
  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border text-sm" style={{ borderColor: '#EF4444', color: colors.text }}>
        Não foi possível carregar o gráfico.
        <button onClick={onRetry} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
      </div>
    )
  }
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border text-sm" style={{ borderColor: colors.border, color: colors.textSecondary }}>
        Suas vendas aparecerão aqui.
      </div>
    )
  }

  const chartData = data.map(d => ({ ...d, label: formatBucketLabel(d.bucket, granularidade) }))

  return (
    <div>
      <div style={{ width: '100%', height: 256 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.borderLight} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.textMuted }} />
            <YAxis tick={{ fontSize: 11, fill: colors.textMuted }} tickFormatter={v => formatCurrencyBRL(v)} width={90} />
            <Tooltip
              formatter={(value: TooltipValueType | undefined) => formatCurrencyBRL(Number(value ?? 0))}
              labelStyle={{ color: colors.text }}
              contentStyle={{ borderRadius: 8, borderColor: colors.border }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="vendas_valor" name="Vendas confirmadas" stroke={colors.text} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="participacao_valor" name="Sua participação" stroke={colors.primary} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold" style={{ color: colors.textSecondary }}>Ver dados em tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: colors.textSecondary }}>
                <th className="pb-1 pr-3 font-semibold">Data</th>
                <th className="pb-1 pr-3 font-semibold">Vendas</th>
                <th className="pb-1 font-semibold">Sua participação</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map(d => (
                <tr key={d.bucket} className="border-t" style={{ borderColor: colors.borderLight }}>
                  <td className="py-1 pr-3" style={{ color: colors.text }}>{d.label}</td>
                  <td className="py-1 pr-3 tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(d.vendas_valor)}</td>
                  <td className="py-1 tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(d.participacao_valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
