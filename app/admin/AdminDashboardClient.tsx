'use client'

// Importações de hooks React para estado e referência de DOM
import { useState, useRef } from 'react'
import Link from 'next/link'
// Biblioteca de animações para entrada suave de elementos
import { motion } from 'framer-motion'
// Ícones usados nos cards e filtros
import {
  MessageSquare, Download, TrendingUp, Sparkles, Search, X, CheckCircle2,
} from 'lucide-react'
// Layout padrão do painel administrativo (sidebar + header)
import AdminShell from '@/components/layout/AdminShell'
// Card de contato e configurações de área, filtros e rótulos de status
import ContactCard, {
  AREA_CONFIG, DEFAULT_CFG, FILTERS, STATUS_LABEL, STATUS_FILTERS_LIST,
} from '@/components/admin/ContactCard'
// Hook que centraliza todas as ações sobre contatos (atribuir, responder, arquivar, deletar)
import { useContactActions } from '@/components/admin/useContactActions'
// Modais de confirmação para arquivar e excluir contatos
import ContactConfirmModals from '@/components/admin/ContactConfirmModals'
// Card lateral com resumo de contatos por área de interesse
import AreaSummaryCard from '@/components/admin/AreaSummaryCard'
// Card lateral com atividades recentes de contatos e leads
import RecentActivityCard from '@/components/admin/RecentActivityCard'
// Modal de resposta ao contato (com suporte a rascunho)
import ResponseModal from './solicitacoes/ResponseModal'
// Modal de início de análise técnica de uma solicitação
import StartAnalysisModal from './solicitacoes/StartAnalysisModal'
// Tipos de dados usados ao longo do painel
import type { Contact, ResponseTemplate, ContactResponse, ContactActivity } from './solicitacoes/page'
import type { Technician, Lead } from '@/types'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* Retorna o timestamp de 7 dias atrás para filtrar contatos da semana */
function getWeekAgo(): number {
  return Date.now() - 7 * 86400000
}

/* Props recebidas do Server Component que busca os dados no Supabase */
interface Props {
  user:        SupabaseUser                        // Usuário autenticado (Supabase Auth)
  profile:     { full_name?: string; is_leader?: boolean } | null  // Perfil do técnico
  isLeader:    boolean                             // Indica se o usuário é Técnico Líder
  contacts:    Contact[]                           // Lista de solicitações/contatos do site
  technicians: Technician[]                        // Lista de técnicos disponíveis para atribuição
  templates:   ResponseTemplate[]                  // Templates pré-definidos de resposta
  responses:   Record<string, ContactResponse[]>   // Respostas indexadas por ID de contato
  activity:    Record<string, ContactActivity[]>   // Histórico de atividades por contato
  leads:       Lead[]                              // Leads capturados via download de materiais
}

/* ── Componente principal do painel técnico ─────────────────────────────── */
export default function AdminDashboardClient({ user, profile, isLeader, contacts: initialContacts, technicians, templates, responses, activity, leads }: Props) {
  // Filtro de área de interesse ativo (ex: "Software", "Automação")
  const [activeFilter, setActiveFilter] = useState('Todos')
  // Filtro de status dos contatos (ex: "novo", "em_analise")
  const [statusFilter, setStatusFilter] = useState('todos')
  // Texto de busca livre (nome, email, empresa, telefone)
  const [search, setSearch] = useState('')
  // ID do contato com painel expandido (apenas um por vez)
  const [expanded, setExpanded] = useState<string | null>(null)

  /* Hook que gerencia estado e ações dos contatos: atribuição, status, resposta, análise, arquivo e exclusão */
  const {
    contacts,
    localAssignees, assigningId, handleAssign,
    savingId, handleStatusChange,
    respondingContact, setRespondingContact, handleRespond, handleResponseSent,
    analysisContact, setAnalysisContact, handleStartAnalysis, handleAnalysisConfirmed,
    archiveTarget, setArchiveTarget, archivingId, handleArchive, confirmArchive,
    deleteTarget, setDeleteTarget, deletingId, handleDeletePermanently, confirmDelete,
  } = useContactActions({ user, initialContacts })

  // Primeiro nome do técnico logado para saudação personalizada
  const firstName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Admin'

  // Contatos recebidos nos últimos 7 dias
  const thisWeek    = contacts.filter(c => new Date(c.created_at) > new Date(getWeekAgo()))
  // Contagens por status para o painel lateral de resumo
  const countNovo   = contacts.filter(c => !c.status || c.status === 'novo').length
  const countAnalise= contacts.filter(c => c.status === 'em_analise').length
  const countResp   = contacts.filter(c => c.status === 'respondido').length
  const countArq    = contacts.filter(c => c.status === 'arquivado').length
  // Total de itens que exigem ação (novo + em análise)
  const pendentes   = countNovo + countAnalise

  /* Encontra a área de interesse com mais contatos para exibir no card de métricas */
  const topAreaEntry = Object.entries(
    contacts.reduce<Record<string, number>>((acc, c) => {
      const k = c.interest_area || 'Sem área'
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])[0]

  /* Contagem de contatos por filtro de área — usado nos chips de filtro */
  const filterCounts: Record<string, number> = { Todos: contacts.length }
  FILTERS.slice(1).forEach(f => {
    filterCounts[f] = contacts.filter(c => c.interest_area === f).length
  })

  /* Mapa de contagem por status para exibir no badge de cada filtro de status */
  const countByStatus: Record<string, number> = { novo: countNovo, em_analise: countAnalise, respondido: countResp, arquivado: countArq }

  /* Lista filtrada de contatos considerando área, status e busca textual.
     Contatos arquivados só aparecem quando o filtro de status é "arquivado" explicitamente. */
  const filtered = contacts.filter(c => {
    const matchFilter = activeFilter === 'Todos' || c.interest_area === activeFilter
    const cStatus = c.status ?? 'novo'
    const matchStatus = statusFilter === 'todos' ? cStatus !== 'arquivado' : cStatus === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q
      || c.name.toLowerCase().includes(q)
      || c.email.toLowerCase().includes(q)
      || (c.company ?? '').toLowerCase().includes(q)
      || (c.phone ?? '').includes(q)
    return matchFilter && matchStatus && matchSearch
  })

  // Referência para a seção de lista — usada pelo scroll suave ao clicar em "Ver área"
  const listRef = useRef<HTMLDivElement>(null)
  // Rola suavemente até a lista de contatos
  const scrollToList = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // Ativa filtro de área e rola até a lista
  const handleViewArea = (area: string) => { setActiveFilter(area); scrollToList() }
  // Limpa filtro de área e rola até a lista
  const handleViewAll  = () => { setActiveFilter('Todos'); scrollToList() }

  return (
    <>
    <AdminShell user={user} profile={profile}>
      <div className="space-y-7">

        {/* ── HERO: saudação e barra de resumo rápido ────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Painel técnico LOBBY
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Gerencie solicitações, leads e oportunidades em tempo real.
          </p>

          {/* Barra de resumo: nome do técnico, status online, tempo de resposta médio, pendentes */}
          <div className="mt-5 overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0F172A]/80">
            <div
              className="absolute pointer-events-none inset-0 rounded-3xl opacity-30"
              style={{ background: 'radial-gradient(ellipse at 80% 50%, rgba(0,91,255,0.18), transparent 55%)' }}
              aria-hidden="true"
            />
            <div className="relative flex flex-col divide-y divide-white/[0.06] sm:flex-row sm:divide-x sm:divide-y-0">
              {/* Saudação com inicial do nome em avatar colorido */}
              <div className="flex items-center gap-4 px-5 py-4 sm:flex-1">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
                >
                  {firstName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Olá, {firstName}! 👋</p>
                  <p className="text-xs text-white/40">
                    {pendentes === 0
                      ? 'Nenhuma solicitação pendente no momento.'
                      : `Você tem ${pendentes} solicitaç${pendentes > 1 ? 'ões' : 'ão'} pendente${pendentes > 1 ? 's' : ''}.`
                    }
                  </p>
                </div>
              </div>
              {/* Indicador visual de status online */}
              <div className="flex items-center gap-2 px-5 py-4">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#10B981]">
                  <span className="h-2 w-2 rounded-full bg-[#10B981]" aria-hidden="true" />
                  Online
                </span>
              </div>
              {/* Tempo médio de resposta (valor fixo de referência) */}
              <div className="px-5 py-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider">Resp. médio</p>
                <p className="mt-0.5 text-sm font-bold text-white">2h</p>
              </div>
              {/* Número total de contatos pendentes de ação */}
              <div className="px-5 py-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider">Pendentes</p>
                <p className="mt-0.5 text-sm font-bold text-[#FBBF24]">{contacts.length}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── MÉTRICAS: 4 cards com indicadores chave do painel ──────── */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { icon: MessageSquare, label: 'Pendentes de resposta', value: pendentes.toString(), sub: `${countResp} respondida${countResp !== 1 ? 's' : ''}`, color: '#60A5FA', grad: '#3B82F6' },
            { icon: TrendingUp,    label: 'Esta semana',           value: thisWeek.length.toString(), sub: 'Novo lead recebido',        color: '#34D399', grad: '#10B981' },
            { icon: Download,      label: 'Leads de material',     value: leads.length.toString(),    sub: 'Origem: formulário',         color: '#A78BFA', grad: '#8B5CF6' },
            { icon: Sparkles,      label: 'Área mais solicitada',  value: topAreaEntry?.[0] ?? '—',   sub: 'Categoria principal',        color: '#FBBF24', grad: '#F59E0B' },
          ].map(({ icon: Icon, label, value, sub, color, grad }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.15] hover:shadow-[0_12px_40px_rgba(0,0,0,0.30)]"
            >
              {/* Linha de destaque colorida no topo do card */}
              <div
                className="absolute inset-x-0 top-0 h-0.5"
                style={{ background: `linear-gradient(to right, ${grad}, transparent)` }}
                aria-hidden="true"
              />
              <div
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: `${color}18` }}
              >
                <Icon size={18} style={{ color }} aria-hidden="true" />
              </div>
              <p className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {value}
              </p>
              <p className="mt-0.5 text-xs text-white/40">{label}</p>
              <p className="mt-1.5 text-[10px]" style={{ color: `${color}99` }}>{sub}</p>
            </motion.div>
          ))}
        </div>

        {/* ── GRID PRINCIPAL: lista de contatos + sidebar ────────────── */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.7fr]">

          {/* ── SEÇÃO DE CONTATOS / SOLICITAÇÕES ─────────────────────── */}
          <motion.section
            ref={listRef}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            aria-label="Solicitações dos clientes"
          >
            {/* Cabeçalho da seção com contagem de itens filtrados */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Solicitações dos clientes
                <span className="ml-2 text-sm font-normal text-white/30">({filtered.length})</span>
              </h2>
            </div>

            {/* Campo de busca livre por nome, email, empresa ou telefone */}
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
                onChange={e => setSearch(e.target.value)}
                aria-label="Buscar solicitações"
                className="h-11 w-full rounded-2xl border border-white/[0.10] bg-[#0F172A] pl-11 pr-10 text-sm text-white placeholder:text-white/25 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15"
              />
              {/* Botão para limpar busca — aparece somente quando há texto digitado */}
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/30 hover:text-white"
                  aria-label="Limpar busca"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Chips de filtro por status: Todos / Novo / Em análise / Respondido / Arquivado */}
            <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
              {STATUS_FILTERS_LIST.map(s => {
                const isActive = statusFilter === s
                const label = s === 'todos' ? 'Todos status' : (STATUS_LABEL[s] ?? s)
                const count = s === 'todos' ? contacts.length : (countByStatus[s] ?? 0)
                return (
                  <button key={s} type="button" onClick={() => setStatusFilter(s)} aria-pressed={isActive}
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

            {/* Chips de filtro por área de interesse (Todos, Software, Automação, etc.) */}
            <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar por área">
              {FILTERS.map(f => {
                const isActive = activeFilter === f
                const cfg = f !== 'Todos' ? (AREA_CONFIG[f] ?? DEFAULT_CFG) : null
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    aria-pressed={isActive}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_12px_rgba(0,91,255,0.30)]'
                        : 'border border-white/[0.08] bg-white/[0.04] text-white/45 hover:border-[#005BFF]/40 hover:text-white/80'
                    }`}
                  >
                    {/* Ícone da área quando não é "Todos" */}
                    {cfg && <cfg.icon size={11} style={{ color: isActive ? 'white' : cfg.color }} aria-hidden="true" />}
                    {f}
                    {/* Badge com contagem de contatos nessa área */}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                        isActive ? 'bg-white/25 text-white' : 'bg-white/[0.08] text-white/40'
                      }`}
                    >
                      {filterCounts[f] ?? 0}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Lista de cards de contatos ou estado vazio */}
            {filtered.length > 0 ? (
              <div className="space-y-4">
                {filtered.map((c, i) => {
                  // Técnico atribuído ao contato (preferência pelo estado local otimista)
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
              /* Estado vazio: exibe mensagem contextual conforme busca ativa ou não */
              <div className="rounded-3xl border border-dashed border-white/[0.10] bg-white/[0.02] p-12 text-center">
                <div
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ background: 'rgba(96,165,250,0.10)' }}
                >
                  <MessageSquare size={22} className="text-[#60A5FA]" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-white/50">
                  {search ? 'Nenhum resultado para essa busca.' : 'Nenhuma solicitação encontrada'}
                </p>
                <p className="mt-1.5 text-xs text-white/25">
                  {search
                    ? 'Tente outros termos.'
                    : 'Quando um cliente enviar uma solicitação, ela aparecerá aqui.'
                  }
                </p>
                {/* Link para o site público quando não há busca ativa */}
                {!search && (
                  <Link
                    href="/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] px-4 py-2 text-xs font-semibold text-white/50 transition-all hover:border-white/20 hover:text-white/80"
                  >
                    Ver site
                  </Link>
                )}
              </div>
            )}
          </motion.section>

          {/* ── SIDEBAR DIREITA ──────────────────────────────────────── */}
          <aside className="space-y-5">
            {/* Distribuição de contatos por área — permite clicar para filtrar */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <AreaSummaryCard contacts={contacts} onViewArea={handleViewArea} onViewAll={handleViewAll} />
            </motion.div>

            {/* Feed de atividade recente: últimas solicitações e leads */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <RecentActivityCard contacts={contacts} leads={leads} onViewArea={handleViewArea} />
            </motion.div>

            {/* Card de status geral: resumo numérico de todos os estágios */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-3xl border border-white/[0.08] bg-[#0F172A]/80 p-5"
            >
              <h3 className="mb-4 text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Status geral
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Novas',          value: countNovo,    color: '#60A5FA' },
                  { label: 'Em análise',     value: countAnalise, color: '#A78BFA' },
                  { label: 'Respondidas',    value: countResp,    color: '#34D399' },
                  { label: 'Arquivadas',     value: countArq,     color: '#64748B' },
                  { label: 'Leads material', value: leads.length, color: '#F59E0B' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={12} style={{ color }} aria-hidden="true" />
                      <span className="text-xs text-white/50">{label}</span>
                    </div>
                    <span className="text-xs font-bold text-white/80">{value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </aside>
        </div>

      </div>
    </AdminShell>

    {/* Modal de resposta — aparece quando um contato é selecionado para responder */}
    {respondingContact && (
      <ResponseModal
        contact={respondingContact}
        templates={templates}
        existingDraft={
          // Tenta carregar rascunho existente para o contato
          (responses[respondingContact.id] ?? []).find(r => r.is_draft) ?? null
        }
        onClose={() => setRespondingContact(null)}
        onSent={handleResponseSent}
      />
    )}

    {/* Modal de início de análise — aparece ao clicar em "Iniciar análise" em um contato */}
    {analysisContact && (
      <StartAnalysisModal
        contact={analysisContact}
        technicianName={profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Técnico'}
        onClose={() => setAnalysisContact(null)}
        onConfirm={handleAnalysisConfirmed}
      />
    )}

    {/* Modais de confirmação para arquivar e excluir permanentemente contatos */}
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
