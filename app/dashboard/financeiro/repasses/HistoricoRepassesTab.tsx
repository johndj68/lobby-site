'use client'

import { useMemo, useState } from 'react'
import { Receipt, Inbox, X } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import PayoutDetailSheet, { type GroupedPayout } from './PayoutDetailSheet'

export interface HistoryRow {
  payout_id:             string
  reference:             string
  notes:                 string | null
  payout_status:         'confirmado' | 'revertido'
  total_amount:          number
  currency:              string
  destination_snapshot:  string | null
  created_at:            string
  reverted_at:           string | null
  revert_reason:         string | null
  item_id:               string | null
  item_kind:              'app_purchase_main' | 'app_purchase_reserve' | 'subscription_invoice' | null
  item_amount:            number | null
  sale_id:                string | null
  application_id:         string | null
  application_name:       string | null
  plan_name:              string | null
  sale_paid_at:            string | null
}

function groupHistory(rows: HistoryRow[]): GroupedPayout[] {
  const map = new Map<string, GroupedPayout>()
  for (const r of rows) {
    if (!map.has(r.payout_id)) {
      map.set(r.payout_id, {
        payout_id: r.payout_id, reference: r.reference, notes: r.notes,
        payout_status: r.payout_status, total_amount: r.total_amount, currency: r.currency,
        destination_snapshot: r.destination_snapshot,
        created_at: r.created_at, reverted_at: r.reverted_at, revert_reason: r.revert_reason,
        items: [],
      })
    }
    if (r.item_id) {
      map.get(r.payout_id)!.items.push({
        item_id: r.item_id, item_kind: r.item_kind!, item_amount: r.item_amount!,
        sale_id: r.sale_id, application_id: r.application_id,
        application_name: r.application_name!, plan_name: r.plan_name!, sale_paid_at: r.sale_paid_at!,
      })
    }
  }
  return Array.from(map.values())
}

interface Props {
  rows:      HistoryRow[]
  loading:   boolean
  error:     boolean
  partnerId: string | null
  onRetry:   () => void
}

export default function HistoricoRepassesTab({ rows, loading, error, partnerId, onRetry }: Props) {
  const [status, setStatus] = useState<'' | 'confirmado' | 'revertido'>('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [detail, setDetail] = useState<GroupedPayout | null>(null)

  const grouped = useMemo(() => groupHistory(rows), [rows])

  const filtered = useMemo(() => grouped.filter(p => {
    if (status && p.payout_status !== status) return false
    const d = p.created_at.slice(0, 10)
    if (de && d < de) return false
    if (ate && d > ate) return false
    return true
  }), [grouped, status, de, ate])

  const isFiltered = !!(status || de || ate)
  const clearFilters = () => { setStatus(''); setDe(''); setAte('') }

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444' }}>
        Não foi possível carregar o histórico de repasses.
        <button onClick={onRetry} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: colors.border, color: colors.text }}>Tentar novamente</button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)} className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }}>
            <option value="">Todos</option>
            <option value="confirmado">Confirmado</option>
            <option value="revertido">Revertido</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Criado de</label>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Criado até</label>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }} />
        </div>
        {isFiltered && (
          <button type="button" onClick={clearFilters} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={{ color: colors.primary }}>
            <X size={14} aria-hidden="true" />Limpar filtros
          </button>
        )}
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}</div>
        ) : filtered.length === 0 ? (
          isFiltered ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
              <p className="text-sm font-semibold" style={{ color: colors.text }}>Nenhum resultado encontrado</p>
              <button onClick={clearFilters} className="mt-1 text-sm font-semibold" style={{ color: colors.primary }}>Limpar filtros</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Receipt size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
              <p className="text-sm font-semibold" style={{ color: colors.text }}>Você ainda não tem repasses registrados</p>
              <p className="max-w-sm text-xs" style={{ color: colors.textSecondary }}>Os repasses aparecerão aqui conforme forem processados.</p>
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: colors.textSecondary }}>
                  <th className="pb-2 pr-3 font-semibold">Referência</th>
                  <th className="pb-2 pr-3 font-semibold">Criado em</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Valor</th>
                  <th className="pb-2 pr-3 font-semibold">Destino</th>
                  <th className="pb-2 pr-3 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const reverted = p.payout_status === 'revertido'
                  return (
                    <tr key={p.payout_id} className="border-t" style={{ borderColor: colors.border }}>
                      <td className="py-2.5 pr-3 font-mono text-xs" style={{ color: colors.text }}>{p.reference}</td>
                      <td className="py-2.5 pr-3" style={{ color: colors.textSecondary }}>{formatDateBR(p.created_at.slice(0, 10))}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(p.total_amount)}</td>
                      <td className="py-2.5 pr-3" style={{ color: colors.textSecondary }}>{p.destination_snapshot ?? '—'}</td>
                      <td className="py-2.5 pr-3">
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: reverted ? '#EF4444' : '#10B981', background: reverted ? '#EF44441A' : '#10B9811A' }}>
                          {reverted ? 'Revertido' : 'Confirmado'}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <button type="button" onClick={() => setDetail(p)} className="text-xs font-semibold" style={{ color: colors.primary }}>Ver detalhes</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PayoutDetailSheet payout={detail} partnerId={partnerId} onClose={() => setDetail(null)} />
    </div>
  )
}
