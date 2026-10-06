'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { formatDateBR } from '@/lib/finance'
import SaldosAtuais, { type OverviewRow, type PendenciasRow } from './SaldosAtuais'
import ProximasLiberacoesTab, { type QueueRow } from './ProximasLiberacoesTab'
import HistoricoRepassesTab, { type HistoryRow } from './HistoricoRepassesTab'
import ExtratoTab, { EXTRATO_DEFAULTS, type ExtratoFilters } from './ExtratoTab'
import EntendaSeusValores from './EntendaSeusValores'
import ContaRecebimentoCard, { type DestinationRow } from './ContaRecebimentoCard'

type QueueApiRow = Omit<QueueRow, 'tipo'>

const isPermissionDenied = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'message' in err &&
  typeof (err as { message: unknown }).message === 'string' &&
  (err as { message: string }).message.includes('Sem permissão')

const TABS = [
  { key: 'liberacoes', label: 'Próximas liberações' },
  { key: 'historico', label: 'Histórico de repasses' },
  { key: 'extrato', label: 'Extrato de movimentações' },
] as const
type TabKey = typeof TABS[number]['key']

interface Props { partnerId: string | null }

export default function RepassesClient({ partnerId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const parceiroQuery = partnerId ? `&parceiro=${partnerId}` : ''

  const aba = (searchParams.get('aba') as TabKey) || 'liberacoes'
  const setAba = (k: TabKey) => router.push(`${pathname}?aba=${k}${parceiroQuery}`, { scroll: false })

  const [extratoFilters, setExtratoFiltersState] = useState<ExtratoFilters>(EXTRATO_DEFAULTS)
  const setExtratoFilters = (patch: Partial<ExtratoFilters>) => setExtratoFiltersState(prev => ({ ...prev, ...patch }))

  const [overview, setOverview] = useState<OverviewRow | null>(null)
  const [overviewError, setOverviewError] = useState(false)
  const [pendencias, setPendencias] = useState<PendenciasRow | null>(null)
  const [queueMain, setQueueMain] = useState<QueueApiRow[]>([])
  const [queueReserve, setQueueReserve] = useState<QueueApiRow[]>([])
  const [queueError, setQueueError] = useState(false)
  const [queuePermissionDenied, setQueuePermissionDenied] = useState(false)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyError, setHistoryError] = useState(false)
  const [historyPermissionDenied, setHistoryPermissionDenied] = useState(false)
  const [destination, setDestination] = useState<DestinationRow | null>(null)
  const [destinationPermissionDenied, setDestinationPermissionDenied] = useState(false)
  const [apps, setApps] = useState<{ application_id: string; application_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    const supabase = createClient()
    const [overviewRes, pendenciasRes, mainRes, reserveRes, historyRes, destRes, appsRes] = await Promise.all([
      supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_pendencias', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_queue_main', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_queue_reserve', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_history', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_destination', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_sold_apps', { p_partner_id: partnerId }),
    ]) as unknown as [
      { data: (OverviewRow & { repassado_amount: number })[] | null; error: unknown },
      { data: PendenciasRow[] | null; error: unknown },
      { data: QueueApiRow[] | null; error: unknown },
      { data: QueueApiRow[] | null; error: unknown },
      { data: HistoryRow[] | null; error: unknown },
      { data: DestinationRow[] | null; error: unknown },
      { data: { application_id: string; application_name: string }[] | null; error: unknown },
    ]
    if (id !== reqId.current) return

    setOverviewError(!!overviewRes.error)
    setOverview(overviewRes.data?.[0] ?? null)
    setPendencias(pendenciasRes.error ? null : (pendenciasRes.data?.[0] ?? null))

    const queuePermDenied = isPermissionDenied(mainRes.error) || isPermissionDenied(reserveRes.error)
    setQueuePermissionDenied(queuePermDenied)
    setQueueError((!!mainRes.error && !isPermissionDenied(mainRes.error)) || (!!reserveRes.error && !isPermissionDenied(reserveRes.error)))
    setQueueMain(mainRes.data ?? [])
    setQueueReserve(reserveRes.data ?? [])

    setHistoryPermissionDenied(isPermissionDenied(historyRes.error))
    setHistoryError(!!historyRes.error && !isPermissionDenied(historyRes.error))
    setHistory(historyRes.error ? [] : (historyRes.data ?? []))

    setDestinationPermissionDenied(isPermissionDenied(destRes.error))
    setDestination(destRes.error ? null : (destRes.data?.[0] ?? null))
    setApps(appsRes.data ?? [])

    if (!overviewRes.error && !pendenciasRes.error) setLastUpdated(new Date())
    setLoading(false)
    setHasLoaded(true)
  }, [partnerId])

  useEffect(() => { load() }, [load])

  const liberacoes: QueueRow[] = useMemo(() => [
    ...queueMain.map(r => ({ ...r, tipo: 'retencao' as const })),
    ...queueReserve.map(r => ({ ...r, tipo: 'reserva' as const })),
  ], [queueMain, queueReserve])

  const exportHref = useMemo(() => {
    const params = new URLSearchParams()
    if (extratoFilters.app) params.set('application_id', extratoFilters.app)
    if (extratoFilters.tipo) params.set('tipo', extratoFilters.tipo)
    // Mesma string crua (sem passar por `new Date(...).toISOString()`, que
    // interpretaria no fuso do NAVEGADOR e divergiria do que a tabela
    // manda) que ExtratoTab.tsx já envia pra RPC — exportação e tela
    // precisam enxergar exatamente o mesmo recorte pro mesmo filtro.
    if (extratoFilters.de) params.set('from_iso', `${extratoFilters.de}T00:00:00`)
    if (extratoFilters.ate) params.set('to_iso', `${extratoFilters.ate}T23:59:59`)
    if (partnerId) params.set('parceiro', partnerId)
    return `/api/financeiro/repasses/export?${params.toString()}`
  }, [extratoFilters, partnerId])

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: colors.text }}>Repasses e extrato</h2>
          <p className="mt-0.5 text-sm" style={{ color: colors.textSecondary }}>
            Acompanhe seus valores disponíveis, próximas liberações e histórico de repasses.
          </p>
          {lastUpdated && (
            <p className="mt-1 text-xs" style={{ color: colors.textMuted }}>
              Última atualização: {formatDateBR(lastUpdated.toISOString().slice(0, 10))} {lastUpdated.toTimeString().slice(0, 5)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href={exportHref} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
            style={{ borderColor: colors.border, color: colors.text, background: colors.card }}>
            <Download size={13} aria-hidden="true" />Exportar extrato
          </a>
          <button type="button" onClick={() => load()} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ borderColor: colors.border, color: colors.text, background: colors.card }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />Atualizar
          </button>
        </div>
      </div>

      <SaldosAtuais
        overview={overview} pendencias={pendencias}
        loading={loading && !hasLoaded} error={overviewError}
        onGoLiberacoes={() => setAba('liberacoes')}
        onRetry={load}
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b" style={{ borderColor: colors.border }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setAba(t.key)}
            className="shrink-0 px-3 py-2.5 text-sm font-semibold"
            style={aba === t.key ? { color: colors.primary, borderBottom: `2px solid ${colors.primary}` } : { color: colors.textSecondary }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          {aba === 'liberacoes' && (
            queuePermissionDenied ? (
              <PermissionDenied label="Repasses e extrato" />
            ) : (
              <ProximasLiberacoesTab rows={liberacoes} loading={loading && !hasLoaded} error={queueError} partnerId={partnerId} onRetry={load} />
            )
          )}
          {aba === 'historico' && (
            historyPermissionDenied ? (
              <PermissionDenied label="Repasses e extrato" />
            ) : (
              <HistoricoRepassesTab rows={history} loading={loading && !hasLoaded} error={historyError} partnerId={partnerId} onRetry={load} />
            )
          )}
          {aba === 'extrato' && (
            <ExtratoTab partnerId={partnerId} apps={apps} filters={extratoFilters} onFiltersChange={setExtratoFilters} />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <ContaRecebimentoCard data={destination} loading={loading && !hasLoaded} partnerId={partnerId} permissionDenied={destinationPermissionDenied} />
          <EntendaSeusValores />
          <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
            <p className="text-sm font-semibold" style={{ color: colors.text }}>Precisa de ajuda?</p>
            <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>Consulte o suporte sobre seus repasses.</p>
            <a href={`/dashboard/suporte${partnerId ? `?parceiro=${partnerId}` : ''}`} className="mt-1 inline-block text-xs font-semibold" style={{ color: colors.primary }}>Contatar suporte →</a>
          </div>
        </div>
      </div>
    </div>
  )
}

function PermissionDenied({ label }: { label: string }) {
  return (
    <div className="rounded-xl border p-4 text-sm" style={{ borderColor: colors.border, background: colors.card, color: colors.text }}>
      Você não tem a permissão &quot;{label}&quot; para ver esta seção deste parceiro.
    </div>
  )
}
