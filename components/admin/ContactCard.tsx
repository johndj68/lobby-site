'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Mail, Phone, Building2, Clock,
  Code2, Settings2, BarChart3, Shield, Sparkles,
  Eye, Send, Check, Activity,
  Loader2, CircleDot, Archive, RotateCcw, Trash2,
  UserPlus, History, MessageCircle, ExternalLink,
} from 'lucide-react'
import { colors, gradients, shadows } from '@/lib/design-tokens'
import { timeAgo } from '@/lib/utils'
import type { Contact, ContactResponse, ContactActivity } from '@/app/admin/solicitacoes/page'
import type { Technician } from '@/types'

/* ── Config compartilhado (card + filtros) ─────────────────────────── */

/**
 * Mapeia cada área de interesse para o ícone, cor, fundo e cor de destaque
 * usados tanto nos cards de contato quanto nos filtros da página.
 * Centralizar aqui evita duplicação entre componentes.
 */
export const AREA_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; accent: string }> = {
  'Software':             { icon: Code2,     color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  accent: '#3B82F6' },
  'Automação':            { icon: Settings2, color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', accent: '#8B5CF6' },
  'Dados':                { icon: BarChart3, color: '#38BDF8', bg: 'rgba(56,189,248,0.12)',  accent: '#0EA5E9' },
  'Cibersegurança':       { icon: Shield,    color: '#34D399', bg: 'rgba(52,211,153,0.12)',  accent: '#10B981' },
  'Diagnóstico gratuito': { icon: Sparkles,  color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  accent: '#F59E0B' },
}

// Configuração padrão usada quando a área de interesse não consta no AREA_CONFIG acima
export const DEFAULT_CFG = { icon: MessageSquare, color: '#94A3B8', bg: 'rgba(148,163,184,0.10)', accent: '#64748B' }

// Lista de filtros disponíveis na página de solicitações (inclui "Todos" como primeira opção)
export const FILTERS = ['Todos', 'Software', 'Automação', 'Dados', 'Cibersegurança', 'Diagnóstico gratuito']

// Rótulos legíveis para cada status de solicitação
export const STATUS_LABEL: Record<string, string> = {
  novo:        'Novo',
  em_analise:  'Em análise',
  respondido:  'Respondido',
  arquivado:   'Arquivado',
}

// Rótulos legíveis para cada nível de prioridade
export const PRIORITY_LABEL: Record<string, string> = {
  alta:  'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

// Classes Tailwind para o badge de status — cada status tem cor própria para identificação visual rápida
export const STATUS_STYLE: Record<string, string> = {
  novo:        'border-[#005BFF]/30 bg-[#005BFF]/[0.12] text-[#60A5FA]',
  em_analise:  'border-[#7B2CFF]/30 bg-[#7B2CFF]/[0.12] text-[#A78BFA]',
  respondido:  'border-[#10B981]/30 bg-[#10B981]/[0.12] text-[#34D399]',
  arquivado:   'border-white/10 bg-white/[0.05] text-white/40',
}

// Classes Tailwind para o badge de prioridade — vermelho/amarelo/verde seguindo convenção semântica
export const PRIORITY_STYLE: Record<string, string> = {
  alta:  'border-[#EF4444]/30 bg-[#EF4444]/[0.12] text-[#F87171]',
  media: 'border-[#F59E0B]/30 bg-[#F59E0B]/[0.12] text-[#FBBF24]',
  baixa: 'border-[#10B981]/30 bg-[#10B981]/[0.12] text-[#34D399]',
}

// Status transition actions
/**
 * Define quais ações de transição de status estão disponíveis para cada status atual.
 * Por exemplo, um contato "novo" só pode ser arquivado; um "arquivado" só pode ser reaberto.
 */
export const STATUS_NEXT: Record<string, { label: string; icon: React.ElementType; next: string }[]> = {
  novo:       [{ label: 'Arquivar', icon: Archive, next: 'arquivado' }],
  em_analise: [{ label: 'Arquivar', icon: Archive, next: 'arquivado' }],
  respondido: [{ label: 'Arquivar', icon: Archive, next: 'arquivado' }],
  arquivado:  [{ label: 'Reabrir', icon: RotateCcw, next: 'novo' }],
}

// Lista ordenada de todos os filtros de status disponíveis na barra de filtros da página
export const STATUS_FILTERS_LIST = ['todos', 'novo', 'em_analise', 'respondido', 'arquivado']

export { timeAgo }

/* ── Contact card ───────────────────────────────────────────────── */

/**
 * Card que exibe os dados de um contato/lead recebido pelo sistema.
 * Contém header com nome, área, status e prioridade, além de ações
 * como responder, iniciar análise, arquivar e atribuir para técnicos.
 * Quando expandido, mostra a mensagem original, histórico de atividades
 * e histórico de respostas enviadas.
 *
 * Props:
 * - contact: dados do contato (nome, e-mail, empresa, mensagem, status, etc.)
 * - index: posição na lista, usada para animar a entrada com delay escalonado
 * - expanded: controla se o painel de mensagem/histórico está visível
 * - onToggle: abre/fecha o painel expandido
 * - onStatusChange: callback para mudança direta de status (ex: reabrir)
 * - savingId: id do contato que está sendo salvo (exibe spinner)
 * - assignee: técnico atualmente atribuído ao contato (null se livre)
 * - onClaim: técnico pega a solicitação para si mesmo
 * - onAssign: líder atribui a solicitação a um técnico específico
 * - isAssigning: estado de carregamento da atribuição
 * - onRespond: abre modal de resposta por e-mail
 * - onStartAnalysis: muda status para "em_analise"
 * - onArchive: abre modal de confirmação de arquivamento
 * - onDeletePermanently: abre modal de exclusão permanente (só líderes)
 * - userId: id do usuário logado, usado para identificar "minha solicitação"
 * - isLeader: controla visibilidade de ações exclusivas do líder
 * - technicians: lista de técnicos disponíveis para atribuição
 * - responses: respostas enviadas a este contato
 * - activity: log de ações realizadas neste contato
 */
export default function ContactCard({ contact, index, expanded, onToggle, onStatusChange, savingId, assignee, onClaim, onAssign, isAssigning, onRespond, onStartAnalysis, onArchive, onDeletePermanently, userId, isLeader, technicians, responses, activity }: {
  contact:        Contact
  index:          number
  expanded:       boolean
  onToggle:       () => void
  onStatusChange: (id: string, newStatus: string) => void
  savingId:       string | null
  assignee:       Technician | null
  onClaim:        () => void
  onAssign:       (techId: string) => void
  isAssigning:    boolean
  onRespond:      (contact: Contact) => void
  onStartAnalysis: (contact: Contact) => void
  onArchive:      (contact: Contact) => void
  onDeletePermanently: (contact: Contact) => void
  userId:         string
  isLeader:       boolean
  technicians:    Technician[]
  responses:      ContactResponse[]
  activity:       ContactActivity[]
}) {
  // Busca a configuração visual da área de interesse (ícone + cores)
  const cfg        = AREA_CONFIG[contact.interest_area ?? ''] ?? DEFAULT_CFG
  const Icon       = cfg.icon

  // Garante valores padrão para status e prioridade, caso venham nulos do banco
  const status     = contact.status   ?? 'novo'
  const priority   = contact.priority ?? 'media'

  // Indica se este card está em processo de salvar (exibe spinner nos botões)
  const isSaving   = savingId === contact.id

  // Ações disponíveis para transição de status com base no status atual
  const nextActions = STATUS_NEXT[status] ?? []

  // Verifica se o contato está atribuído ao usuário logado
  const isMyContact = assignee?.id === userId

  // Estado do dropdown de atribuição (aberto/fechado)
  const [showAssign, setShowAssign] = useState(false)

  // Ref para detectar clique fora do dropdown e fechá-lo automaticamente
  const assignRef = useRef<HTMLDivElement>(null)

  // Primeiro nome do técnico atribuído, usado no label do botão de atribuição
  const assigneeName = assignee?.full_name?.split(' ')[0] ?? assignee?.email?.split('@')[0] ?? 'Técnico'

  // Fecha o dropdown de atribuição ao clicar fora dele
  useEffect(() => {
    if (!showAssign) return
    const handle = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setShowAssign(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showAssign])

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-3xl border border-white/[0.08] transition-all duration-300"
      style={{ background: colors.cardDark, boxShadow: shadows.md, borderColor: colors.primary }}
    >
      {/* Barra colorida no topo do card — cor muda conforme o status atual */}
      <div
        className="h-1 w-full rounded-t-3xl transition-colors duration-500"
        style={{
          background:
            status === 'novo'       ? gradients.primary :
            status === 'em_analise' ? gradients.secondary :
            status === 'respondido' ? gradients.success :
            'rgba(255,255,255,0.06)',
        }}
      />

      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Seção esquerda: ícone da área + nome, badges e metadados (e-mail, empresa, telefone, data) */}
          <div className="flex items-start gap-4">
            {/* Ícone da área de interesse com fundo colorido */}
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: cfg.bg }}
            >
              <Icon size={22} style={{ color: cfg.color }} aria-hidden="true" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {contact.name}
                </h3>
                {/* Badge de área de interesse */}
                {contact.interest_area && (
                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                    style={{ background: cfg.bg, color: cfg.color }}>
                    {contact.interest_area}
                  </span>
                )}
                {/* Badge de status */}
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[status] ?? STATUS_STYLE['novo']}`}>
                  {STATUS_LABEL[status] ?? 'Novo'}
                </span>
                {/* Badge de prioridade */}
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[priority] ?? PRIORITY_STYLE['media']}`}>
                  {PRIORITY_LABEL[priority] ?? 'Média'}
                </span>
              </div>

              {/* Metadados de contato: empresa, e-mail, telefone e data de criação */}
              <div className="mt-2 flex flex-wrap gap-3">
                {contact.company && (
                  <span className="flex items-center gap-1 text-[11px] text-white/40">
                    <Building2 size={10} aria-hidden="true" />{contact.company}
                  </span>
                )}
                <a href={`mailto:${contact.email}`}
                  className="flex items-center gap-1 text-[11px] text-[#60A5FA] hover:underline">
                  <Mail size={10} aria-hidden="true" />{contact.email}
                </a>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`}
                    className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white transition-colors">
                    <Phone size={10} aria-hidden="true" />{contact.phone}
                  </a>
                )}
                <span className="flex items-center gap-1 text-[11px] text-white/30">
                  <Clock size={10} aria-hidden="true" />{timeAgo(contact.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Seção de ações: botões de resposta, transição de status e atribuição.
              Sem shrink-0: em telas estreitas, o grupo precisa poder encolher para
              que seu próprio flex-wrap quebre os botões em linhas, em vez de vazar
              para fora do card (que não tem overflow-hidden). */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {/* Botão para expandir/recolher a mensagem do contato */}
            <button type="button" onClick={onToggle}
              className="inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-all"
              style={{ borderColor: `${colors.primary}/35`, color: colors.primaryLight, background: `${colors.primary}/12` }}>
              <Eye size={13} aria-hidden="true" />
              {expanded ? 'Fechar' : 'Ver mensagem'}
            </button>

            {/* ── Contato direto ── */}
            {/* WhatsApp — só aparece se o cliente informou telefone */}
            {contact.phone && (
              <a
                href={`https://wa.me/55${contact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${contact.name}, vi sua solicitação sobre ${contact.interest_area ?? 'nossos serviços'} e gostaria de conversar!`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-[#25D366]/35 bg-[#25D366]/10 px-3.5 py-2 text-xs font-bold text-[#25D366] transition-all hover:bg-[#25D366]/20 hover:border-[#25D366]/60"
                aria-label={`Abrir WhatsApp com ${contact.name}`}
              >
                <MessageCircle size={12} aria-hidden="true" />
                WhatsApp
              </a>
            )}

            {/* E-mail direto — abre cliente de e-mail com assunto pré-preenchido */}
            <a
              href={`mailto:${contact.email}?subject=${encodeURIComponent(`Re: Solicitação LOBBY — ${contact.interest_area ?? 'Serviços'}`)}&body=${encodeURIComponent(`Olá ${contact.name},\n\nObrigado por entrar em contato com a LOBBY!\n\n`)}`}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-[#60A5FA]/30 bg-[#60A5FA]/10 px-3.5 py-2 text-xs font-bold text-[#60A5FA] transition-all hover:bg-[#60A5FA]/20 hover:border-[#60A5FA]/55"
              aria-label={`Enviar e-mail para ${contact.email}`}
            >
              <Mail size={12} aria-hidden="true" />
              E-mail direto
              <ExternalLink size={10} className="opacity-60" aria-hidden="true" />
            </a>

            {/* Botão principal: abre modal de resposta por e-mail */}
            <button type="button" onClick={() => onRespond(contact)}
              className="inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5"
              style={{ background: gradients.primaryBold, boxShadow: `0_4px_12px_${colors.primary}40` }}>
              <Send size={12} aria-hidden="true" />{contact.status === 'respondido' ? 'Responder novamente' : 'Responder'}
            </button>

            {/* Botão "Iniciar análise" — só aparece para solicitações ainda novas */}
            {status === 'novo' && (
              <button type="button" onClick={() => onStartAnalysis(contact)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-[#7B2CFF]/35 px-3.5 py-2 text-xs font-bold text-[#A78BFA] transition-all hover:bg-[#7B2CFF]/12">
                <CircleDot size={12} aria-hidden="true" />
                Iniciar análise
              </button>
            )}

            {/* Botões de transição de status (ex: Arquivar, Reabrir) gerados dinamicamente */}
            {nextActions.map(({ label, icon: ActionIcon, next }) => (
              <button key={next} type="button"
                disabled={isSaving}
                onClick={() => next === 'arquivado' ? onArchive(contact) : onStatusChange(contact.id, next)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.10] px-3.5 py-2 text-xs font-bold text-white/50 transition-all hover:border-white/25 hover:text-white/80 disabled:opacity-40"
              >
                {isSaving
                  ? <Loader2 size={11} className="animate-spin" />
                  : <ActionIcon size={11} aria-hidden="true" />
                }
                {label}
              </button>
            ))}

            {/* Botão de exclusão permanente — exclusivo para líderes e apenas em solicitações arquivadas */}
            {status === 'arquivado' && isLeader && (
              <button type="button" onClick={() => onDeletePermanently(contact)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-red-500/25 px-3.5 py-2 text-xs font-bold text-red-400/70 transition-all hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400">
                <Trash2 size={11} aria-hidden="true" />
                Excluir permanentemente
              </button>
            )}

            {/* ── Seção de atribuição ── */}

            {/* Badge informativo quando o contato está atribuído ao usuário logado */}
            {isMyContact && (
              <span className="inline-flex items-center gap-1.5 rounded-2xl border border-[#10B981]/30 bg-[#10B981]/10 px-3.5 py-2 text-xs font-bold text-[#34D399]">
                <UserPlus size={12} />Minha solicitação
              </span>
            )}

            {/* Técnico regular sem atribuição: pode pegar a solicitação para si */}
            {!isLeader && !isMyContact && !assignee && (
              <button type="button" disabled={isAssigning} onClick={onClaim}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.10] px-3.5 py-2 text-xs font-bold text-white/50 transition-all hover:border-[#005BFF]/40 hover:text-[#60A5FA] disabled:opacity-40">
                {isAssigning ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={12} />}
                Pegar solicitação
              </button>
            )}

            {/* Líder: dropdown para atribuir a qualquer técnico da equipe */}
            {isLeader && (
              <div className="relative" ref={assignRef}>
                {/* Botão que abre o dropdown — mostra nome do técnico atual se já atribuído */}
                <button type="button" disabled={isAssigning} onClick={() => setShowAssign(v => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-all disabled:opacity-40 ${
                    assignee
                      ? 'border-[#A78BFA]/30 bg-[#A78BFA]/10 text-[#A78BFA]'
                      : 'border-white/[0.10] text-white/50 hover:border-[#7B2CFF]/40 hover:text-[#A78BFA]'
                  }`}>
                  {isAssigning ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={12} />}
                  {assignee ? `Atribuída · ${assigneeName}` : 'Atribuir'}
                </button>

                {/* Dropdown com lista de técnicos disponíveis */}
                <AnimatePresence>
                  {showAssign && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0D1428] shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
                      <p className="px-3.5 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/25">Atribuir a</p>
                      {technicians.map(t => {
                        // Extrai o primeiro nome ou parte do e-mail para exibição compacta
                        const tName   = t.full_name?.split(' ')[0] ?? t.email?.split('@')[0] ?? 'Técnico'
                        const initial = tName.charAt(0).toUpperCase()
                        const active  = assignee?.id === t.id
                        return (
                          <button key={t.id} type="button"
                            onClick={() => { onAssign(t.id); setShowAssign(false) }}
                            className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-white/[0.06] ${active ? 'text-[#34D399]' : 'text-white/70'}`}>
                            {/* Avatar com inicial do nome */}
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${active ? 'bg-[#10B981]/25 text-[#34D399]' : 'bg-white/10 text-white/60'}`}>
                              {initial}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold">{tName}</p>
                              {t.email && <p className="truncate text-[9px] text-white/30">{t.email}</p>}
                            </div>
                            {/* Checkmark indica o técnico atualmente atribuído */}
                            {active && <Check size={12} className="ml-auto shrink-0 text-[#34D399]" />}
                          </button>
                        )
                      })}
                      {/* Opção para o líder reatribuir para si mesmo */}
                      {assignee && (
                        <>
                          <div className="mx-3 border-t border-white/[0.06]" />
                          <button type="button" onClick={() => { onClaim(); setShowAssign(false) }}
                            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs text-white/40 transition-colors hover:bg-white/[0.04]">
                            <UserPlus size={11} />Pegar para mim
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Painel expandido: mensagem original, log de atividades e histórico de respostas */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              {/* Mensagem original enviada pelo cliente */}
              <div className="rounded-2xl border-l-2 border-[#005BFF]/50 bg-white/[0.03] p-4">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  <MessageSquare size={10} aria-hidden="true" />Mensagem do cliente
                </p>
                <p className="text-sm leading-relaxed text-white/60 whitespace-pre-wrap">{contact.message}</p>
                {/* Link direto para WhatsApp se o cliente informou telefone */}
                {contact.phone && (
                  <a href={`https://wa.me/55${contact.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#25D366]/15 px-3 py-1.5 text-xs font-semibold text-[#34D399] transition-colors hover:bg-[#25D366]/25">
                    <Phone size={11} aria-hidden="true" />WhatsApp
                  </a>
                )}
              </div>

              {/* Log de atividades: quem fez o quê e quando nesta solicitação */}
              {activity.length > 0 && (
                <div className="mt-3 rounded-2xl border-l-2 border-[#7B2CFF]/50 bg-white/[0.03] p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    <Activity size={10} aria-hidden="true" />Atividade
                  </p>
                  <ul className="space-y-2.5">
                    {activity.map(a => {
                      // Resolve o nome do técnico que realizou a ação
                      const techName = technicians.find(t => t.id === a.technician_id)?.full_name?.split(' ')[0]
                        ?? technicians.find(t => t.id === a.technician_id)?.email?.split('@')[0]
                        ?? 'Técnico'
                      // Converte o slug da ação para texto legível
                      const actionLabel = a.action === 'iniciou_analise' ? 'iniciou análise' : a.action
                      return (
                        <li key={a.id} className="border-b border-white/[0.05] pb-2.5 last:border-b-0 last:pb-0">
                          <p className="flex items-center gap-1 text-xs text-white/60">
                            <span className="font-semibold text-white/80">{techName}</span> {actionLabel}
                            <span className="text-white/25">· {timeAgo(a.created_at)}</span>
                          </p>
                          {/* Nota opcional deixada pelo técnico junto com a ação */}
                          {a.note && (
                            <p className="mt-0.5 text-xs text-white/45 whitespace-pre-wrap">{a.note}</p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Histórico de respostas enviadas (exclui rascunhos) */}
              {responses.filter(r => !r.is_draft).length > 0 && (
                <div className="mt-3 rounded-2xl border-l-2 border-[#10B981]/50 bg-white/[0.03] p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    <History size={10} aria-hidden="true" />Histórico de respostas
                  </p>
                  <ul className="space-y-2.5">
                    {responses.filter(r => !r.is_draft).map(r => (
                      <li key={r.id} className="border-b border-white/[0.05] pb-2.5 last:border-b-0 last:pb-0">
                        <p className="text-xs font-semibold text-white/80">{r.subject}</p>
                        {/* Exibe apenas as primeiras 2 linhas do corpo da resposta */}
                        <p className="mt-0.5 line-clamp-2 text-xs text-white/45 whitespace-pre-wrap">{r.message}</p>
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-white/25">
                          <Clock size={9} aria-hidden="true" />{timeAgo(r.sent_at ?? r.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  )
}
