'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Inbox, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL } from '@/lib/finance'
import VendaDetailDrawer from '../vendas/VendaDetailDrawer'

export interface StatementRow {
  event_at:               string
  tipo:                   string
  descricao:              string
  application_id:         string | null
  application_name:       string | null
  referencia:             string
  sale_id:                string | null
  valor:                  number
  saldo_disponivel_delta: number
  saldo_disponivel_apos:  number
  situacao:               string
}

export interface ExtratoFilters {
  app: string
  tipo: string
  de: string
  ate: string
  page: number
}

export const EXTRATO_DEFAULTS: ExtratoFilters = { app: '', tipo: '', de: '', ate: '', page: 0 }

const TIPO_LABEL: Record<string, string> = {
  venda_confirmada: 'Venda confirmada',
  reserva_constituida: 'Constituição de reserva',
  liberacao_retencao: 'Liberação de retenção',
  reembolso: 'Reembolso',
  reserva_perdida_disputa: 'Reserva perdida em disputa',
  repasse_concluido: 'Repasse concluído',
  repasse_revertido: 'Repasse revertido/devolução',
}

const SITUACAO_LABEL: Record<string, string> = {
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  revertido: 'Revertido',
}

const PAGE_SIZE = 20

interface Props {
  partnerId: string | null
  apps:      { application_id: string; application_name: string }[]
  filters:   ExtratoFilters
  onFiltersChange: (f: Partial<ExtratoFilters>) => void
}

export default function ExtratoTab({ partnerId, apps, filters, onFiltersChange }: Props) {
  const [rows, setRows] = useState<StatementRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [origemSaleId, setOrigemSaleId] = useState<string | null>(null)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    const supabase = createClient()
    const baseParams = {
      p_partner_id: partnerId,
      p_application_id: filters.app || null,
      p_tipo: filters.tipo || null,
      p_date_from: filters.de ? `${filters.de}T00:00:00` : null,
      p_date_to: filters.ate ? `${filters.ate}T23:59:59` : null,
    }
    const [rowsRes, countRes] = await Promise.all([
      supabase.rpc('get_partner_statement', { ...baseParams, p_limit: PAGE_SIZE, p_offset: filters.page * PAGE_SIZE }),
      supabase.rpc('get_partner_statement_count', baseParams),
    ]) as unknown as [{ data: StatementRow[] | null; error: unknown }, { data: number | null; error: unknown }]
    if (id !== reqId.current) return
    setError(!!rowsRes.error || !!countRes.error)
    setRows(rowsRes.error ? [] : (rowsRes.data ?? []))
    setTotal(countRes.error ? 0 : (countRes.data ?? 0))
    setLoading(false)
    setHasLoaded(true)
  }, [partnerId, filters])

  useEffect(() => { load() }, [load])

  const isFiltered = !!(filters.app || filters.tipo || filters.de || filters.ate)
  const clearFilters = () => onFiltersChange({ ...EXTRATO_DEFAULTS })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
        {apps.length > 1 && (
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Aplicativo</label>
            <select value={filters.app} onChange={e => onFiltersChange({ app: e.target.value, page: 0 })} className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }}>
              <option value="">Todos os aplicativos</option>
              {apps.map(a => <option key={a.application_id} value={a.application_id}>{a.application_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Tipo de movimentação</label>
          <select value={filters.tipo} onChange={e => onFiltersChange({ tipo: e.target.value, page: 0 })} className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>De</label>
          <input type="date" value={filters.de} onChange={e => onFiltersChange({ de: e.target.value, page: 0 })} className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Até</label>
          <input type="date" value={filters.ate} onChange={e => onFiltersChange({ ate: e.target.value, page: 0 })} className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }} />
        </div>
        {isFiltered && (
          <button type="button" onClick={clearFilters} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={{ color: colors.primary }}>
            <X size={14} aria-hidden="true" />Limpar filtros
          </button>
        )}
      </div>

      {(filters.app || filters.tipo) && (
        <p className="mb-3 text-xs" style={{ color: colors.textMuted }}>
          Extrato filtrado — o saldo disponível em cada linha é o saldo real da sua conta, calculado sobre todo o histórico (filtrar não gera um saldo próprio deste recorte).
        </p>
      )}

      <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
        {error ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            Não foi possível carregar o extrato.
            <button onClick={() => load()} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: colors.border, color: colors.text }}>Tentar novamente</button>
          </div>
        ) : loading && !hasLoaded ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}</div>
        ) : rows.length === 0 ? (
          isFiltered ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
              <p className="text-sm font-semibold" style={{ color: colors.text }}>Nenhum resultado encontrado</p>
              <button onClick={clearFilters} className="mt-1 text-sm font-semibold" style={{ color: colors.primary }}>Limpar filtros</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
              <p className="text-sm font-semibold" style={{ color: colors.text }}>Seu extrato ainda não tem movimentações</p>
            </div>
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: colors.textSecondary }}>
                    <th className="pb-2 pr-3 font-semibold">Data</th>
                    <th className="pb-2 pr-3 font-semibold">Tipo</th>
                    <th className="pb-2 pr-3 font-semibold">Descrição</th>
                    <th className="pb-2 pr-3 font-semibold">Aplicativo</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Valor</th>
                    <th className="pb-2 pr-3 font-semibold">Saldo disponível após</th>
                    <th className="pb-2 pr-3 font-semibold">Situação</th>
                    <th className="pb-2 font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={`${r.event_at}-${r.tipo}-${r.referencia}-${idx}`} className="border-t" style={{ borderColor: colors.border }}>
                      <td className="py-2 pr-3 whitespace-nowrap" style={{ color: colors.textSecondary }}>
                        {new Date(r.event_at).toLocaleDateString('pt-BR')} {new Date(r.event_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap" style={{ color: colors.textSecondary }}>{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                      <td className="py-2 pr-3" style={{ color: colors.text }}>{r.descricao}</td>
                      <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{r.application_name ?? '—'}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums" style={{ color: r.valor < 0 ? '#EF4444' : colors.text }}>
                        {r.valor < 0 ? '−' : ''}{formatCurrencyBRL(Math.abs(r.valor))}
                      </td>
                      <td className="py-2 pr-3 tabular-nums" style={{ color: colors.textSecondary }}>
                        {r.saldo_disponivel_delta === 0 ? <span title="Este evento não altera o saldo disponível">—</span> : formatCurrencyBRL(r.saldo_disponivel_apos)}
                      </td>
                      <td className="py-2 pr-3" style={{ color: colors.textSecondary }}>{SITUACAO_LABEL[r.situacao] ?? r.situacao}</td>
                      <td className="py-2">
                        {r.sale_id ? (
                          <button type="button" onClick={() => setOrigemSaleId(r.sale_id)} className="text-xs font-semibold" style={{ color: colors.primary }}>Ver origem</button>
                        ) : (
                          <span className="text-xs" style={{ color: colors.textMuted }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs" style={{ color: colors.textMuted }}>
              <span>{total} evento{total === 1 ? '' : 's'}</span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button disabled={filters.page === 0} onClick={() => onFiltersChange({ page: filters.page - 1 })} className="rounded border px-2 py-1 disabled:opacity-40" style={{ borderColor: colors.border }}>Anterior</button>
                  <span>{filters.page + 1} / {totalPages}</span>
                  <button disabled={filters.page >= totalPages - 1} onClick={() => onFiltersChange({ page: filters.page + 1 })} className="rounded border px-2 py-1 disabled:opacity-40" style={{ borderColor: colors.border }}>Próxima</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px]" style={{ color: colors.textMuted }}>
        &quot;—&quot; na coluna de saldo significa que este evento não movimenta o saldo disponível (ex.: constituição de reserva, ou liberação de reserva, que vai direto da reserva para o repasse).
      </p>

      <VendaDetailDrawer saleId={origemSaleId} partnerId={partnerId} onClose={() => setOrigemSaleId(null)} />
    </div>
  )
}
