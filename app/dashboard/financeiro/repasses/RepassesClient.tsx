'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

interface QueueRow {
  sale_id:          string
  sale_kind?:       'app_purchase' | 'subscription_invoice'
  application_name: string
  plan_name:        string
  net_amount:       number
  paid_at:          string
  release_date:     string
  days_remaining:   number
  status:           'retido' | 'elegivel'
}

interface HistoryRow {
  payout_id:        string
  reference:        string
  notes:            string | null
  payout_status:    'confirmado' | 'revertido'
  total_amount:     number
  created_at:        string
  reverted_at:       string | null
  revert_reason:     string | null
  item_id:           string | null
  item_kind:         'app_purchase_main' | 'app_purchase_reserve' | 'subscription_invoice' | null
  item_amount:        number | null
  application_name:   string | null
  plan_name:          string | null
  sale_paid_at:       string | null
}

interface GroupedPayout {
  payout_id:     string
  reference:     string
  notes:         string | null
  payout_status: 'confirmado' | 'revertido'
  total_amount:  number
  created_at:    string
  reverted_at:   string | null
  revert_reason: string | null
  items: {
    item_id: string
    item_kind: 'app_purchase_main' | 'app_purchase_reserve' | 'subscription_invoice'
    item_amount: number
    application_name: string
    plan_name: string
    sale_paid_at: string
  }[]
}

function groupHistory(rows: HistoryRow[]): GroupedPayout[] {
  const map = new Map<string, GroupedPayout>()
  for (const r of rows) {
    if (!map.has(r.payout_id)) {
      map.set(r.payout_id, {
        payout_id: r.payout_id, reference: r.reference, notes: r.notes,
        payout_status: r.payout_status, total_amount: r.total_amount,
        created_at: r.created_at, reverted_at: r.reverted_at, revert_reason: r.revert_reason,
        items: [],
      })
    }
    if (r.item_id) {
      map.get(r.payout_id)!.items.push({
        item_id: r.item_id,
        item_kind: r.item_kind!,
        item_amount: r.item_amount!,
        application_name: r.application_name!,
        plan_name: r.plan_name!,
        sale_paid_at: r.sale_paid_at!,
      })
    }
  }
  return Array.from(map.values())
}

const ITEM_KIND_LABEL: Record<string, string> = {
  app_purchase_main: 'Compra única',
  app_purchase_reserve: 'Reserva de disputa',
  subscription_invoice: 'Assinatura',
}

function QueueSection({ title, emptyLabel, rows, error }: { title: string; emptyLabel: string; rows: QueueRow[]; error: boolean }) {
  return (
    <div className="mb-6 rounded-2xl border p-5" style={{ background: colors.card, borderColor: colors.border, boxShadow: shadows.card }}>
      <h3 className="mb-3 text-base font-bold" style={{ color: colors.text }}>{title}</h3>
      {error ? (
        <p className="text-sm" style={{ color: '#EF4444' }}>Não foi possível carregar esta lista. Tente novamente em instantes.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(row => {
            const elegivel = row.status === 'elegivel'
            return (
              <div key={row.sale_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3" style={{ borderColor: colors.border }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: colors.text }}>{row.application_name} — {row.plan_name}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Vendido em {formatDateBR(row.paid_at.slice(0, 10))}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: colors.text }}>{formatCurrencyBRL(row.net_amount)}</p>
                  <p className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: elegivel ? colors.primary : '#F59E0B' }}>
                    <Clock size={11} aria-hidden="true" />
                    {elegivel ? 'Elegível agora' : `Libera em ${row.days_remaining} dia${row.days_remaining === 1 ? '' : 's'} (${formatDateBR(row.release_date.slice(0, 10))})`}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface Props {
  mainQueue:    QueueRow[]
  mainError:    boolean
  reserveQueue: QueueRow[]
  reserveError: boolean
  history:      HistoryRow[]
  historyError: boolean
}

export default function RepassesClient({ mainQueue, mainError, reserveQueue, reserveError, history, historyError }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const grouped = useMemo(() => groupHistory(history), [history])

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold" style={{ color: colors.text }}>Repasses e extrato</h2>

      <QueueSection title="Repasse principal" emptyLabel="Nenhuma venda retida ou elegível no momento." rows={mainQueue} error={mainError} />
      <QueueSection title="Reserva de disputa" emptyLabel="Nenhuma reserva de disputa em aberto." rows={reserveQueue} error={reserveError} />

      <div className="rounded-2xl border p-5" style={{ background: colors.card, borderColor: colors.border, boxShadow: shadows.card }}>
        <h3 className="mb-3 text-base font-bold" style={{ color: colors.text }}>Histórico de repasses</h3>
        {historyError ? (
          <p className="text-sm" style={{ color: '#EF4444' }}>Não foi possível carregar o histórico. Tente novamente em instantes.</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhum repasse recebido ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: colors.textSecondary }}>
                  <th className="pb-2 pr-3 font-semibold">Data</th>
                  <th className="pb-2 pr-3 font-semibold">Referência</th>
                  <th className="pb-2 pr-3 font-semibold">Valor</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(payout => {
                  const expanded = expandedId === payout.payout_id
                  const reverted = payout.payout_status === 'revertido'
                  return (
                    <Fragment key={payout.payout_id}>
                      <tr onClick={() => setExpandedId(expanded ? null : payout.payout_id)} className="cursor-pointer border-t" style={{ borderColor: colors.border }}>
                        <td className="py-2 pr-3" style={{ color: colors.text }}>
                          <span className="inline-flex items-center gap-1">
                            {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                            {formatDateBR(payout.created_at.slice(0, 10))}
                          </span>
                        </td>
                        <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{payout.reference}</td>
                        <td className="py-2 pr-3 font-semibold" style={{ color: colors.text }}>{formatCurrencyBRL(payout.total_amount)}</td>
                        <td className="py-2">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: reverted ? '#EF4444' : '#10B981', background: reverted ? '#EF44441A' : '#10B9811A' }}>
                            {reverted ? 'Revertido' : 'Confirmado'}
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t" style={{ borderColor: colors.border }}>
                          <td colSpan={4} className="py-3" style={{ background: colors.backgroundAlt }}>
                            <div className="px-3">
                              {reverted && (
                                <p className="mb-2 text-xs" style={{ color: '#EF4444' }}>Motivo da reversão: {payout.revert_reason ?? '—'}</p>
                              )}
                              {payout.notes && (
                                <p className="mb-2 text-xs" style={{ color: colors.textSecondary }}>Observações: {payout.notes}</p>
                              )}
                              <div className="flex flex-col gap-1">
                                {payout.items.map(item => (
                                  <div key={item.item_id} className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: colors.textSecondary }}>
                                    <span>{item.application_name} — {item.plan_name} ({ITEM_KIND_LABEL[item.item_kind]}, vendido em {formatDateBR(item.sale_paid_at.slice(0, 10))})</span>
                                    <strong style={{ color: colors.text }}>{formatCurrencyBRL(item.item_amount)}</strong>
                                  </div>
                                ))}
                              </div>
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
        )}
      </div>
    </div>
  )
}
