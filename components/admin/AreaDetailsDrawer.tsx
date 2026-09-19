'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Filter, ArrowRight, MessageSquare } from 'lucide-react'
import { AREA_CONFIG, DEFAULT_CFG, FILTERS } from './ContactCard'
import { getPeriodCutoff, type PeriodKey } from './activity'
import type { Contact } from '@/app/admin/solicitacoes/page'

/* Props do drawer de detalhamento por área:
   open       — controla se o drawer está visível
   onClose    — callback para fechar o drawer
   contacts   — lista completa de contatos/solicitações
   onViewArea — abre o filtro de contatos por uma área específica
   onViewAll  — navega para a listagem completa de solicitações */
interface Props {
  open:  boolean
  onClose: () => void
  contacts: Contact[]
  onViewArea: (area: string) => void
  onViewAll:  () => void
}

/* Períodos disponíveis para filtrar a distribuição por área. */
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'hoje',  label: 'Hoje' },
  { key: '7d',    label: '7 dias' },
  { key: '30d',   label: '30 dias' },
  { key: 'todos', label: 'Todos' },
]

/* Estrutura de dados de uma linha da tabela de áreas.
   area  — nome da área de interesse
   count — total de solicitações nessa área no período
   pct   — percentual em relação ao total geral
   cfg   — configuração visual (ícone, cores) vinda de AREA_CONFIG */
interface AreaRow { area: string; count: number; pct: number; cfg: { icon: React.ElementType; color: string; bg: string; accent: string } }

/* Gera textos de insight sobre a distribuição das solicitações por área.
   Destaca a área de maior volume, áreas sem solicitações e
   a presença de diagnósticos gratuitos (sinal de clientes em decisão).
   Retorna array vazio quando total é 0. */
function buildAreaInsights(rows: AreaRow[], total: number): string[] {
  if (total === 0) return ['Ainda não há solicitações para analisar.']

  const insights: string[] = []
  const sorted = [...rows].sort((a, b) => b.count - a.count)
  // Área com maior quantidade de solicitações no período
  const top = sorted[0]
  if (top && top.count > 0) {
    insights.push(`A área com maior volume é ${top.area} (${top.pct}%).`)
  }

  // Áreas que não receberam nenhuma solicitação no período
  const empty = rows.filter(r => r.count === 0).map(r => r.area)
  if (empty.length > 0) {
    insights.push(`Não há solicitações nas áreas de ${empty.join(' e ')}.`)
  }

  // Insight específico para diagnóstico gratuito — indica leads no topo do funil
  const diagnostico = rows.find(r => r.area === 'Diagnóstico gratuito')
  if (diagnostico && diagnostico.count > 0) {
    insights.push('Diagnóstico gratuito pode indicar clientes em fase inicial de decisão.')
  }

  return insights
}

/* Exporta o resumo de distribuição por área como arquivo CSV.
   Colunas: Categoria, Quantidade, Percentual.
   Dispara download automático via link temporário. */
function exportSummaryCsv(rows: AreaRow[]) {
  const header = 'Categoria,Quantidade,Percentual'
  const lines = rows.map(r => `${r.area},${r.count},${r.pct}%`)
  const csv = [header, ...lines].join('\n')
  // Cria blob CSV e faz download via link temporário
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'resumo-por-area.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/* Drawer lateral de detalhamento de solicitações por área de interesse.
   Exibe gráfico donut, barras de distribuição, insights textuais e
   lista de áreas com botões de ação rápida. */
export default function AreaDetailsDrawer({ open, onClose, contacts, onViewArea, onViewAll }: Props) {
  // Período de tempo selecionado para filtrar os dados
  const [period, setPeriod] = useState<PeriodKey>('todos')
  // Ref para o título do drawer (recebe foco ao abrir — acessibilidade)
  const titleRef = useRef<HTMLHeadingElement>(null)

  /* Captura a tecla Escape para fechar o drawer e foca o título ao abrir. */
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    titleRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Não renderiza nada enquanto o drawer está fechado
  if (!open) return null

  // Calcula o timestamp de corte para o período selecionado (null = sem corte)
  const cutoff = getPeriodCutoff(period)
  // Filtra os contatos dentro do período selecionado
  const scoped = cutoff === null ? contacts : contacts.filter(c => new Date(c.created_at).getTime() >= cutoff)
  // Total de solicitações no período (denominador para os percentuais)
  const total = scoped.length

  /* Constrói uma linha de resumo para cada área de interesse (excluindo o filtro "Todos").
     Calcula count e percentual arredondado. */
  const rows: AreaRow[] = FILTERS.slice(1).map(area => {
    const count = scoped.filter(c => c.interest_area === area).length
    const pct   = total ? Math.round((count / total) * 100) : 0
    const cfg   = AREA_CONFIG[area] ?? DEFAULT_CFG
    return { area, count, pct, cfg }
  })

  /* Monta o array de segmentos do conic-gradient para o gráfico donut.
     Cada segmento usa a cor accent da área e ocupa o percentual correspondente. */
  const donut = rows.reduce<string[]>((acc, { pct, cfg }, i) => {
    const prev = rows.slice(0, i).reduce((s, r) => s + r.pct, 0)
    if (pct > 0) acc.push(`${cfg.accent} ${prev}% ${prev + pct}%`)
    return acc
  }, [])
  // Estilo CSS do donut: gradiente cônico ou fundo cinza quando não há dados
  const donutStyle = donut.length
    ? { background: `conic-gradient(${donut.join(', ')}, #1E293B 100%)` }
    : { background: '#1E293B' }

  // Área com o maior número de solicitações (usada no botão de filtro rápido)
  const topArea = [...rows].sort((a, b) => b.count - a.count)[0]
  // Textos de insight gerados com base na distribuição atual
  const insights = buildAreaInsights(rows, total)

  return (
    /* AnimatePresence garante que a animação de saída seja executada
       antes de desmontar o componente. */
    <AnimatePresence>
      {/* Overlay escuro com blur — fecha o drawer ao clicar fora. */}
      <motion.div
        key="area-drawer-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel do drawer — desliza da direita (x: 32 → 0).
          Largura: 100% mobile | 70% sm | 480px lg+. */}
      <motion.div
        key="area-drawer-panel"
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 32 }}
        transition={{ duration: 0.22 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="area-drawer-title"
        className="fixed inset-y-0 right-0 z-[70] flex w-full flex-col border-l border-white/[0.08] bg-[#0F172A] shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:w-[70%] lg:w-[480px] lg:rounded-l-3xl"
      >
        {/* ── Cabeçalho: título, descrição, filtros de período e botão fechar ── */}
        <div className="shrink-0 border-b border-white/[0.08] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              {/* Título recebe foco ao abrir (acessibilidade via tabIndex=-1) */}
              <h2 id="area-drawer-title" ref={titleRef} tabIndex={-1} className="text-lg font-bold text-white outline-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Detalhamento por área
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-white/40">
                Entenda a distribuição das solicitações por categoria e filtre rapidamente o que precisa de atenção.
              </p>
            </div>
            {/* Botão de fechar o drawer */}
            <button type="button" onClick={onClose} aria-label="Fechar detalhamento"
              className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* Pílulas de filtro por período — ativa tem fundo branco translúcido */}
          <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por período">
            {PERIODS.map(p => (
              <button key={p.key} type="button" onClick={() => setPeriod(p.key)} aria-pressed={period === p.key}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                  period === p.key ? 'bg-white/15 text-white' : 'border border-white/[0.08] text-white/40 hover:text-white/70'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          {/* Legenda descritiva do período ativo */}
          <p className="mt-1.5 text-[10px] text-white/25">
            {period === 'todos' ? 'Resumo de todos os períodos' : `Resumo dos últimos: ${PERIODS.find(p => p.key === period)?.label.toLowerCase()}`}
          </p>
        </div>

        {/* ── Corpo: gráfico donut, barras, insights e lista de áreas ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Estado vazio: sem solicitações no período */}
          {total === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] py-14 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(96,165,250,0.10)' }}>
                <MessageSquare size={22} className="text-[#60A5FA]" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-white/60">Nenhuma solicitação encontrada</p>
              <p className="mx-auto mt-1.5 max-w-[260px] text-xs text-white/30">
                Quando os clientes enviarem solicitações, a distribuição por área aparecerá aqui.
              </p>
              {/* Ação principal: redireciona para a lista completa de solicitações */}
              <button type="button" onClick={onViewAll}
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5">
                Ver todas as solicitações
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* ── Gráfico donut central ──
                  Gerado via conic-gradient CSS; o buraco é criado com div absoluta
                  usando a cor de fundo. Exibe o total no centro. */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="h-40 w-40 rounded-full" style={donutStyle} />
                  {/* Círculo interno (buraco do donut) com total de solicitações */}
                  <div className="absolute inset-0 m-5 flex flex-col items-center justify-center rounded-full bg-[#0F172A]">
                    <span className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{total}</span>
                    <span className="text-[10px] text-white/40">total</span>
                  </div>
                </div>
              </div>

              {/* ── Barras de distribuição por área ──
                  Cada linha tem: ponto colorido, nome, barra proporcional, % e contagem. */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/30">Distribuição por área</p>
                <div className="space-y-3">
                  {rows.map(({ area, count, pct, cfg }) => (
                    <div key={area} className="flex items-center gap-3">
                      {/* Indicador de cor da área */}
                      <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: cfg.accent }} aria-hidden="true" />
                      <span className="w-28 shrink-0 truncate text-xs text-white/60">{area}</span>
                      {/* Barra de progresso proporcional ao percentual */}
                      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: '#1E293B' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cfg.accent }} />
                      </div>
                      <span className="w-9 shrink-0 text-right text-[11px] font-semibold text-white/40">{pct}%</span>
                      <span className="w-5 shrink-0 text-right text-[11px] font-bold text-white/70">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Caixa de insights textuais ──
                  Gerada por buildAreaInsights com base nos dados do período. */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#111C2E] p-4">
                <p className="mb-2 text-xs font-bold text-white">Insights</p>
                <ul className="space-y-1.5">
                  {insights.map((text, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-white/55">
                      {/* Ponto decorativo da lista */}
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/30" aria-hidden="true" />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>

              {/* ── Lista detalhada por área ──
                  Cada card tem ícone, nome, contagem e botão para filtrar.
                  Botão desabilitado quando count === 0. */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/30">Detalhes por área</p>
                <div className="space-y-2">
                  {rows.map(({ area, count, cfg }) => {
                    const Icon = cfg.icon
                    return (
                      <div key={area} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#111C2E] p-3">
                        {/* Ícone representativo da área */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: cfg.bg }}>
                          <Icon size={15} style={{ color: cfg.color }} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-white/85">{area}</p>
                          {/* Pluralização correta: "solicitação" / "solicitações" */}
                          <p className="text-[11px] text-white/35">{count} solicitaç{count === 1 ? 'ão' : 'ões'}</p>
                        </div>
                        {/* Botão desabilitado quando não há solicitações na área */}
                        <button type="button" disabled={count === 0} onClick={() => onViewArea(area)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.10] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 transition-all hover:border-[#005BFF]/40 hover:text-[#60A5FA] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-white/[0.10] disabled:hover:text-white/60">
                          {count === 0 ? 'Sem solicitações' : <>Ver solicitações<ArrowRight size={10} aria-hidden="true" /></>}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Rodapé: ações rápidas ── */}
        <div className="shrink-0 space-y-2 border-t border-white/[0.08] p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            {/* Filtrar pela área de maior volume (visível apenas quando há dados) */}
            {topArea && topArea.count > 0 && (
              <button type="button" onClick={() => onViewArea(topArea.area)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.10] py-2.5 text-xs font-semibold text-white/60 transition-all hover:border-white/25 hover:text-white/90">
                <Filter size={13} aria-hidden="true" />Filtrar por área
              </button>
            )}
            {/* Exporta o resumo de todas as áreas como CSV */}
            <button type="button" onClick={() => exportSummaryCsv(rows)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.10] py-2.5 text-xs font-semibold text-white/60 transition-all hover:border-white/25 hover:text-white/90">
              <Download size={13} aria-hidden="true" />Exportar resumo
            </button>
          </div>
          {/* Botão principal: navega para a listagem completa de solicitações */}
          <button type="button" onClick={onViewAll}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.22)] transition-all hover:-translate-y-0.5">
            Ver todas
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
