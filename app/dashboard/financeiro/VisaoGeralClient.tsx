'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import { resolvePeriodoRange, resolveGranularidade, type PeriodoPreset } from '@/lib/services/financeiro-periodo'
import FiltrosPeriodo, { type AppOption } from './FiltrosPeriodo'
import EvolucaoChart, { type SerieBucket } from './EvolucaoChart'
import ProximasLiberacoes, { type LiberacaoRow } from './ProximasLiberacoes'
import UltimasVendas, { type VendaRow } from './UltimasVendas'
import DesempenhoPorApp, { type DesempenhoRow } from './DesempenhoPorApp'
import PendenciasAvisos, { type PendenciasRow } from './PendenciasAvisos'

interface ResumoRow {
  vendas_confirmadas_valor: number
  vendas_confirmadas_qtd:   number
  comissao_valor:           number
  reembolsos_valor:         number
  reembolsos_qtd:           number
  participacao_valor:       number
}

const EMPTY_RESUMO: ResumoRow = {
  vendas_confirmadas_valor: 0, vendas_confirmadas_qtd: 0, comissao_valor: 0,
  reembolsos_valor: 0, reembolsos_qtd: 0, participacao_valor: 0,
}

interface OverviewRow {
  retido_amount:         number
  elegivel_amount:       number
  repassado_amount:      number
  reserva_retida_amount: number
}

const EMPTY_OVERVIEW: OverviewRow = { retido_amount: 0, elegivel_amount: 0, repassado_amount: 0, reserva_retida_amount: 0 }

// Compartilhado entre o guard de "Próximas liberações" (financeiro_repasses)
// e o guard de página inteira (financeiro_visao_geral, achado #11) — mesma
// forma de erro lançada pelas RPCs security definer em "Sem permissão ...".
const isPermissionDenied = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'message' in err &&
  typeof (err as { message: unknown }).message === 'string' &&
  (err as { message: string }).message.includes('Sem permissão')

interface Props {
  partnerId: string | null
  apps:      AppOption[]
  emptyStateCta: { label: string; href: string }
}

export default function VisaoGeralClient({ partnerId, apps, emptyStateCta }: Props) {
  const [preset, setPreset] = useState<PeriodoPreset>('este_mes')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [applicationId, setApplicationId] = useState('')

  const [resumo, setResumo] = useState<ResumoRow>(EMPTY_RESUMO)
  const [overview, setOverview] = useState<OverviewRow>(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [resumoError, setResumoError] = useState(false)
  const [overviewError, setOverviewError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [serie, setSerie] = useState<SerieBucket[]>([])
  const [serieError, setSerieError] = useState(false)
  const [liberacoes, setLiberacoes] = useState<LiberacaoRow[]>([])
  const [liberacoesError, setLiberacoesError] = useState(false)
  const [liberacoesPermissionDenied, setLiberacoesPermissionDenied] = useState(false)
  const [vendas, setVendas] = useState<VendaRow[]>([])
  const [vendasError, setVendasError] = useState(false)
  const [desempenho, setDesempenho] = useState<DesempenhoRow[]>([])
  const [desempenhoError, setDesempenhoError] = useState(false)
  const [pendencias, setPendencias] = useState<PendenciasRow | null>(null)
  const [pendenciasError, setPendenciasError] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [corePermissionDenied, setCorePermissionDenied] = useState(false)
  const reqId = useRef(0)

  const range = useMemo(() => resolvePeriodoRange(preset, customFrom, customTo), [preset, customFrom, customTo])
  const granularidade = useMemo(() => resolveGranularidade(range.from, range.to), [range])

  // Datas de exibição pro rótulo do CSV, calculadas aqui (no mesmo
  // timezone local que originou `range`) — reconverter range.from/to
  // (instantes UTC) de volta pra data de calendário DENTRO da rota da
  // API (timezone do servidor) desloca um dia pra qualquer fuso a
  // leste de UTC. Resolvido no cliente, onde a data local de origem
  // ainda é recuperável sem ambiguidade.
  const displayDates = useMemo(() => {
    const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const from = new Date(range.from)
    const toInclusive = new Date(new Date(range.to).getTime() - 86400_000)
    return { from: fmtLocal(from), to: fmtLocal(toInclusive) }
  }, [range])

  const load = useCallback(async () => {
    // 'personalizado' é selecionado antes que De/Até estejam ambos
    // preenchidos (o dropdown já dispara load() de imediato) — nesse
    // intervalo `range` só reflete o fallback de 'este_mes', então um
    // fetch aqui seria descartado 1-2 chamadas depois mesmo. Acha #9.
    if (preset === 'personalizado' && (!customFrom || !customTo)) {
      setLoading(false)
      return
    }
    const id = ++reqId.current
    setLoading(true)
    const supabase = createClient()
    const [resumoRes, overviewRes, serieRes, queueMainRes, queueReserveRes, vendasRes, desempenhoRes, pendenciasRes] = await Promise.all([
      supabase.rpc('get_partner_financeiro_periodo_resumo', {
        p_from: range.from, p_to: range.to,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_overview', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_serie', {
        p_from: range.from, p_to: range.to, p_granularidade: granularidade,
        p_application_id: applicationId || null, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_payout_queue_main', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_payout_queue_reserve', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_financeiro_periodo_vendas', {
        p_from: range.from, p_to: range.to, p_application_id: applicationId || null,
        p_limit: 5, p_offset: 0, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_periodo_por_app', {
        p_from: range.from, p_to: range.to, p_partner_id: partnerId,
      }),
      supabase.rpc('get_partner_financeiro_pendencias', { p_partner_id: partnerId }),
    ]) as unknown as [
      { data: ResumoRow[] | null; error: unknown },
      { data: OverviewRow[] | null; error: unknown },
      { data: SerieBucket[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: VendaRow[] | null; error: unknown },
      { data: DesempenhoRow[] | null; error: unknown },
      { data: PendenciasRow[] | null; error: unknown },
    ]

    // Chamada mais recente venceu? Uma resposta antiga (de um load()
    // superado por outro mais novo — ex.: os 2 fetches "preliminares"
    // disparados enquanto o usuário ainda escolhe De/Até em
    // 'personalizado') não deve sobrescrever estado já atualizado pela
    // resposta mais nova. Acha #9.
    if (id !== reqId.current) return

    setResumoError(!!resumoRes.error)
    setResumo(resumoRes.data?.[0] ?? EMPTY_RESUMO)
    setOverviewError(!!overviewRes.error)
    setOverview(overviewRes.data?.[0] ?? EMPTY_OVERVIEW)
    setSerieError(!!serieRes.error)
    setSerie(serieRes.data ?? [])

    // resumo/overview são as 2 RPCs mais fundamentais da página — se
    // ambas forem negadas por permissão, o viewer não tem
    // financeiro_visao_geral pra este parceiro (chegou aqui só porque o
    // seletor de parceiro lista qualquer capacidade financeiro_*, não
    // especificamente esta). Acha #11.
    setCorePermissionDenied(isPermissionDenied(resumoRes.error) && isPermissionDenied(overviewRes.error))

    setLiberacoesError(!!queueMainRes.error || !!queueReserveRes.error)
    // get_partner_payout_queue_main/_reserve (RPCs já existentes,
    // reaproveitadas aqui) exigem financeiro_repasses — diferente de
    // financeiro_visao_geral, que já libera o resto desta página. Um
    // membro de equipe com só financeiro_visao_geral tem essa chamada
    // negada de propósito; tratado como "sem permissão pra esta seção",
    // não como uma falha real (achado na verificação manual da Etapa 8).
    const queuePermissionDenied = isPermissionDenied(queueMainRes.error) || isPermissionDenied(queueReserveRes.error)
    setLiberacoesPermissionDenied(queuePermissionDenied)
    const nameFilter = applicationId ? apps.find(a => a.application_id === applicationId)?.application_name : null
    const main: LiberacaoRow[] = (queueMainRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'retencao' as const }))
    const reserve: LiberacaoRow[] = (queueReserveRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'reserva' as const }))
    setLiberacoes([...main, ...reserve].sort((a, b) => a.days_remaining - b.days_remaining))

    setVendasError(!!vendasRes.error)
    setVendas(vendasRes.data ?? [])
    setDesempenhoError(!!desempenhoRes.error)
    setDesempenho(desempenhoRes.data ?? [])
    setPendenciasError(!!pendenciasRes.error)
    setPendencias(pendenciasRes.data?.[0] ?? null)

    // Uma negação de permissão nas RPCs da fila (financeiro_repasses) já
    // não é tratada como falha real pra "Próximas liberações" (ver
    // liberacoesPermissionDenied acima) — o gate final precisa da mesma
    // exceção, senão "Última atualização" nunca aparece pra um viewer só
    // com financeiro_visao_geral. Acha #2.
    const queueOk = queuePermissionDenied || (!queueMainRes.error && !queueReserveRes.error)
    if (!resumoRes.error && !overviewRes.error && !serieRes.error && queueOk && !vendasRes.error && !desempenhoRes.error && !pendenciasRes.error) {
      setLastUpdated(new Date())
    }
    setLoading(false)
    setHasLoaded(true)
  }, [range, applicationId, partnerId, granularidade, apps, preset, customFrom, customTo])

  useEffect(() => { load() }, [load])

  const periodoCards = [
    {
      label: 'Vendas confirmadas', value: resumo.vendas_confirmadas_valor,
      sub: `${resumo.vendas_confirmadas_qtd} venda${resumo.vendas_confirmadas_qtd === 1 ? '' : 's'}`,
      explicacao: 'Valor pago, vendas confirmadas no período selecionado.', color: colors.text,
    },
    {
      label: 'Comissão da plataforma', value: resumo.comissao_valor,
      sub: 'Comissão LOBBY sobre as vendas acima.', explicacao: '', color: '#6D28D9',
    },
    {
      label: 'Reembolsos', value: resumo.reembolsos_valor,
      sub: `${resumo.reembolsos_qtd} reembolso${resumo.reembolsos_qtd === 1 ? '' : 's'}`,
      explicacao: 'Reembolsos efetuados no período selecionado.', color: '#EF4444',
    },
    {
      label: 'Sua participação', value: resumo.participacao_valor,
      sub: 'Valor de venda menos a comissão da plataforma.',
      explicacao: 'Não é lucro — ainda não desconta custos próprios do parceiro.', color: colors.primary,
    },
  ]

  return (
    <div style={{ background: colors.backgroundAlt }} className="-m-4 p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: colors.text }}>Visão geral</h2>
          {lastUpdated && (
            <p className="mt-0.5 text-xs" style={{ color: colors.textMuted }}>
              Última atualização: {formatDateBR(lastUpdated.toISOString().slice(0, 10))} {lastUpdated.toTimeString().slice(0, 5)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!corePermissionDenied && (
            <a
              href={`/api/financeiro/export?preset=${preset}${preset === 'personalizado' ? `&from=${customFrom}&to=${customTo}` : ''}&from_iso=${encodeURIComponent(range.from)}&to_iso=${encodeURIComponent(range.to)}&display_from=${displayDates.from}&display_to=${displayDates.to}${applicationId ? `&application_id=${applicationId}` : ''}${partnerId ? `&parceiro=${partnerId}` : ''}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: colors.border, color: colors.text, background: colors.card }}
            >
              Exportar relatório
            </a>
          )}
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

      <FiltrosPeriodo
        preset={preset} onPresetChange={setPreset}
        customFrom={customFrom} customTo={customTo}
        onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t) }}
        apps={apps} applicationId={applicationId} onAppChange={setApplicationId}
      />

      {corePermissionDenied ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: colors.border, background: colors.card, color: colors.text }}>
          Você não tem a permissão &quot;Visão geral&quot; para ver o financeiro deste parceiro.
        </div>
      ) : (
      <>
      <PendenciasAvisos data={pendencias} loading={loading && !hasLoaded} error={pendenciasError} onRetry={load} partnerId={partnerId} />

      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Resultados do período</p>
      {!loading && !resumoError && resumo.vendas_confirmadas_qtd === 0 && (
        <div className="mb-6 rounded-xl border p-4 text-center" style={{ borderColor: colors.border, background: colors.card }}>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            {applicationId || preset === 'personalizado'
              ? 'Nenhuma venda encontrada com esse filtro.'
              : 'Você ainda não tem vendas registradas.'}
          </p>
          {applicationId || preset === 'personalizado' ? (
            <button
              onClick={() => { setApplicationId(''); setPreset('este_mes') }}
              className="mt-2 text-sm font-semibold"
              style={{ color: colors.primary }}
            >
              Limpar filtros
            </button>
          ) : (
            <Link href={emptyStateCta.href} className="mt-2 inline-block text-sm font-semibold" style={{ color: colors.primary }}>
              {emptyStateCta.label} →
            </Link>
          )}
        </div>
      )}
      {resumoError ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444', color: colors.text }}>
          Não foi possível carregar os resultados do período.
          <button onClick={() => load()} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {periodoCards.map(c => (
            <div key={c.label} className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
              <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>{c.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: c.color }}>{formatCurrencyBRL(c.value)}</p>
              <p className="mt-0.5 text-[11px]" style={{ color: colors.textMuted }}>{c.sub}</p>
              {c.explicacao && <p className="mt-1 text-[11px]" style={{ color: colors.textMuted }}>{c.explicacao}</p>}
            </div>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Saldos atuais</p>
      {overviewError ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: '#EF4444', color: colors.text }}>
          Não foi possível carregar os saldos atuais.
          <button onClick={() => load()} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: colors.border }}>Tentar novamente</button>
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border-2 p-4" style={{ borderColor: colors.primary, background: `${colors.primary}0D`, boxShadow: shadows.card }}>
            <p className="text-xs font-semibold" style={{ color: colors.primary }}>Disponível para repasse</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: colors.primary }}>{formatCurrencyBRL(overview.elegivel_amount)}</p>
            <Link href={`/dashboard/financeiro/repasses${partnerId ? `?parceiro=${partnerId}` : ''}`} className="mt-1 inline-block text-[11px] font-semibold" style={{ color: colors.primary }}>
              Ver repasses →
            </Link>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
            <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>Em retenção</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: '#F59E0B' }}>{formatCurrencyBRL(overview.retido_amount)}</p>
            <p className="mt-0.5 text-[11px]" style={{ color: colors.textMuted }}>Dentro do período de retenção.</p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
            <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>Reserva de segurança</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: '#6D28D9' }}>{formatCurrencyBRL(overview.reserva_retida_amount)}</p>
            <p className="mt-0.5 text-[11px]" style={{ color: colors.textMuted }}>Liberada em até 120 dias sem disputa.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
          <p className="mb-3 text-sm font-bold" style={{ color: colors.text }}>Evolução das vendas</p>
          <EvolucaoChart data={serie} granularidade={granularidade} loading={loading && !hasLoaded} error={serieError} onRetry={load} />
        </div>
        <ProximasLiberacoes rows={liberacoes} loading={loading && !hasLoaded} error={liberacoesError} permissionDenied={liberacoesPermissionDenied} onRetry={load} partnerId={partnerId} />
      </div>

      <div className="mb-6">
        <UltimasVendas rows={vendas} loading={loading && !hasLoaded} error={vendasError} onRetry={load} partnerId={partnerId} />
      </div>

      <DesempenhoPorApp
        rows={desempenho} loading={loading && !hasLoaded} error={desempenhoError} onRetry={load}
        hidden={!!applicationId || desempenho.length <= 1}
      />
      </>
      )}
    </div>
  )
}
