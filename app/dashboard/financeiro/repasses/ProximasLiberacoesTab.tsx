'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, Clock, CheckCircle2, Inbox, X } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR, formatCountdown } from '@/lib/finance'
import VendaDetailDrawer from '../vendas/VendaDetailDrawer'

export interface QueueRow {
  sale_id:          string
  sale_kind?:       'app_purchase' | 'subscription_invoice'
  application_name: string
  plan_name:        string
  net_amount:       number
  paid_at:          string
  release_date:     string
  days_remaining:   number
  status:           'retido' | 'elegivel'
  tipo:             'retencao' | 'reserva'
}

interface Props {
  rows:      QueueRow[]
  loading:   boolean
  error:     boolean
  partnerId: string | null
  onRetry:   () => void
}

const TIPO_LABEL: Record<QueueRow['tipo'], string> = { retencao: 'Retenção', reserva: 'Reserva' }
const TIPO_COLOR: Record<QueueRow['tipo'], string> = { retencao: '#F59E0B', reserva: '#6D28D9' }

function situacao(r: QueueRow): { label: string; color: string } {
  if (r.status === 'elegivel') return { label: 'Elegível', color: colors.primary }
  return r.tipo === 'reserva' ? { label: 'Em reserva', color: '#6D28D9' } : { label: 'Em retenção', color: '#F59E0B' }
}

export default function ProximasLiberacoesTab({ rows, loading, error, partnerId, onRetry }: Props) {
  const [app, setApp] = useState('')
  const [tipo, setTipo] = useState<'' | QueueRow['tipo']>('')
  const [status, setStatus] = useState<'' | QueueRow['status']>('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [page, setPage] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const PAGE_SIZE = 10

  const apps = useMemo(() => [...new Set(rows.map(r => r.application_name))].sort(), [rows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (app && r.application_name !== app) return false
      if (tipo && r.tipo !== tipo) return false
      if (status && r.status !== status) return false
      if (de && r.release_date.slice(0, 10) < de) return false
      if (ate && r.release_date.slice(0, 10) > ate) return false
      return true
    }).sort((a, b) => a.release_date.localeCompare(b.release_date))
  }, [rows, app, tipo, status, de, ate])

  const isFiltered = !!(app || tipo || status || de || ate)
  const clearFilters = () => { setApp(''); setTipo(''); setStatus(''); setDe(''); setAte(''); setPage(0) }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const proxima = filtered.find(r => r.status === 'retido') ?? filtered[0] ?? null

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444' }}>
        Não foi possível carregar as próximas liberações.
        <button onClick={onRetry} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: colors.border, color: colors.text }}>Tentar novamente</button>
      </div>
    )
  }

  return (
    <div>
      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
        {apps.length > 1 && (
          <Field label="Aplicativo">
            <select value={app} onChange={e => { setApp(e.target.value); setPage(0) }} className={selectCls} style={selectStyle}>
              <option value="">Todos os aplicativos</option>
              {apps.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
        )}
        <Field label="Tipo">
          <select value={tipo} onChange={e => { setTipo(e.target.value as typeof tipo); setPage(0) }} className={selectCls} style={selectStyle}>
            <option value="">Retenção e reserva</option>
            <option value="retencao">Retenção</option>
            <option value="reserva">Reserva</option>
          </select>
        </Field>
        <Field label="Situação">
          <select value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(0) }} className={selectCls} style={selectStyle}>
            <option value="">Todas</option>
            <option value="retido">Em prazo</option>
            <option value="elegivel">Elegível</option>
          </select>
        </Field>
        <Field label="Previsto de">
          <input type="date" value={de} onChange={e => { setDe(e.target.value); setPage(0) }} className={selectCls} style={selectStyle} />
        </Field>
        <Field label="Previsto até">
          <input type="date" value={ate} onChange={e => { setAte(e.target.value); setPage(0) }} className={selectCls} style={selectStyle} />
        </Field>
        {isFiltered && (
          <button type="button" onClick={clearFilters} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={{ color: colors.primary }}>
            <X size={14} aria-hidden="true" />Limpar filtros
          </button>
        )}
      </div>

      {/* Resumo */}
      {!loading && proxima && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: colors.primary, background: `${colors.primary}0D`, color: colors.text }}>
          <CalendarClock size={16} style={{ color: colors.primary }} aria-hidden="true" />
          <strong>Próxima liberação prevista:</strong> {formatDateBR(proxima.release_date.slice(0, 10))} · {formatCurrencyBRL(proxima.net_amount)}
        </div>
      )}

      <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}</div>
        ) : filtered.length === 0 ? (
          isFiltered ? (
            <EmptyState icon={Inbox} title="Nenhum resultado encontrado" action={{ label: 'Limpar filtros', onClick: clearFilters }} />
          ) : (
            <EmptyState icon={Clock} title="Nenhuma liberação prevista" sub="Quando suas vendas gerarem valores em retenção ou reserva, você poderá acompanhar os prazos aqui." />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: colors.textSecondary }}>
                    <th className="pb-2 pr-3 font-semibold">Aplicativo</th>
                    <th className="pb-2 pr-3 font-semibold">Tipo</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Valor pendente</th>
                    <th className="pb-2 pr-3 font-semibold">Liberação prevista</th>
                    <th className="pb-2 pr-3 font-semibold">Tempo restante</th>
                    <th className="pb-2 pr-3 font-semibold">Situação</th>
                    <th className="pb-2 font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(r => {
                    const sit = situacao(r)
                    return (
                      <tr key={`${r.sale_id}-${r.tipo}`} className="border-t" style={{ borderColor: colors.border }}>
                        <td className="py-2.5 pr-3">
                          <p className="font-semibold" style={{ color: colors.text }}>{r.application_name}</p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>{r.plan_name}</p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: TIPO_COLOR[r.tipo], background: `${TIPO_COLOR[r.tipo]}1A` }}>{TIPO_LABEL[r.tipo]}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-semibold tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(r.net_amount)}</td>
                        <td className="py-2.5 pr-3" style={{ color: colors.textSecondary }}>{formatDateBR(r.release_date.slice(0, 10))}</td>
                        <td className="py-2.5 pr-3" style={{ color: r.status === 'elegivel' ? colors.primary : colors.text }}>
                          {r.status === 'elegivel'
                            ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} aria-hidden="true" />Disponível</span>
                            : formatCountdown(r.release_date)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: sit.color, background: `${sit.color}1A` }}>{sit.label}</span>
                        </td>
                        <td className="py-2.5">
                          <button type="button" onClick={() => setDetailId(r.sale_id)} className="text-xs font-semibold" style={{ color: colors.primary }}>Ver detalhes</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs" style={{ color: colors.textMuted }}>
              <span>{filtered.length} parcela{filtered.length === 1 ? '' : 's'} prevista{filtered.length === 1 ? '' : 's'}</span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded border px-2 py-1 disabled:opacity-40" style={{ borderColor: colors.border }}>Anterior</button>
                  <span>{page + 1} / {totalPages}</span>
                  <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="rounded border px-2 py-1 disabled:opacity-40" style={{ borderColor: colors.border }}>Próxima</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <p className="mt-3 text-xs" style={{ color: colors.textMuted }}>
        A liberação torna o valor elegível para entrar num repasse. Ela não confirma o recebimento bancário — acompanhe o status real em Histórico de repasses.
      </p>

      <VendaDetailDrawer saleId={detailId} partnerId={partnerId} onClose={() => setDetailId(null)} />
    </div>
  )
}

const selectCls = 'h-9 rounded-lg border px-3 text-sm'
const selectStyle = { borderColor: colors.border, color: colors.text, background: colors.card }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>{label}</label>
      {children}
    </div>
  )
}

function EmptyState({ icon: Icon, title, sub, action }: { icon: typeof Inbox; title: string; sub?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
      <p className="text-sm font-semibold" style={{ color: colors.text }}>{title}</p>
      {sub && <p className="max-w-sm text-xs" style={{ color: colors.textSecondary }}>{sub}</p>}
      {action && <button onClick={action.onClick} className="mt-1 text-sm font-semibold" style={{ color: colors.primary }}>{action.label}</button>}
    </div>
  )
}
