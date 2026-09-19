'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Search, Download, CheckCheck, FileBarChart, ArrowRight, Inbox,
} from 'lucide-react'
import { timeAgo } from './ContactCard'
import {
  buildActivityItems, getDateBucket, DATE_BUCKET_ORDER, getPeriodCutoff,
  ACTIVITY_KIND_LABEL, ACTIVITY_KIND_CONFIG,
  type ActivityLead, type ActivityKind, type ActivityItem, type PeriodKey,
} from './activity'
import type { Contact } from '@/app/admin/solicitacoes/page'

/* Props do drawer de atividades:
   open      — controla se o drawer está visível
   onClose   — callback para fechar o drawer
   contacts  — lista de contatos/solicitações do admin
   leads     — lista de leads recebidos
   onViewArea — abre o drawer de detalhes de uma área de interesse específica */
interface Props {
  open:  boolean
  onClose: () => void
  contacts: Contact[]
  leads:    ActivityLead[]
  onViewArea: (area: string) => void
}

/* Períodos disponíveis para filtrar o histórico de atividades. */
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'hoje',  label: 'Hoje' },
  { key: '7d',    label: '7 dias' },
  { key: '30d',   label: '30 dias' },
  { key: 'todos', label: 'Todos os períodos' },
]

/* Pílulas de filtro por tipo de atividade.
   'todos' é o valor padrão e inclui todas as categorias. */
const KIND_PILLS: { key: ActivityKind | 'todos'; label: string }[] = [
  { key: 'todos',       label: 'Todos' },
  { key: 'lead',        label: ACTIVITY_KIND_LABEL.lead },
  { key: 'solicitacao', label: ACTIVITY_KIND_LABEL.solicitacao },
  { key: 'projeto',     label: ACTIVITY_KIND_LABEL.projeto },
  { key: 'arquivo',     label: ACTIVITY_KIND_LABEL.arquivo },
  { key: 'sistema',     label: ACTIVITY_KIND_LABEL.sistema },
]

/* Exporta o histórico de atividades filtradas como arquivo CSV.
   Campos: Data, Tipo, Título, Categoria, Descrição.
   Valores com aspas são escapados corretamente. */
function exportActivityCsv(items: ActivityItem[]) {
  const header = 'Data,Tipo,Título,Categoria,Descrição'
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = items.map(i => [
    new Date(i.createdAt).toLocaleString('pt-BR'),
    ACTIVITY_KIND_LABEL[i.kind],
    esc(i.title),
    esc(i.category ?? ''),
    esc(i.description),
  ].join(','))
  const csv = [header, ...lines].join('\n')
  // Cria blob CSV e dispara download via link temporário
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'historico-atividades.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/* Drawer lateral de histórico de atividades do admin.
   Exibe leads, solicitações, projetos, arquivos e eventos de sistema
   agrupados por data, com busca, filtros e exportação CSV. */
export default function ActivitiesDrawer({ open, onClose, contacts, leads, onViewArea }: Props) {
  const router = useRouter()
  // Período de tempo selecionado para filtrar atividades
  const [period, setPeriod] = useState<PeriodKey>('todos')
  // Tipo de atividade selecionado (ou 'todos')
  const [kindFilter, setKindFilter] = useState<ActivityKind | 'todos'>('todos')
  // Texto de busca livre
  const [search, setSearch] = useState('')
  // IDs de atividades já visualizadas (para badge de "Novo")
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  // Controla a exibição do painel de relatório resumido
  const [showReport, setShowReport] = useState(false)
  // Ref para o título do drawer (recebe foco ao abrir — acessibilidade)
  const titleRef = useRef<HTMLHeadingElement>(null)

  /* Captura Escape para fechar o drawer e foca o título ao abrir. */
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    titleRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  /* Constrói a lista completa de atividades a partir de contacts e leads.
     Memoizado para não reprocessar a cada render. */
  const allItems = useMemo(() => buildActivityItems(contacts, leads), [contacts, leads])

  /* Filtra atividades pelo período selecionado usando getPeriodCutoff. */
  const periodItems = useMemo(() => {
    const cutoff = getPeriodCutoff(period)
    return cutoff === null ? allItems : allItems.filter(i => new Date(i.createdAt).getTime() >= cutoff)
  }, [allItems, period])

  /* Conta atividades por tipo dentro do período selecionado.
     Usado para exibir o número em cada pílula de filtro. */
  const kindCounts = useMemo(() => {
    const counts: Record<ActivityKind | 'todos', number> = { todos: periodItems.length, lead: 0, solicitacao: 0, projeto: 0, arquivo: 0, sistema: 0 }
    periodItems.forEach(i => { counts[i.kind] += 1 })
    return counts
  }, [periodItems])

  /* Aplica filtros de tipo e busca de texto sobre os itens do período. */
  const filtered = useMemo(() => {
    const byKind = kindFilter === 'todos' ? periodItems : periodItems.filter(i => i.kind === kindFilter)
    const q = search.trim().toLowerCase()
    if (!q) return byKind
    // Busca em título, descrição e categoria (case-insensitive)
    return byKind.filter(i => [i.title, i.description, i.category].some(v => v?.toLowerCase().includes(q)))
  }, [periodItems, kindFilter, search])

  /* Agrupa os itens filtrados por bucket de data (Hoje, Ontem, Esta semana...).
     Respeita a ordem definida em DATE_BUCKET_ORDER. */
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityItem[]>()
    filtered.forEach(item => {
      const bucket = getDateBucket(item.createdAt)
      if (!map.has(bucket)) map.set(bucket, [])
      map.get(bucket)!.push(item)
    })
    return DATE_BUCKET_ORDER.filter(b => map.has(b)).map(b => ({ bucket: b, items: map.get(b)! }))
  }, [filtered])

  // Não renderiza nada quando o drawer está fechado
  if (!open) return null

  // Contadores para o cabeçalho do drawer
  const novasCount = periodItems.filter(i => !seenIds.has(i.id)).length
  const hojeCount  = periodItems.filter(i => getDateBucket(i.createdAt) === 'Hoje').length

  /* Navega para a página correspondente ao tipo de atividade clicada.
     Solicitações: abre o drawer de área | Leads: navega para /admin/leads. */
  const handleItemAction = (item: ActivityItem) => {
    if (item.kind === 'solicitacao' && item.category) { onClose(); onViewArea(item.category); return }
    if (item.kind === 'lead') { onClose(); router.push('/admin/leads'); return }
  }

  /* Marca todas as atividades como vistas, zerando o contador de "Novo". */
  const markAllSeen = () => setSeenIds(new Set(allItems.map(i => i.id)))

  return (
    /* AnimatePresence garante que a animação de saída (exit) seja executada
       antes de desmontar o componente. */
    <AnimatePresence>
      {/* Overlay escuro com blur — fecha o drawer ao clicar.
          Animação: opacidade 0 → 1 (entrada) e 1 → 0 (saída). */}
      <motion.div
        key="activities-drawer-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel do drawer — desliza da direita (x: 32 → 0).
          Largura: 100% mobile | 80% sm | 640px lg+. */}
      <motion.div
        key="activities-drawer-panel"
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 32 }}
        transition={{ duration: 0.22 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activities-drawer-title"
        className="fixed inset-y-0 right-0 z-[70] flex w-full flex-col border-l border-white/[0.08] bg-[#0F172A] shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:w-[80%] lg:w-[640px] lg:rounded-l-3xl"
      >
        {/* ── Cabeçalho: título, filtros de tipo, busca e período ── */}
        <div className="shrink-0 border-b border-white/[0.08] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              {/* Título recebe foco ao abrir (acessibilidade via tabIndex=-1) */}
              <h2 id="activities-drawer-title" ref={titleRef} tabIndex={-1} className="text-lg font-bold text-white outline-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Todas as atividades
              </h2>
              <p className="mt-1 text-xs text-white/40">Acompanhe tudo que acontece na plataforma.</p>
              {/* Contadores: total, novas e hoje */}
              <p className="mt-1.5 text-[11px] text-white/30">
                {periodItems.length} atividade{periodItems.length !== 1 ? 's' : ''} • {novasCount} nova{novasCount !== 1 ? 's' : ''} • {hojeCount} hoje
              </p>
            </div>
            {/* Botão de fechar */}
            <button type="button" onClick={onClose} aria-label="Fechar atividades"
              className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* Pílulas de filtro por tipo de atividade — ativa tem gradiente */}
          <div className="mt-4 flex flex-wrap gap-2 overflow-x-auto" role="group" aria-label="Filtrar por tipo">
            {KIND_PILLS.map(p => {
              const isActive = kindFilter === p.key
              return (
                <button key={p.key} type="button" onClick={() => setKindFilter(p.key)} aria-pressed={isActive}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_12px_rgba(0,91,255,0.30)]'
                      : 'border border-white/[0.08] text-white/45 hover:border-[#005BFF]/40 hover:text-white/80'
                  }`}>
                  {p.label}
                  {/* Contador de itens por tipo */}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isActive ? 'bg-white/25 text-white' : 'bg-white/[0.07] text-white/35'}`}>
                    {kindCounts[p.key]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Campo de busca livre + seletor de período */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {/* Campo de busca com ícone e botão de limpar */}
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
              <input type="text" placeholder="Buscar por cliente, empresa, categoria ou ação..." value={search}
                onChange={e => setSearch(e.target.value)} aria-label="Buscar atividades"
                className="h-10 w-full rounded-xl border border-white/[0.10] bg-[#0F172A] pl-9 pr-8 text-xs text-white placeholder:text-white/25 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15" />
              {/* Botão X para limpar o campo de busca */}
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/30 hover:text-white">
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
            {/* Seletor de período */}
            <select value={period} onChange={e => setPeriod(e.target.value as PeriodKey)} aria-label="Filtrar por período"
              className="h-10 shrink-0 rounded-xl border border-white/[0.10] bg-[#0F172A] px-3 text-xs text-white outline-none focus:border-[#005BFF]/50 sm:w-[170px]">
              {PERIODS.map(p => <option key={p.key} value={p.key} className="bg-[#0D1428]">{p.label}</option>)}
            </select>
          </div>
        </div>

        {/* ── Corpo: lista de atividades agrupadas por data ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Painel de relatório resumido (toggle) */}
          {showReport && (
            <div className="mb-5 rounded-2xl border border-[#005BFF]/25 bg-[#005BFF]/[0.05] p-4">
              <p className="mb-2 text-xs font-bold text-white">Resumo do período</p>
              {/* Grade de contadores por categoria */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { label: 'Total',        value: periodItems.length },
                  { label: 'Leads',        value: kindCounts.lead },
                  { label: 'Solicitações', value: kindCounts.solicitacao },
                  { label: 'Projetos',     value: kindCounts.projeto },
                  { label: 'Arquivos',     value: kindCounts.arquivo },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-white/[0.04] p-2.5">
                    <p className="text-lg font-bold text-white">{s.value}</p>
                    <p className="text-[10px] text-white/40">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estado vazio: nenhum resultado */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] py-14 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(96,165,250,0.10)' }}>
                <Inbox size={22} className="text-[#60A5FA]" aria-hidden="true" />
              </div>
              {/* Mensagem diferente quando há filtros ativos */}
              {search || kindFilter !== 'todos' ? (
                <>
                  <p className="text-sm font-semibold text-white/60">Nenhum resultado para sua busca</p>
                  <p className="mx-auto mt-1.5 max-w-[280px] text-xs text-white/30">
                    Tente buscar por cliente, empresa, categoria ou tipo de atividade.
                  </p>
                  <button type="button" onClick={() => { setSearch(''); setKindFilter('todos') }}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] px-4 py-2 text-xs font-semibold text-white/50 transition-all hover:border-white/20 hover:text-white/80">
                    Limpar filtros
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-white/60">Nenhuma atividade encontrada</p>
                  <p className="mx-auto mt-1.5 max-w-[280px] text-xs text-white/30">
                    Quando novos leads, solicitações, projetos ou arquivos forem registrados, eles aparecerão aqui.
                  </p>
                </>
              )}
            </div>
          ) : (
            /* Lista agrupada por bucket de data (Hoje, Ontem, Esta semana...) */
            <div className="space-y-6">
              {grouped.map(({ bucket, items }) => (
                <div key={bucket}>
                  {/* Rótulo do grupo de data */}
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/30">{bucket}</p>
                  <div className="relative space-y-3">
                    {/* Linha vertical decorativa da timeline */}
                    <div className="pointer-events-none absolute left-[15px] top-2 h-[calc(100%-16px)] w-px bg-white/[0.06]" aria-hidden="true" />
                    {items.map(item => {
                      const cfg = ACTIVITY_KIND_CONFIG[item.kind]
                      const Icon = cfg.icon
                      const isNew = !seenIds.has(item.id)
                      // Apenas leads e solicitações têm ação de navegação
                      const canAct = item.kind === 'solicitacao' || item.kind === 'lead'
                      return (
                        <div key={item.id} className="relative rounded-2xl border border-white/[0.08] bg-[#111827]/80 p-4 transition-colors hover:border-[#005BFF]/40">
                          <div className="flex items-start gap-3">
                            {/* Ícone do tipo de atividade com cor específica */}
                            <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: cfg.bg }}>
                              <Icon size={14} style={{ color: cfg.color }} aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-white/85">{item.title}</p>
                              {/* Categoria e tempo relativo (ex: "há 2 horas") */}
                              <p className="mt-0.5 text-[11px] text-white/35">{item.category ?? 'Geral'} • {timeAgo(item.createdAt)}</p>
                              <p className="mt-2 text-xs leading-relaxed text-white/50">{item.description}</p>
                              <div className="mt-3 flex items-center justify-between gap-2">
                                {/* Badge "Novo" para atividades não visualizadas */}
                                {isNew ? (
                                  <span className="rounded-full bg-[#005BFF]/15 px-2 py-0.5 text-[9px] font-bold text-[#60A5FA]">Novo</span>
                                ) : <span />}
                                {/* Botão de ação contextual (leads → /admin/leads | solicitações → filtro de área) */}
                                {canAct && (
                                  <button type="button" onClick={() => handleItemAction(item)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.10] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 transition-all hover:border-[#005BFF]/40 hover:text-[#60A5FA]">
                                    {cfg.actionLabel}<ArrowRight size={10} aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Rodapé: ações globais ── */}
        <div className="shrink-0 space-y-2 border-t border-white/[0.08] bg-[#0F172A]/95 p-5 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row">
            {/* Marca todas as atividades como vistas */}
            <button type="button" onClick={markAllSeen}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.10] py-2.5 text-xs font-semibold text-white/60 transition-all hover:border-white/25 hover:text-white/90">
              <CheckCheck size={13} aria-hidden="true" />Marcar todas como vistas
            </button>
            {/* Exporta os itens filtrados como CSV */}
            <button type="button" onClick={() => exportActivityCsv(filtered)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.10] py-2.5 text-xs font-semibold text-white/60 transition-all hover:border-white/25 hover:text-white/90">
              <Download size={13} aria-hidden="true" />Exportar histórico
            </button>
          </div>
          {/* Botão principal: alterna exibição do relatório resumido */}
          <button type="button" onClick={() => setShowReport(v => !v)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.22)] transition-all hover:-translate-y-0.5">
            <FileBarChart size={14} aria-hidden="true" />{showReport ? 'Ocultar relatório' : 'Ver relatório'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
