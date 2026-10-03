'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors, shadows } from '@/lib/design-tokens'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import { resolvePeriodoRange, resolveGranularidade, type PeriodoPreset } from '@/lib/services/financeiro-periodo'
import FiltrosPeriodo, { type AppOption } from './FiltrosPeriodo'
import EvolucaoChart, { type SerieBucket } from './EvolucaoChart'
import ProximasLiberacoes, { type LiberacaoRow } from './ProximasLiberacoes'

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

interface Props {
  partnerId: string | null
  apps:      AppOption[]
  userId:    string
}

export default function VisaoGeralClient({ partnerId, apps, userId: _userId }: Props) {
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

  const range = useMemo(() => resolvePeriodoRange(preset, customFrom, customTo), [preset, customFrom, customTo])
  const granularidade = useMemo(() => resolveGranularidade(range.from, range.to), [range])

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [resumoRes, overviewRes, serieRes, queueMainRes, queueReserveRes] = await Promise.all([
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
    ]) as unknown as [
      { data: ResumoRow[] | null; error: unknown },
      { data: OverviewRow[] | null; error: unknown },
      { data: SerieBucket[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
      { data: { sale_id: string; application_name: string; plan_name: string; net_amount: number; release_date: string; days_remaining: number }[] | null; error: unknown },
    ]

    setResumoError(!!resumoRes.error)
    setResumo(resumoRes.data?.[0] ?? EMPTY_RESUMO)
    setOverviewError(!!overviewRes.error)
    setOverview(overviewRes.data?.[0] ?? EMPTY_OVERVIEW)
    setSerieError(!!serieRes.error)
    setSerie(serieRes.data ?? [])

    setLiberacoesError(!!queueMainRes.error || !!queueReserveRes.error)
    const nameFilter = applicationId ? apps.find(a => a.application_id === applicationId)?.application_name : null
    const main: LiberacaoRow[] = (queueMainRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'retencao' as const }))
    const reserve: LiberacaoRow[] = (queueReserveRes.data ?? [])
      .filter(r => !nameFilter || r.application_name === nameFilter)
      .map(r => ({ ...r, tipo: 'reserva' as const }))
    setLiberacoes([...main, ...reserve].sort((a, b) => a.days_remaining - b.days_remaining))

    if (!resumoRes.error && !overviewRes.error && !serieRes.error && !queueMainRes.error && !queueReserveRes.error) setLastUpdated(new Date())
    setLoading(false)
  }, [range, applicationId, partnerId, granularidade, apps])

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
    <div style={{ background: colors.backgroundAlt }} className="-m-6 min-h-screen p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: colors.text }}>Visão geral</h2>
          {lastUpdated && (
            <p className="mt-0.5 text-xs" style={{ color: colors.textMuted }}>
              Última atualização: {formatDateBR(lastUpdated.toISOString().slice(0, 10))} {lastUpdated.toTimeString().slice(0, 5)}
            </p>
          )}
        </div>
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

      <FiltrosPeriodo
        preset={preset} onPresetChange={setPreset}
        customFrom={customFrom} customTo={customTo}
        onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t) }}
        apps={apps} applicationId={applicationId} onAppChange={setApplicationId}
      />

      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Resultados do período</p>
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
          <EvolucaoChart data={serie} granularidade={granularidade} loading={loading} error={serieError} onRetry={load} />
        </div>
        <ProximasLiberacoes rows={liberacoes} loading={loading} error={liberacoesError} onRetry={load} partnerId={partnerId} />
      </div>
    </div>
  )
}
