'use client'

import { useState, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  MessageSquare, Clock,
  Search, X, CheckCircle2,
  ChevronLeft, ChevronRight,
  CircleDot,
} from 'lucide-react'
import AdminShell from '@/components/layout/AdminShell'
import ContactCard, {
  AREA_CONFIG, DEFAULT_CFG, FILTERS, STATUS_LABEL, STATUS_FILTERS_LIST,
} from '@/components/admin/ContactCard'
import { useContactActions } from '@/components/admin/useContactActions'
import ContactConfirmModals from '@/components/admin/ContactConfirmModals'
import AreaSummaryCard from '@/components/admin/AreaSummaryCard'
import RecentActivityCard from '@/components/admin/RecentActivityCard'
import ResponseModal from './ResponseModal'
import StartAnalysisModal from './StartAnalysisModal'
import type { Contact, ResponseTemplate, ContactResponse, ContactActivity } from './page'
import type { Technician } from '@/types'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ── Types ──────────────────────────────────────────────────────── */

// Props recebidas pelo Server Component page.tsx após buscar dados no Supabase.
// Todos os dados chegam pré-carregados — este componente apenas gerencia estado local.
interface Props {
  user:        SupabaseUser           // Usuário autenticado (técnico)
  profile:     { full_name?: string; is_leader?: boolean } | null
  isLeader:    boolean                // Atalho para profile.is_leader — controla ações exclusivas de líder
  contacts:    Contact[]              // Solicitações de contato recebidas pelo formulário público
  technicians: Technician[]           // Lista de técnicos disponíveis para atribuição
  templates:   ResponseTemplate[]     // Modelos de resposta cadastrados no admin
  responses:   Record<string, ContactResponse[]>  // Respostas já enviadas, indexadas por contact.id
  activity:    Record<string, ContactActivity[]>  // Histórico de atividades por contact.id
}

// Número de solicitações exibidas por página na listagem
const ITEMS_PER_PAGE = 10

/* ── Main component ─────────────────────────────────────────────── */

// Componente principal da tela /admin/solicitacoes.
// Renderiza estatísticas, filtros, lista paginada e sidebar de resumo.
export default function SolicitacoesClient({ user, profile, isLeader, contacts: initialContacts, technicians, templates, responses, activity }: Props) {
  // Filtro de área de interesse (ex: 'Software', 'Dados')
  const [filter,       setFilter]       = useState('Todos')
  // Filtro de status da solicitação (novo, em_analise, respondido, arquivado)
  const [statusFilter, setStatusFilter] = useState('todos')
  // Texto de busca livre nos campos do contato
  const [search,       setSearch]       = useState('')
  // ID da solicitação com detalhes expandidos (accordion)
  const [expanded,     setExpanded]     = useState<string | null>(null)
  // Página atual da listagem paginada
  const [page,         setPage]         = useState(0)

  // Hook que centraliza todas as ações sobre contatos:
  // atribuição de técnico, mudança de status, resposta, análise, arquivo e exclusão.
  const {
    contacts,
    localAssignees, assigningId, handleAssign,
    savingId, handleStatusChange,
    respondingContact, setRespondingContact, handleRespond, handleResponseSent,
    analysisContact, setAnalysisContact, handleStartAnalysis, handleAnalysisConfirmed,
    archiveTarget, setArchiveTarget, archivingId, handleArchive, confirmArchive,
    deleteTarget, setDeleteTarget, deletingId, handleDeletePermanently, confirmDelete,
  } = useContactActions({ user, initialContacts })

  // Lista filtrada aplicando área, status e texto de busca em conjunto.
  // Por padrão (statusFilter='todos') exclui arquivados para não poluir a lista principal.
  const filtered = useMemo(() => {
    return contacts.filter(c => {
      const matchArea   = filter === 'Todos' || c.interest_area === filter
      const cStatus = c.status ?? 'novo'
      const matchStatus = statusFilter === 'todos' ? cStatus !== 'arquivado' : cStatus === statusFilter
      const q = search.toLowerCase()
      const matchS = !q || [c.name, c.email, c.company, c.interest_area, c.message]
        .some(v => v?.toLowerCase().includes(q))
      return matchArea && matchStatus && matchS
    })
  }, [contacts, filter, statusFilter, search])

  // Cálculo de paginação: totalPages garante mínimo 1 para evitar divisão por zero
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE)

  // Ref para rolar a tela até o início da lista ao mudar de filtro/área
  const listRef = useRef<HTMLDivElement>(null)
  const scrollToList = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Handlers que resetam a página ao mudar filtros (evitar página fora do range)
  const handleFilter       = (f: string) => { setFilter(f);       setPage(0) }
  const handleStatusFilter = (s: string) => { setStatusFilter(s); setPage(0) }
  const handleSearch       = (v: string) => { setSearch(v);       setPage(0) }
  // Atalhos usados pelos cards da sidebar para filtrar e rolar até a lista
  const handleViewArea     = (area: string) => { handleFilter(area); scrollToList() }
  const handleViewAll      = () => { handleFilter('Todos'); scrollToList() }

  // Contagem de solicitações por área — alimenta os chips de filtro com o badge numérico
  const filterCounts: Record<string, number> = { Todos: contacts.length }
  FILTERS.slice(1).forEach(f => { filterCounts[f] = contacts.filter(c => c.interest_area === f).length })

  // Status counts reais
  // Contagem real de contatos por status — alimenta os chips de status e os cards de stats
  const countByStatus = useMemo(() => {
    const m: Record<string, number> = { novo: 0, em_analise: 0, respondido: 0, arquivado: 0 }
    contacts.forEach(c => { const s = c.status ?? 'novo'; m[s] = (m[s] ?? 0) + 1 })
    return m
  }, [contacts])

  // Cards de estatísticas exibidos no topo da página
  const stats = [
    { icon: MessageSquare, label: 'Total',       value: contacts.length,           color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  grad: '#3B82F6' },
    { icon: CircleDot,     label: 'Novos',       value: countByStatus.novo,         color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  grad: '#F59E0B' },
    { icon: Clock,         label: 'Em análise',  value: countByStatus.em_analise,   color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', grad: '#8B5CF6' },
    { icon: CheckCircle2,  label: 'Respondidos', value: countByStatus.respondido,   color: '#34D399', bg: 'rgba(52,211,153,0.12)',  grad: '#10B981' },
  ]

  return (
    <>
    <AdminShell user={user} profile={profile}>
      <div className="space-y-7">

        {/* ── PAGE HEADER ──────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Solicitações
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Gerencie todas as solicitações de soluções enviadas pelos clientes.
          </p>
        </motion.div>

        {/* ── STATS ────────────────────────────────────────────── */}
        {/* Cards numéricos no topo — exibem contagens por status com delay escalonado */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map(({ icon: Icon, label, value, color, bg, grad }, i) => (
            <motion.article
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06 }}
              className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/35 hover:shadow-[0_12px_40px_rgba(0,91,255,0.15)]"
            >
              {/* Linha colorida no topo do card — cor diferente por status */}
              <div
                className="absolute inset-x-0 top-0 h-0.5"
                style={{ background: `linear-gradient(to right, ${grad}, transparent)` }}
                aria-hidden="true"
              />
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: bg }}
                >
                  <Icon size={19} style={{ color }} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {value}
                  </p>
                  <p className="text-[11px] text-white/40">{label}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        {/* ── MAIN GRID ────────────────────────────────────────── */}
        {/* Layout de duas colunas: lista à esquerda (maior) e sidebar à direita */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.7fr]">

          {/* ── LEFT: FILTERS + LIST ─────────────────────────── */}
          <div ref={listRef} className="space-y-5">

            {/* Bloco de busca + chips de filtro */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-3xl border border-white/[0.08] bg-[#0F172A]/80 p-4"
            >
              {/* Campo de busca livre — filtra por nome, e-mail, empresa, área e mensagem */}
              <div className="relative mb-4">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  placeholder="Buscar por nome, e-mail, empresa ou telefone..."
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  aria-label="Buscar solicitações"
                  className="h-11 w-full rounded-2xl border border-white/[0.10] bg-[#111827] pl-11 pr-10 text-sm text-white placeholder:text-white/25 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15"
                />
                {/* Botão de limpar busca — aparece apenas quando há texto */}
                {search && (
                  <button
                    type="button"
                    onClick={() => handleSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/30 hover:text-white transition-colors"
                    aria-label="Limpar busca"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Filter chips */}
              {/* Filtro por status */}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
                {STATUS_FILTERS_LIST.map(s => {
                  const isActive = statusFilter === s
                  const label = s === 'todos' ? 'Todos status' : (STATUS_LABEL[s] ?? s)
                  const count = s === 'todos' ? contacts.length : (countByStatus[s] ?? 0)
                  return (
                    <button key={s} type="button" onClick={() => handleStatusFilter(s)} aria-pressed={isActive}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'border border-white/[0.07] text-white/40 hover:text-white/70'
                      }`}
                    >
                      {label}
                      <span className={`rounded-full px-1 text-[9px] font-bold ${isActive ? 'bg-white/20' : 'bg-white/[0.07] text-white/30'}`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Filtro por área */}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por área">
                {FILTERS.map(f => {
                  const isActive = filter === f
                  // cfg traz ícone e cor específicos para cada área de interesse
                  const cfg = f !== 'Todos' ? (AREA_CONFIG[f] ?? DEFAULT_CFG) : null
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => handleFilter(f)}
                      aria-pressed={isActive}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_14px_rgba(0,91,255,0.30)]'
                          : 'border border-white/[0.08] bg-white/[0.04] text-white/45 hover:border-[#005BFF]/40 hover:text-white/80'
                      }`}
                    >
                      {cfg && <cfg.icon size={11} style={{ color: isActive ? 'white' : cfg.color }} aria-hidden="true" />}
                      {f}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isActive ? 'bg-white/25 text-white' : 'bg-white/[0.07] text-white/35'}`}>
                        {filterCounts[f] ?? 0}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Contagem de resultados após aplicar todos os filtros */}
              <p className="mt-3 text-[11px] text-white/25">
                {filtered.length} solicitação{filtered.length !== 1 ? 'ões' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
              </p>
            </motion.div>

            {/* Lista de cards de contato — renderiza a fatia atual da paginação */}
            {paginated.length > 0 ? (
              <div className="space-y-4">
                {paginated.map((c, i) => {
                  // Resolve o técnico atribuído localmente (otimistic update) ou do servidor
                  const assigneeId = localAssignees[c.id] ?? null
                  const assignee   = technicians.find(t => t.id === assigneeId) ?? null
                  return (
                    <ContactCard
                      key={c.id}
                      contact={c}
                      index={i}
                      expanded={expanded === c.id}
                      onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                      onStatusChange={handleStatusChange}
                      savingId={savingId}
                      assignee={assignee}
                      onClaim={() => handleAssign(c.id, user.id)}
                      onAssign={(techId) => handleAssign(c.id, techId)}
                      isAssigning={assigningId === c.id}
                      onRespond={handleRespond}
                      onStartAnalysis={handleStartAnalysis}
                      onArchive={handleArchive}
                      onDeletePermanently={handleDeletePermanently}
                      userId={user.id}
                      isLeader={isLeader}
                      technicians={technicians}
                      responses={responses[c.id] ?? []}
                      activity={activity[c.id] ?? []}
                    />
                  )
                })}
              </div>
            ) : (
              /* Estado vazio — orienta o técnico sobre o que esperar ou sugere limpar filtros */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-3xl border border-dashed border-white/[0.10] bg-white/[0.02] p-12 text-center"
              >
                <div
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ background: 'rgba(96,165,250,0.10)' }}
                >
                  <MessageSquare size={22} className="text-[#60A5FA]" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-white/50">Nenhuma solicitação encontrada</p>
                <p className="mt-1.5 text-xs text-white/25">
                  {search
                    ? 'Tente outros termos de busca.'
                    : 'Quando um cliente enviar uma solicitação dessa categoria, ela aparecerá aqui.'
                  }
                </p>
                {/* Botão de limpar filtros — só aparece quando algum filtro ou busca está ativo */}
                {(filter !== 'Todos' || search) && (
                  <button
                    type="button"
                    onClick={() => { handleFilter('Todos'); handleSearch('') }}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] px-4 py-2 text-xs font-semibold text-white/45 transition-all hover:border-white/20 hover:text-white/70"
                  >
                    Limpar filtros
                  </button>
                )}
              </motion.div>
            )}

            {/* Controles de paginação — só exibido se há resultados */}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between pt-1">
                {/* Texto "Mostrando X–Y de Z solicitações" */}
                <p className="text-[11px] text-white/30">
                  Mostrando {Math.min(page * ITEMS_PER_PAGE + 1, filtered.length)}–{Math.min((page + 1) * ITEMS_PER_PAGE, filtered.length)} de {filtered.length} solicitação{filtered.length !== 1 ? 'ões' : ''}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/40 transition-all hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                  </button>
                  {/* Botões numéricos de página — cada um navega diretamente */}
                  {Array.from({ length: totalPages }).map((_, pi) => (
                    <button
                      key={pi}
                      type="button"
                      onClick={() => setPage(pi)}
                      className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                        pi === page
                          ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_10px_rgba(0,91,255,0.25)]'
                          : 'border border-white/[0.08] bg-white/[0.04] text-white/40 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {pi + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/40 transition-all hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Próxima página"
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: SIDEBAR ───────────────────────────────── */}
          {/* Sidebar com resumo por área, atividade recente e painel de status geral */}
          <aside className="space-y-5">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              {/* Resumo de contatos por área — clique filtra a lista principal */}
              <AreaSummaryCard contacts={contacts} onViewArea={handleViewArea} onViewAll={handleViewAll} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              {/* Atividade recente — mostra os contatos mais novos independente de filtro */}
              <RecentActivityCard contacts={contacts} leads={[]} onViewArea={handleViewArea} />
            </motion.div>

            {/* Painel de status geral — visão rápida das contagens por status */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5"
            >
              <h3 className="mb-4 text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Status geral
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Novos',      value: countByStatus.novo,       color: '#60A5FA' },
                  { label: 'Em análise', value: countByStatus.em_analise, color: '#FBBF24' },
                  { label: 'Respondidos',value: countByStatus.respondido, color: '#34D399' },
                  { label: 'Arquivados', value: countByStatus.arquivado,  color: '#64748B' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
                      <span className="text-xs text-white/45">{label}</span>
                    </div>
                    <span className="text-xs font-bold text-white/70">{value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </aside>
        </div>

      </div>
    </AdminShell>

    {/* Modal de resposta — aberto quando o técnico clica em "Responder" em um contato */}
    {respondingContact && (
      <ResponseModal
        contact={respondingContact}
        templates={templates}
        existingDraft={
          // Carrega o rascunho existente caso o técnico já tenha salvo um anteriormente
          (responses[respondingContact.id] ?? []).find(r => r.is_draft) ?? null
        }
        onClose={() => setRespondingContact(null)}
        onSent={handleResponseSent}
      />
    )}

    {/* Modal de início de análise — abre quando o técnico clica em "Iniciar análise" */}
    {analysisContact && (
      <StartAnalysisModal
        contact={analysisContact}
        technicianName={profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Técnico'}
        onClose={() => setAnalysisContact(null)}
        onConfirm={handleAnalysisConfirmed}
      />
    )}

    {/* Modais de confirmação para arquivar e excluir permanentemente */}
    <ContactConfirmModals
      archiveTarget={archiveTarget}
      archivingId={archivingId}
      onCancelArchive={() => setArchiveTarget(null)}
      onConfirmArchive={confirmArchive}
      deleteTarget={deleteTarget}
      deletingId={deletingId}
      onCancelDelete={() => setDeleteTarget(null)}
      onConfirmDelete={confirmDelete}
    />
    </>
  )
}
