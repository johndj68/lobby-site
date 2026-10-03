'use client'

import Link from 'next/link'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface VendaRow {
  sale_id:          string
  sale_kind:        'app_purchase' | 'subscription_invoice'
  application_name: string
  plan_name:        string
  amount:           number
  partner_amount:   number
  paid_at:          string
  payout_status:    'retido' | 'elegivel' | 'pago' | 'reembolsado'
}

const STATUS_STYLE: Record<VendaRow['payout_status'], { label: string; color: string }> = {
  retido:      { label: 'Retido',      color: '#F59E0B' },
  elegivel:    { label: 'Elegível',    color: colors.primary },
  pago:        { label: 'Pago',        color: '#10B981' },
  reembolsado: { label: 'Reembolsado', color: '#EF4444' },
}

interface Props {
  rows:      VendaRow[]
  loading:   boolean
  error:     boolean
  onRetry:   () => void
  partnerId: string | null
}

export default function UltimasVendas({ rows, loading, error, onRetry, partnerId }: Props) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: colors.text }}>Últimas vendas</p>
        <Link href={`/dashboard/financeiro/vendas${partnerId ? `?parceiro=${partnerId}` : ''}`} className="text-xs font-semibold" style={{ color: colors.primary }}>
          Ver todas as vendas →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: colors.text }}>
          Não foi possível carregar as vendas.
          <button onClick={onRetry} className="rounded-lg border px-2 py-1 font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Você ainda não tem vendas neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: colors.textSecondary }}>
                <th className="pb-2 pr-3 font-semibold">App / Plano</th>
                <th className="pb-2 pr-3 font-semibold">Data</th>
                <th className="pb-2 pr-3 font-semibold">Valor pago</th>
                <th className="pb-2 pr-3 font-semibold">Sua participação</th>
                <th className="pb-2 pr-3 font-semibold">Status</th>
                <th className="pb-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const status = STATUS_STYLE[r.payout_status]
                return (
                  <tr key={r.sale_id} className="border-t" style={{ borderColor: colors.borderLight }}>
                    <td className="py-2 pr-3" style={{ color: colors.text }}>{r.application_name} — {r.plan_name}</td>
                    <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{formatDateBR(r.paid_at.slice(0, 10))}</td>
                    <td className="py-2 pr-3 tabular-nums font-semibold" style={{ color: colors.text }}>{formatCurrencyBRL(r.amount)}</td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(r.partner_amount)}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: status.color, background: `${status.color}1A` }}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-2">
                      <Link href={`/dashboard/financeiro/vendas?venda=${r.sale_id}${partnerId ? `&parceiro=${partnerId}` : ''}`} className="text-[11px] font-semibold" style={{ color: colors.primary }}>
                        Ver detalhes
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
