'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

const PAGE_SIZE = 50

interface SoldApp {
  application_id:   string
  application_name: string
}

interface SaleRow {
  sale_id:           string
  sale_kind:         'app_purchase' | 'subscription_invoice'
  application_name:  string
  plan_name:         string
  buyer_name:        string
  buyer_email:       string
  amount:            number
  commission_amount: number
  partner_amount:    number
  reserve_amount:    number
  reserve_status:    'held' | 'released' | 'clawed_back' | null
  refunded_amount:   number
  paid_at:           string
  payout_status:     'retido' | 'elegivel' | 'pago' | 'reembolsado'
}

const STATUS_STYLE: Record<SaleRow['payout_status'], { label: string; color: string }> = {
  retido:      { label: 'Retido',      color: '#F59E0B' },
  elegivel:    { label: 'Elegível',    color: colors.primary },
  pago:        { label: 'Pago',        color: '#10B981' },
  reembolsado: { label: 'Reembolsado', color: '#EF4444' },
}

const RESERVE_STATUS_LABEL: Record<string, string> = {
  held:         'Retida',
  released:     'Liberada',
  clawed_back:  'Perdida em disputa',
}

interface Props {
  soldApps: SoldApp[]
}

export default function VendasClient({ soldApps }: Props) {
  const [applicationId, setApplicationId] = useState<string>('')
  const [page, setPage] = useState(0)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const supabase = createClient()
    const filterId = applicationId || null
    const [{ data: salesData, error: salesError }, { data: countData, error: countError }] = await Promise.all([
      supabase.rpc('get_partner_sales', { p_application_id: filterId, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }),
      supabase.rpc('get_partner_sales_count', { p_application_id: filterId }),
    ]) as unknown as [{ data: SaleRow[] | null; error: unknown }, { data: number | null; error: unknown }]
    if (salesError || countError) {
      setError(true)
      setSales([])
      setTotal(0)
      setLoading(false)
      return
    }
    setSales(salesData ?? [])
    setTotal(countData ?? 0)
    setLoading(false)
  }, [applicationId, page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold" style={{ color: colors.text }}>Vendas</h2>
        {soldApps.length > 1 && (
          <select
            value={applicationId}
            onChange={e => { setApplicationId(e.target.value); setPage(0) }}
            className="h-9 rounded-lg border px-3 text-sm"
            style={{ borderColor: colors.border, color: colors.text }}
            aria-label="Filtrar vendas por app"
          >
            <option value="">Todos os apps</option>
            {soldApps.map(a => (
              <option key={a.application_id} value={a.application_id}>{a.application_name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Carregando…</p>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm" style={{ color: colors.textSecondary }}>Não foi possível carregar as vendas. Tente novamente.</p>
          <button
            onClick={() => load()}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            style={{ borderColor: colors.border, color: colors.text }}
          >
            Tentar novamente
          </button>
        </div>
      ) : sales.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhuma venda ainda.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: colors.textSecondary }}>
                  <th className="pb-2 pr-3 font-semibold">App</th>
                  <th className="pb-2 pr-3 font-semibold">Plano</th>
                  <th className="pb-2 pr-3 font-semibold">Comprador</th>
                  <th className="pb-2 pr-3 font-semibold">Data</th>
                  <th className="pb-2 pr-3 font-semibold">Valor</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => {
                  const expanded = expandedId === sale.sale_id
                  const status = STATUS_STYLE[sale.payout_status]
                  return (
                    <Fragment key={sale.sale_id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : sale.sale_id)}
                        className="cursor-pointer border-t"
                        style={{ borderColor: colors.border }}
                      >
                        <td className="py-2 pr-3" style={{ color: colors.text }}>
                          <span className="inline-flex items-center gap-1">
                            {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                            {sale.application_name}
                          </span>
                        </td>
                        <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{sale.plan_name}</td>
                        <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{sale.buyer_name}</td>
                        <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{formatDateBR(sale.paid_at.slice(0, 10))}</td>
                        <td className="py-2 pr-3 font-semibold" style={{ color: colors.text }}>{formatCurrencyBRL(sale.amount)}</td>
                        <td className="py-2">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: status.color, background: `${status.color}1A` }}>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t" style={{ borderColor: colors.border }}>
                          <td colSpan={6} className="py-3" style={{ background: colors.backgroundAlt }}>
                            <div className="grid grid-cols-2 gap-2 px-3 text-xs sm:grid-cols-4" style={{ color: colors.textSecondary }}>
                              <div>Tipo: <strong style={{ color: colors.text }}>{sale.sale_kind === 'app_purchase' ? 'Compra única' : 'Assinatura'}</strong></div>
                              <div>Comissão LOBBY: <strong style={{ color: colors.text }}>{formatCurrencyBRL(sale.commission_amount)}</strong></div>
                              <div>Valor líquido: <strong style={{ color: colors.text }}>{formatCurrencyBRL(sale.partner_amount)}</strong></div>
                              <div>E-mail: <strong style={{ color: colors.text }}>{sale.buyer_email}</strong></div>
                              {sale.reserve_amount > 0 && (
                                <div>Reserva de disputa: <strong style={{ color: colors.text }}>{formatCurrencyBRL(sale.reserve_amount)} ({sale.reserve_status ? RESERVE_STATUS_LABEL[sale.reserve_status] : '—'})</strong></div>
                              )}
                              {sale.refunded_amount > 0 && (
                                <div>Reembolsado: <strong style={{ color: colors.text }}>{formatCurrencyBRL(sale.refunded_amount)}</strong></div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs" style={{ color: colors.textSecondary }}>
            <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"
                style={{ borderColor: colors.border, color: colors.text }}
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
