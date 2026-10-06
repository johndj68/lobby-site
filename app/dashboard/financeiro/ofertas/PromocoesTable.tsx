'use client'

import { useMemo, useState } from 'react'
import { Search, X, Inbox, Gift, Copy, AlertTriangle, Pencil } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { formatOfferPrice } from '@/lib/services/offers'
import { resolveRowStatus, indicatorBucket, hasPriceDrift, type EffectiveStatusKey } from './promotion-status'
import type { PromotionRow, PlanOption } from './types'

interface Props {
  rows: PromotionRow[]
  plans: PlanOption[]
  loading: boolean
  error: boolean
  activeBucket: 'em_analise' | 'agendadas' | 'ativas' | 'encerradas' | null
  onRetry: () => void
  onViewDetail: (id: string) => void
  onDuplicate: (row: PromotionRow) => void
  onEdit: (row: PromotionRow) => void
  onCancel: (row: PromotionRow) => void
  onCreateFirst: () => void
}

type SortKey = 'atualizadas' | 'inicio' | 'termino'

const STATUS_OPTIONS: { value: EffectiveStatusKey | ''; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'rascunho', label: 'Em análise' },
  { value: 'programada', label: 'Agendada' },
  { value: 'ativa', label: 'Ativa' },
  { value: 'pausada', label: 'Pausada' },
  { value: 'encerrada', label: 'Encerrada' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'rejeitada', label: 'Rejeitada' },
  { value: 'substituida', label: 'Substituída' },
]

export default function PromocoesTable({ rows, plans, loading, error, activeBucket, onRetry, onViewDetail, onDuplicate, onEdit, onCancel, onCreateFirst }: Props) {
  const [search, setSearch] = useState('')
  const [appFilter, setAppFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<EffectiveStatusKey | ''>('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [sort, setSort] = useState<SortKey>('atualizadas')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  const apps = useMemo(() => [...new Set(plans.map(p => p.appName))].sort(), [plans])

  const decorated = useMemo(() => rows.map(r => ({ row: r, status: resolveRowStatus(r, new Date()) })), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return decorated.filter(({ row, status }) => {
      if (activeBucket && indicatorBucket(status.key) !== activeBucket) return false
      if (statusFilter && status.key !== statusFilter) return false
      if (appFilter && row.appName !== appFilter) return false
      if (q && !`${row.appName} ${row.planName} ${row.name ?? ''}`.toLowerCase().includes(q)) return false
      // Vigência cruza o intervalo informado — não exige que a promoção
      // comece E termine dentro do período, só que se sobreponha a ele.
      if (periodFrom && row.endsAt.slice(0, 10) < periodFrom) return false
      if (periodTo && row.startsAt.slice(0, 10) > periodTo) return false
      return true
    })
  }, [decorated, activeBucket, statusFilter, appFilter, search, periodFrom, periodTo])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sort === 'atualizadas') arr.sort((a, b) => b.row.updatedAt.localeCompare(a.row.updatedAt))
    if (sort === 'inicio') arr.sort((a, b) => a.row.startsAt.localeCompare(b.row.startsAt))
    if (sort === 'termino') arr.sort((a, b) => a.row.endsAt.localeCompare(b.row.endsAt))
    return arr
  }, [filtered, sort])

  const isFiltered = !!(search || appFilter || statusFilter || periodFrom || periodTo || activeBucket)
  const clearFilters = () => { setSearch(''); setAppFilter(''); setStatusFilter(''); setPeriodFrom(''); setPeriodTo(''); setPage(0) }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageItems = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444' }}>
        Não foi possível carregar suas promoções agora.
        <button onClick={onRetry} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: colors.border, color: colors.text }}>Tentar novamente</button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Buscar</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: colors.textMuted }} aria-hidden="true" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder="Promoção, aplicativo ou plano"
              className="h-9 w-full rounded-lg border pl-8 pr-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }} />
          </div>
        </div>
        {apps.length > 1 && (
          <Field label="Aplicativo">
            <select value={appFilter} onChange={e => { setAppFilter(e.target.value); setPage(0) }} className={selectCls} style={selectStyle}>
              <option value="">Todos os aplicativos</option>
              {apps.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
        )}
        <Field label="Status">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as EffectiveStatusKey | ''); setPage(0) }} className={selectCls} style={selectStyle}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Vigência de">
          <input type="date" value={periodFrom} onChange={e => { setPeriodFrom(e.target.value); setPage(0) }} className={selectCls} style={selectStyle} />
        </Field>
        <Field label="Vigência até">
          <input type="date" value={periodTo} onChange={e => { setPeriodTo(e.target.value); setPage(0) }} className={selectCls} style={selectStyle} />
        </Field>
        <Field label="Ordenar por">
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className={selectCls} style={selectStyle}>
            <option value="atualizadas">Atualizadas recentemente</option>
            <option value="inicio">Início mais próximo</option>
            <option value="termino">Encerramento mais próximo</option>
          </select>
        </Field>
        {isFiltered && (
          <button type="button" onClick={clearFilters} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={{ color: colors.primary }}>
            <X size={14} aria-hidden="true" />Limpar filtros
          </button>
        )}
      </div>
      <p className="mb-3 text-xs" style={{ color: colors.textMuted }}>
        O filtro de vigência mostra promoções cujo período cruza o intervalo informado — não só as que começam e terminam dentro dele.
      </p>

      <div className="rounded-xl border" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}</div>
        ) : pageItems.length === 0 ? (
          isFiltered ? (
            <EmptyState icon={Inbox} title="Nenhuma promoção encontrada" action={{ label: 'Limpar filtros', onClick: clearFilters }} />
          ) : rows.length === 0 ? (
            <EmptyState icon={Gift} title="Crie sua primeira promoção" sub="Escolha um plano, defina o desconto e envie para análise da LOBBY." action={{ label: 'Criar promoção', onClick: onCreateFirst }} />
          ) : (
            <EmptyState icon={Inbox} title="Nenhuma promoção encontrada" action={{ label: 'Limpar filtros', onClick: clearFilters }} />
          )
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: colors.textSecondary }}>
                    <th className="px-4 pb-2 pt-4 font-semibold">Promoção / aplicativo</th>
                    <th className="px-4 pb-2 pt-4 font-semibold">Plano</th>
                    <th className="px-4 pb-2 pt-4 text-right font-semibold">Preço ref.</th>
                    <th className="px-4 pb-2 pt-4 text-right font-semibold">Preço promo.</th>
                    <th className="px-4 pb-2 pt-4 text-right font-semibold">Desconto</th>
                    <th className="px-4 pb-2 pt-4 font-semibold">Vigência</th>
                    <th className="px-4 pb-2 pt-4 font-semibold">Status</th>
                    <th className="px-4 pb-2 pt-4 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(({ row, status }) => (
                    <Row key={row.id} row={row} status={status} onViewDetail={onViewDetail} onDuplicate={onDuplicate} onEdit={onEdit} onCancel={onCancel} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="flex flex-col gap-2 p-3 md:hidden">
              {pageItems.map(({ row, status }) => (
                <MobileCard key={row.id} row={row} status={status} onViewDetail={onViewDetail} onDuplicate={onDuplicate} onEdit={onEdit} onCancel={onCancel} />
              ))}
            </div>

            <div className="flex items-center justify-between border-t p-3 text-xs" style={{ borderColor: colors.border, color: colors.textMuted }}>
              <span>{sorted.length} promoçõe{sorted.length === 1 ? '' : 's'}</span>
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
    </div>
  )
}

function vigenciaLabel(row: PromotionRow): string {
  const d = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
  return `${d(row.startsAt)} → ${d(row.endsAt)}`
}

function actionsFor(row: PromotionRow, status: { key: EffectiveStatusKey }): { label: string; kind: 'duplicate' | 'cancel' | 'edit' }[] {
  const actions: { label: string; kind: 'duplicate' | 'cancel' | 'edit' }[] = []
  if (status.key === 'rascunho') actions.push({ label: 'Cancelar pedido', kind: 'cancel' })
  if (status.key === 'programada') actions.push({ label: 'Cancelar promoção agendada', kind: 'cancel' })
  // Editar só faz sentido pra uma promoção que JÁ foi aprovada e ainda
  // está valendo (vira nova versão — a atual continua até ser aprovada).
  if (status.key === 'ativa' || status.key === 'programada' || status.key === 'pausada') {
    actions.push({ label: 'Editar promoção', kind: 'edit' })
  }
  if (status.key === 'rejeitada') actions.push({ label: 'Corrigir e reenviar', kind: 'duplicate' })
  else actions.push({ label: 'Duplicar como rascunho', kind: 'duplicate' })
  return actions
}

function DriftBadge({ row }: { row: PromotionRow }) {
  if (!hasPriceDrift(row)) return null
  return (
    <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#F59E0B' }} title={`Preço do plano mudou: era ${row.originalPrice}, hoje é ${row.planCurrentPrice}`}>
      <AlertTriangle size={11} aria-hidden="true" />Preço do plano mudou
    </span>
  )
}

function runAction(kind: 'duplicate' | 'cancel' | 'edit', row: PromotionRow, handlers: { onDuplicate: (r: PromotionRow) => void; onEdit: (r: PromotionRow) => void; onCancel: (r: PromotionRow) => void }) {
  if (kind === 'cancel') handlers.onCancel(row)
  else if (kind === 'edit') handlers.onEdit(row)
  else handlers.onDuplicate(row)
}

function Row({ row, status, onViewDetail, onDuplicate, onEdit, onCancel }: { row: PromotionRow; status: { key: EffectiveStatusKey; label: string; color: string; bg: string }; onViewDetail: (id: string) => void; onDuplicate: (row: PromotionRow) => void; onEdit: (row: PromotionRow) => void; onCancel: (row: PromotionRow) => void }) {
  const historical = status.key === 'encerrada' || status.key === 'cancelada' || status.key === 'rejeitada' || status.key === 'substituida'
  return (
    <tr className="border-t align-top" style={{ borderColor: colors.border }}>
      <td className="px-4 py-3">
        <p className="font-semibold" style={{ color: colors.text }}>{row.name || 'Promoção sem nome'}</p>
        <p className="text-xs" style={{ color: colors.textSecondary }}>{row.appName}</p>
        <DriftBadge row={row} />
      </td>
      <td className="px-4 py-3" style={{ color: colors.textSecondary }}>{row.planName}</td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ color: colors.textSecondary }}>
        {row.originalPrice != null ? formatOfferPrice(row.originalPrice, row.currency, row.billingPeriod) : '—'}
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: colors.text }}>
        {formatOfferPrice(row.promoPrice, row.currency, row.billingPeriod)}
        {historical && <span className="ml-1 text-[10px] font-normal" style={{ color: colors.textMuted }}>(histórico)</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ color: '#10B981' }}>{row.discountPercentage != null ? `-${row.discountPercentage}%` : '—'}</td>
      <td className="px-4 py-3" style={{ color: colors.textSecondary }}>{vigenciaLabel(row)}</td>
      <td className="px-4 py-3">
        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: status.color, background: status.bg }}>{status.label}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <button type="button" onClick={() => onViewDetail(row.id)} className="text-xs font-semibold" style={{ color: colors.primary }}>Ver detalhes</button>
          {actionsFor(row, status).map(a => (
            <button key={a.label} type="button" onClick={() => runAction(a.kind, row, { onDuplicate, onEdit, onCancel })} className="text-xs font-semibold" style={{ color: a.kind === 'cancel' ? '#EF4444' : colors.textSecondary }}>
              {a.kind === 'duplicate' && <Copy size={11} className="mr-1 inline" aria-hidden="true" />}
              {a.kind === 'edit' && <Pencil size={11} className="mr-1 inline" aria-hidden="true" />}
              {a.label}
            </button>
          ))}
        </div>
      </td>
    </tr>
  )
}

function MobileCard({ row, status, onViewDetail, onDuplicate, onEdit, onCancel }: { row: PromotionRow; status: { key: EffectiveStatusKey; label: string; color: string; bg: string }; onViewDetail: (id: string) => void; onDuplicate: (row: PromotionRow) => void; onEdit: (row: PromotionRow) => void; onCancel: (row: PromotionRow) => void }) {
  const historical = status.key === 'encerrada' || status.key === 'cancelada' || status.key === 'rejeitada' || status.key === 'substituida'
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: colors.border }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: colors.text }}>{row.name || 'Promoção sem nome'}</p>
          <p className="text-xs" style={{ color: colors.textSecondary }}>{row.appName} — {row.planName}</p>
          <DriftBadge row={row} />
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: status.color, background: status.bg }}>{status.label}</span>
      </div>
      <p className="mt-2 text-sm" style={{ color: colors.text }}>
        {row.originalPrice != null && <span className="line-through" style={{ color: colors.textMuted }}>{formatOfferPrice(row.originalPrice, row.currency, row.billingPeriod)}</span>} {' '}
        <strong>{formatOfferPrice(row.promoPrice, row.currency, row.billingPeriod)}</strong>{row.discountPercentage != null && ` (-${row.discountPercentage}%)`}
        {historical && <span className="ml-1 text-[10px]" style={{ color: colors.textMuted }}>(histórico)</span>}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>{vigenciaLabel(row)}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" onClick={() => onViewDetail(row.id)} className="text-xs font-semibold" style={{ color: colors.primary }}>Ver detalhes</button>
        {actionsFor(row, status).map(a => (
          <button key={a.label} type="button" onClick={() => runAction(a.kind, row, { onDuplicate, onEdit, onCancel })} className="text-xs font-semibold" style={{ color: a.kind === 'cancel' ? '#EF4444' : colors.textSecondary }}>{a.label}</button>
        ))}
      </div>
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
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Icon size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
      <p className="text-sm font-semibold" style={{ color: colors.text }}>{title}</p>
      {sub && <p className="max-w-sm text-xs" style={{ color: colors.textSecondary }}>{sub}</p>}
      {action && (
        <button type="button" onClick={action.onClick} className="mt-1 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: colors.primary }}>
          {action.label}
        </button>
      )}
    </div>
  )
}
