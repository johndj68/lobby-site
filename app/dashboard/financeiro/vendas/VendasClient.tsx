'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  RefreshCw, Download, Search, X, CheckCircle2, Clock, RotateCcw, Inbox, ShoppingBag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import { resolvePeriodoRange, type PeriodoPreset } from '@/lib/services/financeiro-periodo'
import AppLogo from '@/components/admin/AppLogo'
import Pagination from '@/components/ui/Pagination'
import VendaDetailDrawer from './VendaDetailDrawer'

const PAGE_SIZE = 20

type VendasPeriodo = 'todos' | PeriodoPreset
type SortOption = 'recent' | 'oldest' | 'highest' | 'lowest'
type PaymentStatus = 'confirmado' | 'parcialmente_reembolsado' | 'reembolsado'
type PayoutStatus = 'retido' | 'elegivel' | 'parcialmente_repassado' | 'repassado'

export interface SaleRow {
  sale_id:           string
  sale_kind:         'app_purchase' | 'subscription_invoice'
  application_id:    string | null
  application_name:  string
  logo_url:          string | null
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
  payment_status:    PaymentStatus
  payout_status:     PayoutStatus
}

interface ResumoRow {
  vendas_confirmadas_qtd: number
  valor_vendido:          number
  participacao_valor:     number
  reembolsos_valor:       number
  reembolsos_qtd:         number
}

const EMPTY_RESUMO: ResumoRow = { vendas_confirmadas_qtd: 0, valor_vendido: 0, participacao_valor: 0, reembolsos_valor: 0, reembolsos_qtd: 0 }

interface SoldApp { application_id: string; application_name: string }
interface PlanOption { plan_id: string; plan_name: string }

const PERIODO_OPTIONS: { value: VendasPeriodo; label: string }[] = [
  { value: 'todos', label: 'Todo o período' },
  { value: 'este_mes', label: 'Este mês' },
  { value: 'mes_anterior', label: 'Mês anterior' },
  { value: 'ultimos_30_dias', label: 'Últimos 30 dias' },
  { value: 'personalizado', label: 'Personalizado' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigas' },
  { value: 'highest', label: 'Maior valor' },
  { value: 'lowest', label: 'Menor valor' },
]

const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  confirmado:                { label: 'Confirmado',               color: '#10B981', Icon: CheckCircle2 },
  parcialmente_reembolsado:  { label: 'Parcialmente reembolsado', color: '#F59E0B', Icon: RotateCcw },
  reembolsado:               { label: 'Reembolsado',              color: '#EF4444', Icon: RotateCcw },
}

const PAYOUT_STATUS_META: Record<PayoutStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  retido:                  { label: 'Retido',                  color: '#F59E0B', Icon: Clock },
  elegivel:                { label: 'Elegível',                color: colors.primary, Icon: CheckCircle2 },
  parcialmente_repassado:  { label: 'Parcialmente repassado',  color: '#6D28D9', Icon: Clock },
  repassado:                { label: 'Repassado',               color: '#10B981', Icon: CheckCircle2 },
}

interface FiltersState {
  app:      string
  plan:     string
  periodo:  VendasPeriodo
  de:       string
  ate:      string
  pagamento: '' | PaymentStatus
  repasse:   '' | PayoutStatus
  busca:    string
  ordenar:  SortOption
  page:     number
  venda:    string | null
}

const DEFAULTS: Omit<FiltersState, 'page' | 'venda'> = {
  app: '', plan: '', periodo: 'todos', de: '', ate: '', pagamento: '', repasse: '', busca: '', ordenar: 'recent',
}

interface Props {
  soldApps:      SoldApp[]
  partnerId:     string | null
  emptyStateCta: { label: string; href: string }
}

export default function VendasClient({ soldApps, partnerId, emptyStateCta }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [filters, setFiltersState] = useState<FiltersState>(() => ({
    app:       searchParams.get('app') || '',
    plan:      searchParams.get('plano') || '',
    periodo:   (searchParams.get('periodo') as VendasPeriodo) || 'todos',
    de:        searchParams.get('de') || '',
    ate:       searchParams.get('ate') || '',
    pagamento: (searchParams.get('pagamento') as PaymentStatus) || '',
    repasse:   (searchParams.get('repasse') as PayoutStatus) || '',
    busca:     searchParams.get('busca') || '',
    ordenar:   (searchParams.get('ordenar') as SortOption) || 'recent',
    page:      Number(searchParams.get('page') || '0') || 0,
    venda:     searchParams.get('venda'),
  }))
  const [searchInput, setSearchInput] = useState(filters.busca)

  function setFilters(patch: Partial<FiltersState>) {
    const next: FiltersState = { ...filters, ...patch, page: patch.page !== undefined ? patch.page : 0 }
    setFiltersState(next)
    const params = new URLSearchParams()
    if (next.app) params.set('app', next.app)
    if (next.plan) params.set('plano', next.plan)
    if (next.periodo !== 'todos') params.set('periodo', next.periodo)
    if (next.periodo === 'personalizado' && next.de) params.set('de', next.de)
    if (next.periodo === 'personalizado' && next.ate) params.set('ate', next.ate)
    if (next.pagamento) params.set('pagamento', next.pagamento)
    if (next.repasse) params.set('repasse', next.repasse)
    if (next.busca) params.set('busca', next.busca)
    if (next.ordenar !== 'recent') params.set('ordenar', next.ordenar)
    if (next.page) params.set('page', String(next.page))
    if (next.venda) params.set('venda', next.venda)
    if (partnerId) params.set('parceiro', partnerId)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // Busca com debounce — não dispara uma consulta por tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.busca) setFilters({ busca: searchInput })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const isFiltered = filters.app !== DEFAULTS.app || filters.plan !== DEFAULTS.plan || filters.periodo !== DEFAULTS.periodo
    || filters.pagamento !== DEFAULTS.pagamento || filters.repasse !== DEFAULTS.repasse || filters.busca !== DEFAULTS.busca

  const clearFilters = () => { setSearchInput(''); setFilters({ ...DEFAULTS, page: 0 }) }

  const range = useMemo(() => {
    if (filters.periodo === 'todos') return { from: null as string | null, to: null as string | null }
    const r = resolvePeriodoRange(filters.periodo, filters.de, filters.ate)
    return { from: r.from, to: r.to }
  }, [filters.periodo, filters.de, filters.ate])

  // Opções de plano — só pro app selecionado, carregadas à parte (não
  // precisa recarregar a cada troca de outro filtro).
  const [plans, setPlans] = useState<PlanOption[]>([])
  useEffect(() => {
    if (!filters.app) { setPlans([]); return }
    let cancelled = false
    const supabase = createClient()
    supabase.rpc('get_partner_sale_plans', { p_application_id: filters.app, p_partner_id: partnerId })
      .then(({ data }: { data: PlanOption[] | null }) => { if (!cancelled) setPlans(data ?? []) })
    return () => { cancelled = true }
  }, [filters.app, partnerId])

  const [sales, setSales] = useState<SaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [resumo, setResumo] = useState<ResumoRow>(EMPTY_RESUMO)
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(false)
  const [cardsError, setCardsError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    if (filters.periodo === 'personalizado' && (!filters.de || !filters.ate)) { setLoading(false); return }
    const id = ++reqId.current
    setLoading(true)
    const supabase = createClient()
    const baseParams = {
      p_application_id: filters.app || null,
      p_partner_id: partnerId,
      p_plan_id: filters.plan || null,
      p_date_from: range.from,
      p_date_to: range.to,
      p_payment_status: filters.pagamento || null,
      p_payout_status: filters.repasse || null,
      p_search: filters.busca || null,
    }
    const [salesRes, countRes, resumoRes] = await Promise.all([
      supabase.rpc('get_partner_sales', { ...baseParams, p_limit: PAGE_SIZE, p_offset: filters.page * PAGE_SIZE, p_sort: filters.ordenar }),
      supabase.rpc('get_partner_sales_count', baseParams),
      supabase.rpc('get_partner_vendas_resumo', baseParams),
    ]) as unknown as [
      { data: SaleRow[] | null; error: unknown },
      { data: number | null; error: unknown },
      { data: ResumoRow[] | null; error: unknown },
    ]

    if (id !== reqId.current) return

    setTableError(!!salesRes.error || !!countRes.error)
    setSales(salesRes.error ? [] : (salesRes.data ?? []))
    setTotal(countRes.error ? 0 : (countRes.data ?? 0))
    setCardsError(!!resumoRes.error)
    setResumo(resumoRes.data?.[0] ?? EMPTY_RESUMO)

    if (!salesRes.error && !countRes.error && !resumoRes.error) setLastUpdated(new Date())
    setLoading(false)
    setHasLoaded(true)
  }, [filters.app, filters.plan, filters.pagamento, filters.repasse, filters.busca, filters.ordenar, filters.page, filters.periodo, filters.de, filters.ate, range, partnerId])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const cards = [
    {
      label: 'Vendas confirmadas', value: formatPlain(resumo.vendas_confirmadas_qtd),
      sub: 'venda(s)/item(ns) do parceiro com pagamento confirmado.', color: colors.text, isCurrency: false,
    },
    {
      label: 'Valor vendido', value: resumo.valor_vendido,
      sub: 'Pago pelos seus itens, após descontos e antes de reembolsos.', color: colors.text, isCurrency: true,
    },
    {
      label: 'Sua participação', value: resumo.participacao_valor,
      sub: 'Não significa saldo disponível — veja Repasses e extrato.', color: colors.primary, isCurrency: true,
    },
    {
      label: 'Reembolsos dessas vendas', value: resumo.reembolsos_valor,
      sub: `${resumo.reembolsos_qtd} reembolso${resumo.reembolsos_qtd === 1 ? '' : 's'} concluído(s).`, color: '#EF4444', isCurrency: true,
    },
  ]

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (filters.app) params.set('application_id', filters.app)
    if (filters.plan) params.set('plan_id', filters.plan)
    if (filters.pagamento) params.set('pagamento', filters.pagamento)
    if (filters.repasse) params.set('repasse', filters.repasse)
    if (filters.busca) params.set('busca', filters.busca)
    if (range.from) params.set('from_iso', range.from)
    if (range.to) params.set('to_iso', range.to)
    if (partnerId) params.set('parceiro', partnerId)
    return `/api/financeiro/vendas/export?${params.toString()}`
  }, [filters.app, filters.plan, filters.pagamento, filters.repasse, filters.busca, range, partnerId])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: colors.text }}>Suas vendas</h2>
          <p className="mt-0.5 text-sm" style={{ color: colors.textSecondary }}>
            Consulte as vendas dos seus aplicativos e acompanhe os valores de cada operação.
          </p>
          {lastUpdated && (
            <p className="mt-1 text-xs" style={{ color: colors.textMuted }}>
              Última atualização: {formatDateBR(lastUpdated.toISOString().slice(0, 10))} {lastUpdated.toTimeString().slice(0, 5)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={exportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
            style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
          >
            <Download size={13} aria-hidden="true" />
            Exportar vendas
          </a>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Indicadores */}
      {cardsError ? (
        <div className="mb-5 flex items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444', color: colors.text }}>
          Não foi possível carregar os indicadores.
          <button onClick={() => load()} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(c => (
            <div key={c.label} className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
              <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>{c.label}</p>
              {loading && !hasLoaded ? (
                <div className="mt-2 h-6 w-20 animate-pulse rounded" style={{ background: colors.borderLight }} />
              ) : (
                <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: c.color }}>
                  {c.isCurrency ? formatCurrencyBRL(c.value as number) : c.value}
                </p>
              )}
              <p className="mt-1 text-[11px]" style={{ color: colors.textMuted }}>{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
        <div className="min-w-[200px] flex-1">
          <label htmlFor="vendas-busca" className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Buscar</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: colors.textMuted }} aria-hidden="true" />
            <input
              id="vendas-busca"
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Referência da venda ou nome do app"
              className="h-9 w-full rounded-lg border pl-8 pr-3 text-sm"
              style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
            />
          </div>
        </div>

        <div>
          <label htmlFor="vendas-periodo" className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Período</label>
          <select
            id="vendas-periodo"
            value={filters.periodo}
            onChange={e => setFilters({ periodo: e.target.value as VendasPeriodo })}
            className="h-9 rounded-lg border px-3 text-sm"
            style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
          >
            {PERIODO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {filters.periodo === 'personalizado' && (
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="vendas-de" className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>De</label>
              <input id="vendas-de" type="date" value={filters.de} onChange={e => setFilters({ de: e.target.value })}
                className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }} />
            </div>
            <div>
              <label htmlFor="vendas-ate" className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Até</label>
              <input id="vendas-ate" type="date" value={filters.ate} onChange={e => setFilters({ ate: e.target.value })}
                className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }} />
            </div>
          </div>
        )}

        {soldApps.length > 1 && (
          <div>
            <label htmlFor="vendas-app" className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Aplicativo</label>
            <select
              id="vendas-app"
              value={filters.app}
              onChange={e => setFilters({ app: e.target.value, plan: '' })}
              className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
            >
              <option value="">Todos os apps</option>
              {soldApps.map(a => <option key={a.application_id} value={a.application_id}>{a.application_name}</option>)}
            </select>
          </div>
        )}

        {filters.app && plans.length > 1 && (
          <div>
            <label htmlFor="vendas-plano" className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Plano</label>
            <select
              id="vendas-plano"
              value={filters.plan}
              onChange={e => setFilters({ plan: e.target.value })}
              className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
            >
              <option value="">Todos os planos</option>
              {plans.map(p => <option key={p.plan_id} value={p.plan_id}>{p.plan_name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="vendas-pagamento" className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Pagamento</label>
          <select
            id="vendas-pagamento"
            value={filters.pagamento}
            onChange={e => setFilters({ pagamento: e.target.value as PaymentStatus | '' })}
            className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
          >
            <option value="">Todos</option>
            {(Object.keys(PAYMENT_STATUS_META) as PaymentStatus[]).map(k => <option key={k} value={k}>{PAYMENT_STATUS_META[k].label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="vendas-repasse" className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Repasse</label>
          <select
            id="vendas-repasse"
            value={filters.repasse}
            onChange={e => setFilters({ repasse: e.target.value as PayoutStatus | '' })}
            className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
          >
            <option value="">Todos</option>
            {(Object.keys(PAYOUT_STATUS_META) as PayoutStatus[]).map(k => <option key={k} value={k}>{PAYOUT_STATUS_META[k].label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="vendas-ordenar" className="mb-1 block text-xs font-semibold" style={{ color: colors.textSecondary }}>Ordenar</label>
          <select
            id="vendas-ordenar"
            value={filters.ordenar}
            onChange={e => setFilters({ ordenar: e.target.value as SortOption })}
            className="h-9 rounded-lg border px-3 text-sm" style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
            style={{ color: colors.primary }}
          >
            <X size={14} aria-hidden="true" />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold" style={{ color: colors.text }}>Histórico de vendas</h3>
          {!loading && !tableError && <span className="text-xs" style={{ color: colors.textMuted }}>{total} resultado{total === 1 ? '' : 's'}</span>}
        </div>

        {loading && !hasLoaded ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}
          </div>
        ) : tableError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm" style={{ color: colors.textSecondary }}>Não foi possível carregar as vendas. Tente novamente.</p>
            <button onClick={() => load()} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
              Tentar novamente
            </button>
          </div>
        ) : sales.length === 0 ? (
          isFiltered ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
              <p className="text-sm font-semibold" style={{ color: colors.text }}>Nenhuma venda encontrada</p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Tente outro período ou ajuste os filtros.</p>
              <button onClick={clearFilters} className="mt-1 text-sm font-semibold" style={{ color: colors.primary }}>Limpar filtros</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ShoppingBag size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
              <p className="text-sm font-semibold" style={{ color: colors.text }}>Suas vendas vão aparecer aqui</p>
              <p className="max-w-sm text-xs" style={{ color: colors.textSecondary }}>
                Quando uma compra for confirmada, você poderá acompanhar os valores, os detalhes e a situação do repasse nesta página.
              </p>
              <Link href={emptyStateCta.href} className="mt-1 text-sm font-semibold" style={{ color: colors.primary }}>{emptyStateCta.label} →</Link>
            </div>
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: colors.textSecondary }}>
                    <th scope="col" className="pb-2 pr-3 font-semibold">Venda</th>
                    <th scope="col" className="pb-2 pr-3 font-semibold">Aplicativo</th>
                    <th scope="col" className="pb-2 pr-3 font-semibold">Data</th>
                    <th scope="col" className="pb-2 pr-3 text-right font-semibold">Valor pago</th>
                    <th scope="col" className="pb-2 pr-3 text-right font-semibold">Sua participação</th>
                    <th scope="col" className="pb-2 pr-3 font-semibold">Pagamento</th>
                    <th scope="col" className="pb-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(sale => {
                    const pay = PAYMENT_STATUS_META[sale.payment_status]
                    const shortRef = sale.sale_id.slice(-8).toUpperCase()
                    return (
                      <tr key={sale.sale_id} className="border-t" style={{ borderColor: colors.border }}>
                        <td className="py-2.5 pr-3 font-mono text-xs" style={{ color: colors.text }}>#{shortRef}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <AppLogo url={sale.logo_url} size={28} theme="light" />
                            <div>
                              <p className="font-semibold" style={{ color: colors.text }}>{sale.application_name}</p>
                              <p className="text-xs" style={{ color: colors.textSecondary }}>{sale.plan_name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3" style={{ color: colors.textSecondary }}>{formatDateBR(sale.paid_at?.slice(0, 10))}</td>
                        <td className="py-2.5 pr-3 text-right font-semibold tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(sale.amount)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums" style={{ color: colors.text }}>{formatCurrencyBRL(sale.partner_amount)}</td>
                        <td className="py-2.5 pr-3">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: pay.color, background: `${pay.color}1A` }}>
                            <pay.Icon size={11} aria-hidden="true" />
                            {pay.label}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => setFilters({ venda: sale.sale_id })}
                            className="text-xs font-semibold"
                            style={{ color: colors.primary }}
                          >
                            Ver detalhes
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <Pagination page={filters.page} totalPages={totalPages} onPageChange={p => setFilters({ page: p })} />
            </div>
          </>
        )}
      </div>

      <VendaDetailDrawer
        saleId={filters.venda}
        partnerId={partnerId}
        onClose={() => setFilters({ venda: null })}
      />
    </div>
  )
}

function formatPlain(n: number): string {
  return n.toLocaleString('pt-BR')
}
