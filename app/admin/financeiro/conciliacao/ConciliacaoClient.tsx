'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2, ScanSearch, AlertTriangle, CheckCircle2, XCircle, Search, Download, History, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import FinanceiroSubNav from '@/components/admin/finance/FinanceiroSubNav'
import DivergenceDetailDrawer from '@/components/admin/conciliacao/DivergenceDetailDrawer'
import { formatCurrencyBRL } from '@/lib/finance'
import { OPERATION_TYPE_LABEL, RESULT_TYPE_LABEL, RESULT_TYPE_STYLE, RUN_STATUS_LABEL } from '@/lib/reconciliation-labels'
import type {
  ReconciliationItem, ReconciliationOperationType, ReconciliationResultType, ReconciliationRun,
} from '@/types'

interface Props {
  user:             SupabaseUser
  profile:          { full_name?: string } | null
  environmentLabel: 'Teste' | 'Produção'
}

const ALL_OPERATION_TYPES: ReconciliationOperationType[] = ['creditos', 'apps', 'destaques', 'assinaturas']

const STAGES = [
  { key: 'consultando_pagamentos',        label: 'Consultando pagamentos' },
  { key: 'carregando_registros_internos', label: 'Carregando registros internos' },
  { key: 'comparando_informacoes',        label: 'Comparando informações' },
  { key: 'preparando_resultados',         label: 'Preparando resultados' },
] as const

function todayStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

type CardFilter = 'todos' | 'correspondentes' | 'divergencias' | 'sem_correspondencia'

const CARD_FILTER_RESULT_TYPES: Record<Exclude<CardFilter, 'todos'>, ReconciliationResultType[]> = {
  correspondentes:      ['correspondente'],
  divergencias:         ['diferenca_valor', 'diferenca_moeda', 'diferenca_status', 'possivel_duplicidade'],
  sem_correspondencia:  ['sem_registro_local', 'sem_correspondencia_provedor'],
}

interface RunDetail { run: ReconciliationRun; items: ReconciliationItem[]; total: number; page: number; pageSize: number }
interface StreamSummary {
  checkedCount: number; matchedCount: number; divergenceCount: number
  noLocalMatchCount: number; noProviderMatchCount: number; notVerifiableCount: number
  currencySummary: { currency: string; providerAmount: number; localAmount: number; difference: number }[]
  truncated: boolean
}

export default function ConciliacaoClient({ user, profile, environmentLabel }: Props) {
  // ── Filtros de EXECUÇÃO (definem o que roda) ──────────────────────────
  const [startDate, setStartDate] = useState(todayStr(-30))
  const [endDate, setEndDate]     = useState(todayStr())
  const [operationTypes, setOperationTypes] = useState<Set<ReconciliationOperationType>>(new Set(ALL_OPERATION_TYPES))

  // ── Estado da execução em andamento ───────────────────────────────────
  const [running, setRunning] = useState(false)
  const [stage, setStage]     = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const runningRef = useRef(false) // guarda contra duplo-clique além do disabled do botão

  // ── Última execução carregada (própria ou do histórico) ───────────────
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // ── Histórico ──────────────────────────────────────────────────────────
  const [history, setHistory] = useState<ReconciliationRun[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // ── Filtros de REFINAMENTO (só filtram um resultado já obtido) ────────
  const [cardFilter, setCardFilter] = useState<CardFilter>('todos')
  const [opFilter, setOpFilter]     = useState<ReconciliationOperationType | ''>('')
  const [search, setSearch]         = useState('')
  const [sort, setSort]             = useState<'data_desc' | 'data_asc' | 'divergencia'>('data_desc')
  const [page, setPage]             = useState(0)

  const [drawerItem, setDrawerItem] = useState<ReconciliationItem | null>(null)

  // ── Carrega histórico ao montar, seleciona a run mais recente por padrão ──
  useEffect(() => {
    fetch('/api/admin/conciliacao/runs?page=0')
      .then(r => r.json())
      .then((data: { runs: ReconciliationRun[] }) => {
        setHistory(data.runs ?? [])
        if (data.runs?.length) setSelectedRunId(data.runs[0].id)
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true))
  }, [])

  const fetchDetail = useCallback((runId: string) => {
    setLoadingDetail(true)
    const params = new URLSearchParams()
    if (cardFilter !== 'todos') params.set('resultType', CARD_FILTER_RESULT_TYPES[cardFilter].join(','))
    if (opFilter) params.set('operationType', opFilter)
    if (search.trim()) params.set('search', search.trim())
    params.set('sort', sort)
    params.set('page', String(page))

    fetch(`/api/admin/conciliacao/runs/${runId}?${params.toString()}`)
      .then(r => r.json())
      .then((data: RunDetail | { error: string }) => {
        if ('error' in data) return
        setRunDetail(data)
      })
      .finally(() => setLoadingDetail(false))
  }, [cardFilter, opFilter, search, sort, page])

  useEffect(() => {
    // Busca síncrona à mudança de qual run está selecionada — não dá pra
    // derivar durante o render porque depende de fetch assíncrono ao servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedRunId) fetchDetail(selectedRunId)
  }, [selectedRunId, fetchDetail])

  // Reseta pra página 0 quando qualquer filtro de refinamento muda.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0)
  }, [cardFilter, opFilter, search, sort])

  const toggleOperationType = (t: ReconciliationOperationType) => {
    setOperationTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }

  const applyQuickRange = (kind: 'hoje' | 'ontem' | '7d' | '30d') => {
    if (kind === 'hoje')  { setStartDate(todayStr()); setEndDate(todayStr()) }
    if (kind === 'ontem') { setStartDate(todayStr(-1)); setEndDate(todayStr(-1)) }
    if (kind === '7d')    { setStartDate(todayStr(-7)); setEndDate(todayStr()) }
    if (kind === '30d')   { setStartDate(todayStr(-30)); setEndDate(todayStr()) }
  }

  const clearFilters = () => {
    setStartDate(todayStr(-30)); setEndDate(todayStr()); setOperationTypes(new Set(ALL_OPERATION_TYPES))
  }

  const handleRun = async () => {
    if (runningRef.current) return // guarda contra duplo-clique
    if (operationTypes.size === 0) { setRunError('Selecione ao menos um tipo de operação.'); return }
    runningRef.current = true
    setRunning(true)
    setRunError(null)
    setStage(null)

    try {
      const res = await fetch('/api/admin/conciliacao/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, operationTypes: [...operationTypes] }),
      })
      if (!res.body) throw new Error('Resposta sem corpo.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const evt = JSON.parse(line) as { stage: string; runId?: string; error?: string; summary?: StreamSummary }
          setStage(evt.stage)
          if (evt.stage === 'falhou') {
            setRunError(evt.error ?? 'Falha desconhecida na conciliação.')
          } else if (evt.stage === 'concluido' && evt.runId) {
            setSelectedRunId(evt.runId)
            setCardFilter('todos'); setOpFilter(''); setSearch(''); setPage(0)
            fetch('/api/admin/conciliacao/runs?page=0').then(r => r.json()).then((data: { runs: ReconciliationRun[] }) => setHistory(data.runs ?? []))
          }
        }
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Falha ao executar conciliação.')
    } finally {
      setRunning(false)
      runningRef.current = false
      setStage(null)
    }
  }

  const handleExport = (full: boolean) => {
    if (!selectedRunId) return
    const params = new URLSearchParams()
    if (!full) {
      if (cardFilter !== 'todos') params.set('resultType', CARD_FILTER_RESULT_TYPES[cardFilter].join(','))
      if (opFilter) params.set('operationType', opFilter)
      if (search.trim()) params.set('search', search.trim())
    }
    window.open(`/api/admin/conciliacao/runs/${selectedRunId}/export?${params.toString()}`, '_blank')
  }

  const run = runDetail?.run
  const currentStageIdx = stage ? STAGES.findIndex(s => s.key === stage) : -1
  const allConciled = run && (run.status === 'concluido') && run.divergenceCount === 0 && run.noLocalMatchCount === 0 && run.noProviderMatchCount === 0

  return (
    <AdminShell user={user} profile={profile}>
      <div className="space-y-6">

        {/* ── HEADER ── */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <FinanceiroSubNav />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowHistory(v => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/60 hover:border-white/20 hover:text-white">
                <History size={13} aria-hidden="true" />
                Histórico de execuções
              </button>
              {runDetail && (
                <div className="relative group">
                  <button type="button"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/60 hover:border-white/20 hover:text-white">
                    <Download size={13} aria-hidden="true" />
                    Exportar resultado
                  </button>
                  <div className="invisible absolute right-0 z-10 mt-1 w-44 rounded-xl border border-white/[0.08] bg-[#111827] p-1 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
                    <button type="button" onClick={() => handleExport(true)} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-white/70 hover:bg-white/[0.06]">Completo</button>
                    <button type="button" onClick={() => handleExport(false)} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-white/70 hover:bg-white/[0.06]">Só o filtrado</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            <ScanSearch size={24} className="text-[#60A5FA]" aria-hidden="true" />
            Conciliação financeira
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Compare os pagamentos do provedor com os registros da LOBBY e identifique divergências.
          </p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/40">
            <span>Provedor: <strong className="text-white/70">Stripe</strong></span>
            <span>Ambiente: <strong className={environmentLabel === 'Produção' ? 'text-[#F87171]' : 'text-white/70'}>{environmentLabel}</strong></span>
            <span>Escopo: <strong className="text-white/70">Créditos, apps, destaques (Stripe) e assinaturas</strong></span>
            <span>Última execução: <strong className="text-white/70">{history[0] ? new Date(history[0].startedAt).toLocaleString('pt-BR') : 'nenhuma ainda'}</strong></span>
          </div>

          <p className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-white/50">
            A conciliação identifica diferenças. Executar uma consulta não altera pagamentos, créditos ou repasses. Não é conciliação bancária — só compara Stripe com os registros da LOBBY.
          </p>
        </div>

        {/* ── HISTÓRICO ── */}
        {showHistory && (
          <div className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Histórico de execuções</h2>
              <button type="button" onClick={() => setShowHistory(false)} className="text-white/40 hover:text-white"><X size={16} /></button>
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-white/40">Nenhuma execução registrada ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {history.map(h => (
                  <button key={h.id} type="button" onClick={() => { setSelectedRunId(h.id); setShowHistory(false) }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-xs transition-all ${
                      h.id === selectedRunId ? 'border-[#005BFF]/40 bg-[#005BFF]/10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/20'
                    }`}>
                    <span className="text-white/70">{new Date(h.startedAt).toLocaleString('pt-BR')} · {h.periodStart} a {h.periodEnd}</span>
                    <span className="flex items-center gap-3 text-white/40">
                      <span>{h.checkedCount} verificados</span>
                      <span className={h.status === 'falhou' ? 'text-[#F87171]' : h.status === 'concluido_parcialmente' ? 'text-[#FBBF24]' : 'text-[#34D399]'}>
                        {RUN_STATUS_LABEL[h.status]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CARD DE EXECUÇÃO ── */}
        <div className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5">
          <h2 className="mb-4 text-sm font-bold text-white">Executar conciliação</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/40">Data inicial</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={running}
                className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/40">Data final</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={running}
                className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50" />
            </div>
            <div className="flex gap-1.5">
              {([['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['30d', '30 dias']] as const).map(([k, label]) => (
                <button key={k} type="button" disabled={running} onClick={() => applyQuickRange(k)}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-white/50 hover:text-white/80 disabled:opacity-40">
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold text-white/40">Tipos de operação</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Tipos de operação a conciliar">
              {ALL_OPERATION_TYPES.map(t => (
                <label key={t} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                  operationTypes.has(t) ? 'border-[#005BFF]/40 bg-[#005BFF]/10 text-[#60A5FA]' : 'border-white/[0.08] text-white/40'
                }`}>
                  <input type="checkbox" className="sr-only" checked={operationTypes.has(t)} disabled={running} onChange={() => toggleOperationType(t)} />
                  {OPERATION_TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-white/30">Fuso: América/São Paulo (UTC-3). Limite de segurança por execução: cobranças além do teto marcam a execução como parcial.</p>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={handleRun} disabled={running}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
              {running ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ScanSearch size={15} aria-hidden="true" />}
              Executar conciliação
            </button>
            <button type="button" onClick={clearFilters} disabled={running}
              className="rounded-xl border border-white/[0.10] px-4 py-2.5 text-sm font-semibold text-white/50 hover:border-white/25 hover:text-white/80 disabled:opacity-40">
              Limpar filtros
            </button>
          </div>

          {/* ── PROCESSAMENTO: estágios reais, sem porcentagem inventada ── */}
          {running && (
            <div className="mt-4 space-y-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3" role="status" aria-live="polite">
              {STAGES.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  {i < currentStageIdx ? <CheckCircle2 size={13} className="text-[#34D399]" aria-hidden="true" />
                    : i === currentStageIdx ? <Loader2 size={13} className="animate-spin text-[#60A5FA]" aria-hidden="true" />
                    : <span className="h-3 w-3 rounded-full border border-white/15" aria-hidden="true" />}
                  <span className={i <= currentStageIdx ? 'text-white/80' : 'text-white/30'}>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {runError && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[#F87171]"><XCircle size={13} aria-hidden="true" />{runError}</p>
          )}
        </div>

        {/* ── ESTADO INICIAL (nunca rodou nenhuma vez) ── */}
        {!running && !run && historyLoaded && history.length === 0 && !runError && (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-white/[0.10] bg-white/[0.02] py-14 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(96,165,250,0.10)' }}>
              <ScanSearch size={22} className="text-[#60A5FA]" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-white/70">Confira se os pagamentos estão registrados corretamente.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs text-white/35">Escolha um período para comparar os dados do provedor com os registros internos.</p>
            <div className="mt-5 grid max-w-md gap-2 text-left text-xs text-white/50 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><strong className="block text-white/70">Pagamentos correspondentes</strong>Stripe e LOBBY concordam.</div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><strong className="block text-white/70">Diferenças de valor/situação</strong>Algo não bate.</div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><strong className="block text-white/70">Registros sem correspondência</strong>Falta um dos dois lados.</div>
            </div>
          </div>
        )}

        {/* ── ESTADO DA RUN SELECIONADA ── */}
        {run && !running && (
          <>
            <div className={`rounded-2xl border p-3 text-xs font-semibold ${
              run.status === 'falhou' ? 'border-[#EF4444]/30 bg-[#EF4444]/[0.06] text-[#F87171]'
                : run.status === 'concluido_parcialmente' ? 'border-[#F59E0B]/30 bg-[#F59E0B]/[0.06] text-[#FBBF24]'
                : allConciled ? 'border-[#10B981]/30 bg-[#10B981]/[0.06] text-[#34D399]'
                : 'border-white/[0.08] bg-white/[0.03] text-white/60'
            }`}>
              {run.status === 'falhou' && (run.errorMessage ? `Falhou: ${run.errorMessage}` : 'Execução falhou.')}
              {run.status === 'concluido_parcialmente' && 'Concluído parcialmente — nem todo o período foi verificado (ver limitações). Nunca mostra "tudo conciliado" nesse estado.'}
              {run.status === 'concluido' && allConciled && 'Tudo conciliado — nenhuma divergência ou ausência encontrada.'}
              {run.status === 'concluido' && !allConciled && `Concluído — ${run.divergenceCount + run.noLocalMatchCount + run.noProviderMatchCount} ocorrência(s) exigem atenção.`}
            </div>

            {/* ── CARDS DE RESUMO (também funcionam como filtro) ── */}
            <div className="grid gap-3 sm:grid-cols-4">
              {([
                ['todos', 'Verificados', run.checkedCount, '#60A5FA'],
                ['correspondentes', 'Correspondentes', run.matchedCount, '#34D399'],
                ['divergencias', 'Divergências', run.divergenceCount, '#F87171'],
                ['sem_correspondencia', 'Sem correspondência', run.noLocalMatchCount + run.noProviderMatchCount, '#FBBF24'],
              ] as const).map(([key, label, count, color]) => (
                <button key={key} type="button" onClick={() => setCardFilter(key)} aria-pressed={cardFilter === key}
                  className={`rounded-2xl border p-4 text-left transition-all ${cardFilter === key ? 'border-white/30 bg-white/[0.06]' : 'border-white/[0.08] bg-[#111827]/80 hover:border-white/20'}`}>
                  <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                  <p className="mt-0.5 text-xs text-white/50">{label}</p>
                  {key === 'sem_correspondencia' && run.notVerifiableCount > 0 && (
                    <p className="mt-0.5 text-[10px] text-white/30">+{run.notVerifiableCount} não verificável</p>
                  )}
                </button>
              ))}
            </div>

            {/* ── RESUMO MONETÁRIO ── */}
            {run.currencySummary.length > 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#111827]/80 p-4">
                <p className="mb-2 text-xs font-bold text-white">Resumo monetário (valores comparáveis — não é lucro nem saldo bancário)</p>
                <div className="space-y-1.5">
                  {run.currencySummary.map(c => (
                    <div key={c.currency} className="flex flex-wrap items-center gap-4 text-xs">
                      <span className="font-semibold text-white/70">{c.currency}</span>
                      <span className="text-white/50">Provedor: {formatCurrencyBRL(c.providerAmount)}</span>
                      <span className="text-white/50">LOBBY: {formatCurrencyBRL(c.localAmount)}</span>
                      <span className={Math.abs(c.difference) > 0.01 ? 'font-semibold text-[#F87171]' : 'text-[#34D399]'}>
                        Diferença: {formatCurrencyBRL(c.difference)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TABELA DE OCORRÊNCIAS ── */}
            <div className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por ID (Stripe ou local)"
                    className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] pl-9 pr-3 text-xs text-white placeholder:text-white/25 outline-none focus:border-[#005BFF]/50" />
                </div>
                <select value={opFilter} onChange={e => setOpFilter(e.target.value as ReconciliationOperationType | '')}
                  className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 text-xs text-white/70 outline-none">
                  <option value="">Todas as operações</option>
                  {ALL_OPERATION_TYPES.map(t => <option key={t} value={t}>{OPERATION_TYPE_LABEL[t]}</option>)}
                </select>
                <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}
                  className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 text-xs text-white/70 outline-none">
                  <option value="data_desc">Mais recentes primeiro</option>
                  <option value="data_asc">Mais antigos primeiro</option>
                  <option value="divergencia">Divergência primeiro</option>
                </select>
                {cardFilter !== 'todos' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] text-white/60">
                    Filtro: {cardFilter === 'correspondentes' ? 'Correspondentes' : cardFilter === 'divergencias' ? 'Divergências' : 'Sem correspondência'}
                    <button type="button" onClick={() => setCardFilter('todos')} className="hover:text-white"><X size={11} /></button>
                  </span>
                )}
              </div>

              {loadingDetail ? (
                <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-white/30" /></div>
              ) : !runDetail || runDetail.items.length === 0 ? (
                <p className="py-8 text-center text-xs text-white/30">Nenhuma ocorrência encontrada com os filtros atuais.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-left text-[10px] uppercase tracking-wide text-white/30">
                        <th className="px-2 py-2">Data</th>
                        <th className="px-2 py-2">Operação</th>
                        <th className="px-2 py-2">Ref. local</th>
                        <th className="px-2 py-2">Ref. provedor</th>
                        <th className="px-2 py-2">Valor provedor</th>
                        <th className="px-2 py-2">Valor LOBBY</th>
                        <th className="px-2 py-2">Resultado</th>
                        <th className="px-2 py-2">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runDetail.items.map(item => {
                        const style = RESULT_TYPE_STYLE[item.resultType]
                        const date = item.providerCreatedAt ?? item.localCreatedAt
                        return (
                          <tr key={item.id} className="border-b border-white/[0.05] last:border-0">
                            <td className="px-2 py-2 text-white/50">{date ? new Date(date).toLocaleDateString('pt-BR') : '—'}</td>
                            <td className="px-2 py-2 text-white/60">{item.operationType ? OPERATION_TYPE_LABEL[item.operationType] : '—'}</td>
                            <td className="px-2 py-2 font-mono text-white/40">{item.localId ? item.localId.slice(0, 8) : '—'}</td>
                            <td className="px-2 py-2 font-mono text-white/40">{item.stripeChargeId ? item.stripeChargeId.slice(0, 14) : '—'}</td>
                            <td className="px-2 py-2 text-white/70">{item.providerAmount !== null ? formatCurrencyBRL(item.providerAmount) : '—'}</td>
                            <td className="px-2 py-2 text-white/70">{item.localAmount !== null ? formatCurrencyBRL(item.localAmount) : '—'}</td>
                            <td className="px-2 py-2">
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: style.color, background: style.bg }}>
                                {item.resultType === 'correspondente' ? <CheckCircle2 size={10} aria-hidden="true" /> : <AlertTriangle size={10} aria-hidden="true" />}
                                {RESULT_TYPE_LABEL[item.resultType]}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <button type="button" onClick={() => setDrawerItem(item)} className="font-semibold text-[#60A5FA] hover:underline">Investigar</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {runDetail && runDetail.total > runDetail.pageSize && (
                <div className="mt-3 flex items-center justify-between text-xs text-white/40">
                  <span>{runDetail.total} ocorrência(s) encontrada(s)</span>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded-lg border border-white/[0.08] p-1.5 disabled:opacity-30"><ChevronLeft size={14} /></button>
                    <span>Página {page + 1}</span>
                    <button type="button" disabled={(page + 1) * runDetail.pageSize >= runDetail.total} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-white/[0.08] p-1.5 disabled:opacity-30"><ChevronRight size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <DivergenceDetailDrawer item={drawerItem} onClose={() => setDrawerItem(null)} />
    </AdminShell>
  )
}
