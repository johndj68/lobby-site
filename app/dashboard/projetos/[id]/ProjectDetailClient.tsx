'use client'

// ─── Imports do React ──────────────────────────────────────────────────────
// useEffect: efeitos colaterais (subscription realtime)
// useRef: referência estável ao cliente Supabase entre re-renders
// useState: estado local do componente
import { useEffect, useRef, useState } from 'react'

// Componente de navegação do Next.js (substitui <a> com pré-carregamento)
import Link from 'next/link'

// Biblioteca de animações — usada na barra de progresso geral
import { motion } from 'framer-motion'

// Notificações toast (avisos de sucesso/erro discretos no canto da tela)
import { toast } from 'sonner'

// Ícones da biblioteca Lucide — cada um cobre um conceito visual do layout
import {
  ArrowLeft, CheckCircle2, Loader2, ArrowRight, AlertTriangle,
  Calendar, Flag, Users, Clock, History as HistoryIcon,
  ShieldCheck, ChevronDown, LayoutGrid, FileText, Copy, X,
  Network,
  Lock, LayoutDashboard, FolderKanban, MessageSquareText, Download, Headphones,
  Package, MessageCircle, ImageIcon, Network as OrgIcon, LayoutTemplate, Truck,
} from 'lucide-react'

// Cliente Supabase para subscription realtime de mudanças no banco
import { createClient } from '@/lib/supabase'

// Utilitários de mapeamento de status: cores, labels e estilos por status de projeto/fase
import { STATUS_CFG, DEFAULT_STATUS_CFG, PHASE_STATUS_STYLE, getVisualStatusStyles, normalizeSecurityItems } from '@/lib/project-status'

// Fases padrão usadas quando o projeto ainda não tem fases personalizadas
import { DEFAULT_PROJECT_PHASES } from '@/types'

// Tipo principal do projeto do cliente — define todos os campos do client_progress
import type { ClientProject } from '@/types'

// Server Actions: respondToApproval (aprovação de etapa) e respondToVisualApproval (aprovação de asset visual)
import { respondToApproval, respondToVisualApproval } from './actions'

// Componente que carrega imagem assinada do Supabase Storage (URL temporária)
import SignedVisualImage from '@/components/sections/SignedVisualImage'

// Componentes de exibição de assets visuais: galeria de imagens e linha de documento
import { VisualImageGalleryCard, VisualDocumentRow } from '@/components/sections/VisualAssetCards'

// Card de pagamento via créditos (aparece apenas quando allow_credit_payment = true)
import CreditPaymentCard from '@/components/credits/CreditPaymentCard'

// Utilitário que converte timestamp em texto relativo (ex.: "há 2 horas")
import { timeAgo } from '@/lib/utils'

// Tipo do usuário autenticado vindo do Supabase Auth
import type { User as SupabaseUser } from '@supabase/supabase-js'

// ─── Mapeamento de status de módulo ────────────────────────────────────────
// Cada status de módulo mapeia para um label legível e cores de texto/fundo.
// Usado nos cards de módulos na aba Segurança.
const MODULE_STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  nao_iniciado:         { label: 'Planejado',            color: '#94A3B8', bg: 'rgba(148,163,184,0.10)' },
  em_andamento:         { label: 'Em andamento',         color: '#005BFF', bg: 'rgba(0,91,255,0.10)'    },
  concluido:            { label: 'Concluído',            color: '#10B981', bg: 'rgba(16,185,129,0.10)'  },
  aguardando_validacao: { label: 'Em validação',         color: '#7B2CFF', bg: 'rgba(123,44,255,0.10)'  },
  aguardando_cliente:   { label: 'Aguardando cliente',   color: '#F59E0B', bg: 'rgba(245,158,11,0.10)'  },
  bloqueado:            { label: 'Bloqueado',            color: '#EF4444', bg: 'rgba(239,68,68,0.10)'   },
}

// ─── Mapa de ícones para os passos do fluxograma ───────────────────────────
// O técnico define o ícone de cada passo pelo nome (ex.: "Lock", "Download").
// Este mapa resolve o nome para o componente React correspondente.
const FLOW_ICON_MAP: Record<string, React.ElementType> = {
  Lock, LayoutDashboard, FolderKanban, MessageSquareText, Download, Headphones,
}

// ─── Props do componente ────────────────────────────────────────────────────
// user: usuário autenticado (Supabase Auth)
// profile: dados do perfil (nome e empresa, para exibição no shell)
// project: dados iniciais do projeto vindos do servidor (SSR/RSC)
// leadTechnicianName: nome do técnico responsável (ou null se não atribuído)
interface Props {
  user:               SupabaseUser
  profile:            { full_name?: string; company_name?: string } | null
  project:            ClientProject
  leadTechnicianName: string | null
}

// ─── Utilitário: status do prazo ────────────────────────────────────────────
// Retorna label e cor de acordo com quantos dias faltam para o deadline.
// Usado no card "Prazo previsto" do resumo executivo.
function getDeadlineStatus(deadline?: string): { label: string; color: string } | null {
  if (!deadline) return null
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  if (days < 0) return { label: 'Atrasado', color: '#EF4444' }
  if (days <= 7) return { label: 'Próximo do prazo', color: '#F59E0B' }
  return { label: 'No prazo', color: '#10B981' }
}

// ─── Utilitário: alerta de prazo ────────────────────────────────────────────
// Retorna título, mensagem e tom ('late' ou 'ok') para o banner de prazo
// exibido logo abaixo do cabeçalho do projeto.
function getDeadlineAlert(deadline?: string): { title: string; message: string; tone: 'late' | 'ok' } | null {
  if (!deadline) return null
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  if (days < 0) {
    return {
      title: 'Projeto atrasado',
      message: 'O prazo previsto já passou. Nossa equipe irá atualizar o cronograma ou alinhar uma nova previsão.',
      tone: 'late',
    }
  }
  return {
    title: 'Projeto no prazo',
    message: 'As etapas estão seguindo conforme o planejamento.',
    tone: 'ok',
  }
}


// ─── Tipo das abas disponíveis ──────────────────────────────────────────────
// Identifica qual das 4 abas está ativa. Usado como discriminante em activeTab.
type TabId = 'progresso' | 'materiais' | 'seguranca' | 'relatorios'

// ─── Componente principal ───────────────────────────────────────────────────
export default function ProjectDetailClient({ project: initialProject, leadTechnicianName }: Props) {

  // ─── Estados locais ────────────────────────────────────────────────────────
  // project: dados do projeto — atualizado em tempo real via Supabase Realtime
  const [project, setProject]           = useState(initialProject)
  // activeTab: controla qual aba está visível no momento
  const [activeTab, setActiveTab]       = useState<TabId>('progresso')
  // showSecurityDetails: expande/recolhe o bloco de detalhes de segurança
  const [showSecurityDetails, setShowSecurityDetails] = useState(false)
  // showAdjustForm: exibe o textarea para o cliente descrever o ajuste solicitado
  const [showAdjustForm, setShowAdjustForm]           = useState(false)
  // adjustNote: texto digitado pelo cliente ao solicitar ajustes em uma etapa
  const [adjustNote, setAdjustNote]                   = useState('')
  // submittingApproval: indica qual decisão de aprovação está sendo enviada ('aprovado' | 'ajustes_solicitados')
  // null quando não há envio em andamento; usado para desabilitar botões e mostrar spinner
  const [submittingApproval, setSubmittingApproval]   = useState<'aprovado' | 'ajustes_solicitados' | null>(null)
  // visualActionId: ID do asset visual que está sendo aprovado/ajustado no momento
  // Controla o spinner individual em cards de imagem, documento e entrega
  const [visualActionId, setVisualActionId]           = useState<string | null>(null)
  // expandedVisual: mapa de qual categoria de material visual está expandida
  // Chaves: 'galeria' | 'documentos' | 'fluxo' | 'organograma' | 'mapa' | 'entregas'
  const [expandedVisual, setExpandedVisual]           = useState<Record<string, boolean>>({})

  // Referência estável ao cliente Supabase para evitar recriação a cada render
  const sbRef = useRef(createClient())

  // ─── Efeito: subscription realtime ────────────────────────────────────────
  // Fica escutando mudanças (UPDATE) na linha do projeto no banco.
  // Quando o técnico edita o client_progress, o estado local é atualizado
  // sem que o cliente precise recarregar a página.
  // O canal é removido na função de cleanup para evitar leaks.
  useEffect(() => {
    const sb = sbRef.current
    const channel = sb
      .channel(`project-detail-${initialProject.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'client_projects', filter: `id=eq.${initialProject.id}` },
        (payload) => setProject(payload.new as ClientProject)
      )
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [initialProject.id])

  // ─── Extração de dados do client_progress ──────────────────────────────────
  // cfg: configuração visual do status geral do projeto (cor, ícone, label)
  const cfg  = STATUS_CFG[project.status] ?? DEFAULT_STATUS_CFG
  // cp: objeto client_progress — contém toda a informação editável pelo técnico
  const cp   = project.client_progress ?? {}
  // phases: linha do tempo do projeto; usa padrão se o técnico ainda não definiu
  const phases      = cp.phases?.length ? cp.phases : DEFAULT_PROJECT_PHASES
  // Listas de itens para os três cards de progresso (feito / fazendo / próximos)
  const completed   = cp.completedItems  ?? []
  const inProgress  = cp.inProgressItems ?? []
  const nextSteps   = cp.nextSteps       ?? []
  // pending: itens que dependem de ação do cliente para o projeto avançar
  const pending     = cp.clientPendingItems ?? []
  // history: log de atualizações do projeto (data, tipo, título, descrição)
  const history     = cp.updateHistory   ?? []
  // securityItems: checklist de segurança normalizado; filtra itens marcados e visíveis ao cliente
  const securityItems = normalizeSecurityItems(cp.securityItems).filter(it => it.checked && it.visibleToClient !== false)
  // modules: módulos do projeto filtrados para exibir apenas os visíveis ao cliente
  const modules       = (cp.modules ?? []).filter(m => m.visibleToClient !== false)
  // report: relatório executivo preenchido pelo técnico
  const report        = cp.executiveReport
  // va: objeto com todos os assets visuais do projeto
  const va            = cp.clientVisualAssets ?? {}
  // Listas individuais de cada categoria de asset visual
  const visualImages  = va.images    ?? []
  const visualDocs    = va.documents ?? []
  const orgChart      = va.organizationChart ?? []
  const flowSteps     = va.flowSteps  ?? []
  const screenMap     = va.screenMap  ?? []
  const deliverables  = va.deliverables ?? []

  // ─── Flags derivadas ────────────────────────────────────────────────────────
  // visualCount: total de assets visuais disponíveis — usado como badge no tab "Materiais"
  const visualCount        = visualImages.length + visualDocs.length + flowSteps.length + orgChart.length + screenMap.length + deliverables.length
  // hasApprovalPending: true se o técnico ativou aprovação e o cliente ainda não respondeu
  const hasApprovalPending = !!(cp.approvalRequired && (!cp.approvalStatus || cp.approvalStatus === 'aguardando'))
  // hasSecurity: true se há informações de segurança para exibir ao cliente
  const hasSecurity        = cp.securityVisibleToClient !== false && (cp.securitySummary || securityItems.length > 0)
  // hasRelatorios: true se há ao menos um conteúdo para exibir na aba Relatórios
  const hasRelatorios      = !!(report && report.visibleToClient !== false && (report.weekSummary || report.completedProgress || report.risks || report.nextMilestone || report.finalNote)) || cp.approvalRequired || history.length > 0

  // ─── Definição das abas ─────────────────────────────────────────────────────
  // TabDef: tipo inline para cada aba — id, label, ícone, contagem opcional e alerta
  // O badge numérico aparece quando count > 0; o ponto vermelho quando alert = true
  type TabDef = { id: TabId; label: string; icon: React.ElementType; count?: number; alert?: boolean }
  const tabs: TabDef[] = [
    { id: 'progresso',  label: 'Progresso',  icon: Flag                                       },
    { id: 'materiais',  label: 'Materiais',  icon: ImageIcon,   count: visualCount             },
    { id: 'seguranca',  label: 'Segurança',  icon: ShieldCheck                                 },
    { id: 'relatorios', label: 'Relatórios', icon: HistoryIcon, alert: hasApprovalPending      },
  ]

  // ─── Função: aprovação de asset visual ─────────────────────────────────────
  // Chamada quando o cliente aprova ou solicita ajuste em uma imagem, documento ou entrega.
  // kind: categoria do asset ('images' | 'documents' | 'deliverables')
  // assetId: ID único do asset dentro da lista
  // decision: 'aprovado' ou 'ajuste_solicitado'
  // Enquanto aguarda, marca o ID no visualActionId para exibir spinner no card correto.
  // Após resposta, atualiza o status do item no estado local sem recarregar a página.
  const handleVisualApproval = async (kind: 'images' | 'documents' | 'deliverables', assetId: string, decision: 'aprovado' | 'ajuste_solicitado') => {
    setVisualActionId(assetId)
    const result = await respondToVisualApproval({ projectId: project.id, kind, assetId, decision })
    setVisualActionId(null)
    if (!result.success) { toast.error(result.error); return }
    setProject(prev => {
      const prevVa = prev.client_progress?.clientVisualAssets ?? {}
      const list = prevVa[kind] ?? []
      return {
        ...prev,
        client_progress: {
          ...prev.client_progress,
          clientVisualAssets: { ...prevVa, [kind]: list.map(item => item.id === assetId ? { ...item, status: decision } : item) },
        },
      }
    })
    toast.success(decision === 'aprovado' ? 'Aprovado com sucesso' : 'Ajuste solicitado')
  }

  // ─── Função: aprovação de etapa do projeto ──────────────────────────────────
  // Chamada pelos botões "Aprovar etapa" e "Solicitar ajuste" na aba Relatórios.
  // Fluxo de ajuste em duas etapas:
  //   1ª chamada com 'ajustes_solicitados' → apenas abre o formulário de nota
  //   2ª chamada (após preencher) → envia a decisão com a nota para o servidor
  // Após sucesso, atualiza o approvalStatus e approvalRespondedAt no estado local.
  const handleApproval = async (decision: 'aprovado' | 'ajustes_solicitados') => {
    if (decision === 'ajustes_solicitados' && !showAdjustForm) { setShowAdjustForm(true); return }
    setSubmittingApproval(decision)
    const result = await respondToApproval({
      projectId: project.id, decision, note: decision === 'ajustes_solicitados' ? adjustNote : undefined,
    })
    setSubmittingApproval(null)
    if (!result.success) { toast.error(result.error); return }
    setProject(prev => ({
      ...prev,
      client_progress: {
        ...prev.client_progress,
        approvalStatus: decision,
        approvalClientNote: decision === 'ajustes_solicitados' ? adjustNote : undefined,
        approvalRespondedAt: new Date().toISOString(),
      },
    }))
    setShowAdjustForm(false)
    toast.success(decision === 'aprovado' ? 'Etapa aprovada com sucesso' : 'Solicitação de ajuste enviada')
  }

  // ─── Função: copiar relatório executivo ────────────────────────────────────
  // Monta o texto completo do relatório em formato simples e copia para a área
  // de transferência. Exibe toast de confirmação ao usuário.
  const copyReport = () => {
    const text = [
      `Relatório executivo — ${project.title}`,
      report?.weekSummary ? `\nResumo da semana:\n${report.weekSummary}` : '',
      `\nProgresso geral: ${project.progress}%`,
      report?.completedProgress ? `\nAvanços realizados:\n${report.completedProgress}` : '',
      report?.risks ? `\nPontos de atenção:\n${report.risks}` : '',
      report?.nextMilestone ? `\nPróximo marco:\n${report.nextMilestone}` : '',
      report?.finalNote ? `\nObservação final:\n${report.finalNote}` : '',
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Relatório copiado')
  }

  // ─── Valores derivados para exibição do prazo ───────────────────────────────
  // deadlineLabel: data formatada em pt-BR ou "A definir" se não houver prazo
  // deadlineStatus: objeto com label e cor para o card de prazo
  // deadlineAlert: objeto para o banner de alerta de prazo (atrasado / no prazo)
  const deadlineLabel  = project.deadline ? new Date(project.deadline).toLocaleDateString('pt-BR') : 'A definir'
  const deadlineStatus = getDeadlineStatus(project.deadline ?? undefined)
  const deadlineAlert  = getDeadlineAlert(project.deadline ?? undefined)

  // ─── Renderização ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

        {/* Botão voltar para a lista de projetos */}
        <Link href="/dashboard/projetos"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5D6475] transition-colors hover:text-[#005BFF]">
          <ArrowLeft size={13} aria-hidden="true" />
          Voltar aos meus projetos
        </Link>

        {/* Cabeçalho do projeto: badge de status, categoria, título e descrição */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold"
              style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
              <cfg.icon size={10} aria-hidden="true" />
              {cfg.label}
            </span>
            {project.category && <span className="text-xs text-[#005BFF]">{project.category}</span>}
          </div>
          <h1 className="text-2xl font-bold text-[#0B1020] sm:text-3xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            {project.title}
          </h1>
          {project.description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5D6475]">{project.description}</p>
          )}
        </div>

        {/* Banner de prazo: vermelho se atrasado, verde se no prazo */}
        {deadlineAlert && (
          <div className={`flex items-start gap-3 rounded-2xl border p-4 ${
            deadlineAlert.tone === 'late' ? 'border-[#EF4444]/25 bg-[#EF4444]/[0.04]' : 'border-[#10B981]/25 bg-[#10B981]/[0.04]'
          }`}>
            {deadlineAlert.tone === 'late'
              ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#EF4444]" aria-hidden="true" />
              : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#10B981]" aria-hidden="true" />}
            <div>
              <p className="text-sm font-bold" style={{ color: deadlineAlert.tone === 'late' ? '#EF4444' : '#10B981' }}>
                {deadlineAlert.title}
              </p>
              <p className="mt-0.5 text-xs text-[#5D6475]">{deadlineAlert.message}</p>
            </div>
          </div>
        )}

        {/* Banner "Ação necessária" (laranja) ────────────────────────────────
            Aparece quando há itens pendentes do cliente (pending.length > 0)
            OU quando há uma aprovação de etapa aguardando resposta.
            Botões de atalho redirecionam para a aba correspondente. */}
        {(pending.length > 0 || hasApprovalPending) && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#F59E0B]/30 bg-[#F59E0B]/[0.04] px-4 py-3">
            <AlertTriangle size={15} className="shrink-0 text-[#F59E0B]" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-bold text-[#0B1020]">Ação necessária</p>
              <p className="text-xs text-[#5D6475]">
                {[
                  pending.length > 0 && `${pending.length} item${pending.length > 1 ? 's' : ''} aguardando sua atenção`,
                  hasApprovalPending && 'Aprovação de etapa pendente',
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            {hasApprovalPending && (
              <button type="button" onClick={() => setActiveTab('relatorios')}
                className="shrink-0 rounded-lg border border-[#F59E0B]/30 px-3 py-1.5 text-xs font-bold text-[#F59E0B] transition-colors hover:bg-[#F59E0B]/10">
                Ver aprovação
              </button>
            )}
            {pending.length > 0 && (
              <button type="button" onClick={() => setActiveTab('progresso')}
                className="shrink-0 rounded-lg border border-[#F59E0B]/30 px-3 py-1.5 text-xs font-bold text-[#F59E0B] transition-colors hover:bg-[#F59E0B]/10">
                Ver pendências
              </button>
            )}
          </div>
        )}

        {/* Resumo executivo (sempre visível, acima das abas) ─────────────────
            Quatro cards: Fase atual · Próximo marco · Prazo · Responsável
            Seguidos de caixa de resumo do projeto e barra de progresso geral. */}
        <section aria-label="Resumo do andamento">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                <Flag size={11} aria-hidden="true" />Fase atual
              </p>
              <p className="mt-2 text-base font-bold text-[#0B1020]">{cp.currentPhase || cfg.label}</p>
            </div>
            <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                <ArrowRight size={11} aria-hidden="true" />Próximo marco
              </p>
              <p className="mt-2 text-base font-bold text-[#0B1020]">{cp.nextMilestone || '—'}</p>
            </div>
            <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                <Calendar size={11} aria-hidden="true" />Prazo previsto
              </p>
              <p className="mt-2 text-base font-bold text-[#0B1020]">{deadlineLabel}</p>
              {deadlineStatus && (
                <p className="mt-0.5 text-[11px] font-semibold" style={{ color: deadlineStatus.color }}>{deadlineStatus.label}</p>
              )}
            </div>
            <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                <Users size={11} aria-hidden="true" />Responsável
              </p>
              <p className="mt-2 text-base font-bold text-[#0B1020]">{leadTechnicianName ?? 'Em análise'}</p>
              {leadTechnicianName ? (
                <Link href={`/dashboard/mensagens?project=${project.id}`}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#005BFF] hover:underline">
                  Falar com o técnico
                </Link>
              ) : (
                <p className="mt-1 text-[11px] text-[#94A3B8]">Ainda sem técnico responsável</p>
              )}
            </div>
          </div>

          {/* Resumo textual do projeto (preenchido pelo técnico em cp.projectSummary) */}
          {cp.projectSummary && (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#005BFF]/15 bg-[#005BFF]/[0.04] px-4 py-3">
              <MessageCircle size={16} className="mt-0.5 shrink-0 text-[#005BFF]" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-[#3A4256]">{cp.projectSummary}</p>
            </div>
          )}

          {/* Barra de progresso geral com animação Framer Motion */}
          <div className="mt-4 rounded-2xl border border-[#E3E7F0] bg-white p-4">
            <div className="mb-1.5 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold text-[#5D6475]">Progresso geral do projeto</p>
                <p className="text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {project.progress}% concluído
                </p>
              </div>
              <span className="text-[11px] text-[#94A3B8]">Atualizado {timeAgo(project.updated_at)}</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-[#F1F3F9]">
              <motion.div initial={{ width: 0 }} animate={{ width: `${project.progress}%` }} transition={{ duration: 0.8 }}
                className="absolute left-0 top-0 h-full rounded-full"
                style={{ background: 'linear-gradient(to right, #005BFF, #7B2CFF)' }} />
            </div>
          </div>
        </section>

        {/* Card de pagamento via créditos — exibido apenas quando habilitado no projeto */}
        {project.allow_credit_payment && (
          <CreditPaymentCard project={project} onPaid={updated => setProject(updated)} />
        )}

        {/* ─── Navegação por abas ──────────────────────────────────────────────
            Cada botão alterna o activeTab. Abas com assets exibem badge numérico.
            A aba Relatórios exibe ponto vermelho quando há aprovação pendente. */}
        <nav
          className="flex gap-1 overflow-x-auto rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC] p-1"
          aria-label="Seções do projeto"
        >
          {tabs.map(({ id, label, icon: Icon, count, alert }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`relative flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-all
                ${activeTab === id
                  ? 'bg-white shadow-sm text-[#005BFF]'
                  : 'text-[#5D6475] hover:text-[#0B1020]'}`}
            >
              <Icon size={13} aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
              {/* Badge numérico para contagem de assets (ex.: "3" em Materiais) */}
              {(count ?? 0) > 0 && (
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#005BFF]/10 px-1 text-[9px] font-bold text-[#005BFF]">
                  {count}
                </span>
              )}
              {/* Ponto vermelho de alerta — indica aprovação pendente na aba Relatórios */}
              {alert && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#EF4444]" aria-label="Ação pendente" />
              )}
            </button>
          ))}
        </nav>

        {/* ─── Aba: Progresso ─────────────────────────────────────────────────
            Exibe: linha do tempo das fases, três colunas de progresso
            (feito / fazendo / próximos passos) e seção de pendências do cliente. */}
        {activeTab === 'progresso' && (
          <div className="space-y-8">

            {/* Linha do tempo das fases do projeto ───────────────────────────
                Desktop: horizontal com conectores.
                Mobile: vertical com linha de conexão entre itens.
                Status de cada fase determina cor e ícone via PHASE_STATUS_STYLE. */}
            <section aria-label="Linha do tempo do projeto">
              <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Linha do tempo
              </h2>
              <div className="rounded-3xl border border-[#E3E7F0] bg-white p-5 sm:p-6">
                {/* Desktop: fases em linha horizontal com conectores coloridos */}
                <div className="hidden lg:flex lg:items-start">
                  {phases.map((phase, i) => {
                    const style = PHASE_STATUS_STYLE[phase.status] ?? PHASE_STATUS_STYLE.proximo
                    return (
                      <div key={phase.title} className="flex flex-1 flex-col items-center text-center">
                        <div className="flex w-full items-center">
                          <div className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : ''}`} style={{ background: style.border }} />
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2"
                            style={{ background: style.bg, borderColor: style.color }}>
                            {phase.status === 'concluido'
                              ? <CheckCircle2 size={15} style={{ color: style.color }} aria-hidden="true" />
                              : <span className="h-2 w-2 rounded-full" style={{ background: style.color }} />}
                          </div>
                          <div className={`h-0.5 flex-1 ${i === phases.length - 1 ? 'invisible' : ''}`} style={{ background: style.border }} />
                        </div>
                        <p className="mt-2 text-xs font-bold text-[#0B1020]">{phase.title}</p>
                        <p className="mt-0.5 text-[10px] font-semibold" style={{ color: style.color }}>{style.label}</p>
                        {phase.description && <p className="mt-1 text-[10px] leading-snug text-[#94A3B8]">{phase.description}</p>}
                      </div>
                    )
                  })}
                </div>

                {/* Mobile: fases em coluna vertical com linha conectora */}
                <div className="space-y-0 lg:hidden">
                  {phases.map((phase, i) => {
                    const style = PHASE_STATUS_STYLE[phase.status] ?? PHASE_STATUS_STYLE.proximo
                    return (
                      <div key={phase.title} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
                            style={{ background: style.bg, borderColor: style.color }}>
                            {phase.status === 'concluido'
                              ? <CheckCircle2 size={13} style={{ color: style.color }} aria-hidden="true" />
                              : <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color }} />}
                          </div>
                          {i < phases.length - 1 && <div className="w-0.5 flex-1 min-h-[24px]" style={{ background: style.border }} />}
                        </div>
                        <div className="pb-5">
                          <p className="text-sm font-bold text-[#0B1020]">{phase.title}</p>
                          <p className="text-[11px] font-semibold" style={{ color: style.color }}>{style.label}</p>
                          {phase.description && <p className="mt-0.5 text-[11px] leading-snug text-[#94A3B8]">{phase.description}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Legenda de cores para os status das fases */}
                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[#F1F3F9] pt-4">
                  {[
                    { label: 'Concluído',          color: PHASE_STATUS_STYLE.concluido.color },
                    { label: 'Etapa atual',        color: PHASE_STATUS_STYLE.atual.color },
                    { label: 'Próximas etapas',    color: PHASE_STATUS_STYLE.proximo.color },
                    { label: 'Aguardando cliente', color: PHASE_STATUS_STYLE.aguardando_cliente.color },
                  ].map(item => (
                    <span key={item.label} className="flex items-center gap-1.5 text-[10px] text-[#5D6475]">
                      <span className="h-2 w-2 rounded-full" style={{ background: item.color }} aria-hidden="true" />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Três cards de progresso: O que foi feito / O que estamos fazendo / Próximos passos
                Cada lista vem de cp.completedItems, cp.inProgressItems e cp.nextSteps respectivamente */}
            <section aria-label="Progresso detalhado">
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Card: itens concluídos */}
                <div className="rounded-3xl border border-[#E3E7F0] bg-white p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0B1020]">
                    <CheckCircle2 size={15} className="text-[#10B981]" aria-hidden="true" />
                    O que já foi feito
                  </h3>
                  {completed.length === 0 ? (
                    <p className="text-xs text-[#94A3B8]">Nenhum item registrado ainda.</p>
                  ) : (
                    <ul className="space-y-2">
                      {completed.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#3A4256]">
                          <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#10B981]" aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {completed.length > 0 && (
                    <p className="mt-3 border-t border-[#F1F3F9] pt-2 text-[10px] font-semibold text-[#94A3B8]">
                      {completed.length} item{completed.length > 1 ? 's' : ''} concluído{completed.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                {/* Card: itens em andamento */}
                <div className="rounded-3xl border border-[#E3E7F0] bg-white p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0B1020]">
                    <Loader2 size={15} className="text-[#005BFF]" aria-hidden="true" />
                    O que estamos fazendo agora
                  </h3>
                  {inProgress.length === 0 ? (
                    <p className="text-xs text-[#94A3B8]">Nenhum item registrado ainda.</p>
                  ) : (
                    <ul className="space-y-2">
                      {inProgress.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#3A4256]">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#005BFF]" aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {inProgress.length > 0 && (
                    <p className="mt-3 border-t border-[#F1F3F9] pt-2 text-[10px] font-semibold text-[#94A3B8]">
                      {inProgress.length} item{inProgress.length > 1 ? 's' : ''} em andamento
                    </p>
                  )}
                </div>

                {/* Card: próximos passos (numerados) */}
                <div className="rounded-3xl border border-[#E3E7F0] bg-white p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0B1020]">
                    <ArrowRight size={15} className="text-[#7B2CFF]" aria-hidden="true" />
                    Próximos passos
                  </h3>
                  {nextSteps.length === 0 ? (
                    <p className="text-xs text-[#94A3B8]">Nenhum item registrado ainda.</p>
                  ) : (
                    <ul className="space-y-2">
                      {nextSteps.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#3A4256]">
                          <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#7B2CFF]/10 text-[9px] font-bold text-[#7B2CFF]">
                            {i + 1}
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {nextSteps.length > 0 && (
                    <p className="mt-3 border-t border-[#F1F3F9] pt-2 text-[10px] font-semibold text-[#94A3B8]">
                      {nextSteps.length} próximo{nextSteps.length > 1 ? 's' : ''} passo{nextSteps.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
            </div>
            </section>

            {/* Seção de pendências do cliente ────────────────────────────────
                Itens de cp.clientPendingItems que bloqueiam o avanço do projeto.
                Quando vazio, exibe mensagem positiva de que não há pendências. */}
            <section aria-label="Aguardando sua ação">
              <div className="rounded-3xl border border-[#F59E0B]/30 bg-[#F59E0B]/[0.04] p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-[#0B1020]">
                  <AlertTriangle size={15} className="text-[#F59E0B]" aria-hidden="true" />
                  Aguardando sua ação
                </h3>
                <p className="mb-3 text-xs text-[#5D6475]">
                  Esses itens dependem da sua validação ou envio de informações para o projeto avançar.
                </p>
                {pending.length === 0 ? (
                  <p className="text-xs font-medium text-[#10B981]">Nenhuma pendência no momento. Nossa equipe continua avançando com o projeto.</p>
                ) : (
                  <ul className="space-y-2">
                    {pending.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-xl border border-[#F59E0B]/20 bg-white px-3 py-2 text-xs font-medium text-[#3A4256]">
                        <AlertTriangle size={12} className="shrink-0 text-[#F59E0B]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

          </div>
        )}

        {/* ─── Aba: Materiais ─────────────────────────────────────────────────
            Exibe assets visuais organizados em categorias. Cada categoria tem
            um card de entrada com botão "Ver detalhes" que expande a seção.
            Estado expandedVisual controla quais categorias estão abertas. */}
        {activeTab === 'materiais' && (
          <div className="space-y-8">
            {/* Estado vazio: nenhum asset cadastrado ainda */}
            {visualCount === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#E3E7F0] bg-white px-6 py-16 text-center">
                <ImageIcon size={32} className="text-[#94A3B8]" aria-hidden="true" />
                <p className="text-sm font-semibold text-[#0B1020]">Nenhum material disponível ainda</p>
                <p className="max-w-xs text-xs text-[#5D6475]">
                  Imagens, documentos, fluxos e mockups aparecerão aqui assim que forem adicionados pela equipe.
                </p>
              </div>
            ) : (
              <>
                {/* Grid de entrada: seis cards, um por categoria de asset visual.
                    Botão "Ver detalhes" ativa/desativa a categoria em expandedVisual.
                    Desabilitado quando a categoria não tem itens. */}
                <section aria-label="Visão visual do projeto">
                  <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    Visão visual do projeto
                  </h2>
                  <p className="mb-4 text-sm text-[#5D6475]">
                    Veja imagens, documentos, fluxos e materiais que mostram como seu projeto está sendo construído.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {([
                      { key: 'galeria' as const,     icon: ImageIcon,       title: 'Galeria de imagens',  desc: 'Veja prints, mockups e prévias das telas do projeto.',            count: visualImages.length },
                      { key: 'documentos' as const,  icon: FileText,        title: 'Documentos e PDFs',   desc: 'Acesse escopo, relatórios, manuais e documentos do projeto.',     count: visualDocs.length   },
                      { key: 'fluxo' as const,       icon: OrgIcon,         title: 'Fluxo do sistema',    desc: 'Entenda como o sistema será usado na prática.',                   count: flowSteps.length    },
                      { key: 'organograma' as const, icon: Users,           title: 'Organograma',         desc: 'Veja quem participa do projeto e o papel de cada área.',          count: orgChart.length     },
                      { key: 'mapa' as const,        icon: LayoutTemplate,  title: 'Mapa de telas',       desc: 'Veja quais telas e módulos fazem parte do projeto.',              count: screenMap.length    },
                      { key: 'entregas' as const,    icon: Truck,           title: 'Prévia das entregas', desc: 'Acompanhe as entregas previstas e seus status.',                  count: deliverables.length },
                    ] as const).map(card => {
                      const CardIcon = card.icon
                      const isOpen   = expandedVisual[card.key]
                      const hasData  = card.count > 0
                      return (
                        <div key={card.key} className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#005BFF]/10">
                            <CardIcon size={18} className="text-[#005BFF]" aria-hidden="true" />
                          </div>
                          <p className="text-sm font-bold text-[#0B1020]">{card.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-[#5D6475]">{card.desc}</p>
                          <button type="button"
                            onClick={() => setExpandedVisual(v => ({ ...v, [card.key]: !v[card.key] }))}
                            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#005BFF] hover:underline disabled:cursor-default disabled:text-[#94A3B8] disabled:no-underline"
                            disabled={!hasData}
                          >
                            {hasData ? (isOpen ? 'Ocultar' : `Ver detalhes (${card.count})`) : 'Ainda não disponível'}
                            {hasData && <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>

                {/* Galeria de imagens — exibida quando expandedVisual.galeria = true
                    Usa VisualImageGalleryCard que permite aprovação individual por imagem */}
                {expandedVisual.galeria && visualImages.length > 0 && (
                  <section aria-label="Galeria de imagens">
                    <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Galeria de imagens</h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {visualImages.map(img => (
                        <VisualImageGalleryCard
                          key={img.id} img={img} busy={visualActionId === img.id}
                          onApprove={decision => handleVisualApproval('images', img.id, decision)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Documentos e PDFs — exibidos quando expandedVisual.documentos = true
                    Usa VisualDocumentRow que mostra nome, tipo e botão de aprovação */}
                {expandedVisual.documentos && visualDocs.length > 0 && (
                  <section aria-label="Documentos e PDFs">
                    <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Documentos e PDFs</h2>
                    <div className="space-y-3">
                      {visualDocs.map(doc => (
                        <VisualDocumentRow
                          key={doc.id} doc={doc} busy={visualActionId === doc.id}
                          onApprove={decision => handleVisualApproval('documents', doc.id, decision)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Organograma — cards com papel e nome de cada participante do projeto */}
                {expandedVisual.organograma && orgChart.length > 0 && (
                  <section aria-label="Organograma do projeto">
                    <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Organograma do projeto</h2>
                    <div className="rounded-3xl border border-[#E3E7F0] bg-white p-5 sm:p-6">
                      <div className="flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center">
                        {orgChart.map((r, i) => (
                          <div key={i} className="flex w-full max-w-[180px] flex-col items-center gap-1 rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC] px-4 py-3 text-center">
                            <Users size={16} className="text-[#005BFF]" aria-hidden="true" />
                            <p className="text-xs font-bold text-[#0B1020]">{r.role || '—'}</p>
                            {r.name && <p className="text-[10px] text-[#5D6475]">{r.name}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {/* Fluxograma do sistema ─────────────────────────────────────
                    Desktop: passos em linha horizontal com setas entre eles.
                    Mobile: passos em coluna vertical.
                    Ícone de cada passo é resolvido via FLOW_ICON_MAP pelo nome string. */}
                {expandedVisual.fluxo && flowSteps.length > 0 && (
                  <section aria-label="Fluxograma de funcionamento">
                    <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Como o sistema vai funcionar</h2>
                    <div className="rounded-3xl border border-[#E3E7F0] bg-white p-5 sm:p-6">
                      {/* Desktop: passos horizontais com setas */}
                      <div className="hidden lg:flex lg:items-center lg:justify-center lg:gap-2">
                        {flowSteps.map((s, i) => {
                          const StepIcon = FLOW_ICON_MAP[s.icon] ?? Network
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <div className="flex w-32 flex-col items-center gap-1.5 text-center">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#005BFF]/10">
                                  <StepIcon size={16} className="text-[#005BFF]" aria-hidden="true" />
                                </div>
                                <p className="text-xs font-bold text-[#0B1020]">{s.title}</p>
                                <p className="text-[10px] text-[#5D6475]">{s.description}</p>
                              </div>
                              {i < flowSteps.length - 1 && <ArrowRight size={14} className="shrink-0 text-[#94A3B8]" aria-hidden="true" />}
                            </div>
                          )
                        })}
                      </div>
                      {/* Mobile: passos em coluna */}
                      <div className="space-y-4 lg:hidden">
                        {flowSteps.map((s, i) => {
                          const StepIcon = FLOW_ICON_MAP[s.icon] ?? Network
                          return (
                            <div key={i} className="flex items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#005BFF]/10">
                                <StepIcon size={15} className="text-[#005BFF]" aria-hidden="true" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-[#0B1020]">{s.title}</p>
                                <p className="text-xs text-[#5D6475]">{s.description}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                )}

                {/* Mapa de telas — grid de módulos, cada um com lista de telas */}
                {expandedVisual.mapa && screenMap.length > 0 && (
                  <section aria-label="Mapa de telas">
                    <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Mapa de telas do projeto</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {screenMap.map((g, i) => (
                        <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#0B1020]">
                            <LayoutGrid size={14} className="text-[#7B2CFF]" aria-hidden="true" />
                            {g.module}
                          </p>
                          <ul className="space-y-1">
                            {g.screens.map((screen, j) => (
                              <li key={j} className="text-xs text-[#5D6475]">• {screen}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Prévia das entregas ──────────────────────────────────────
                    Cada entrega tem imagem (opcional), título, descrição e badge de status.
                    Quando status = 'em_validacao', exibe botões de aprovar / solicitar ajuste.
                    visualActionId controla o spinner individual durante o envio. */}
                {expandedVisual.entregas && deliverables.length > 0 && (
                  <section aria-label="Prévia das entregas">
                    <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Prévia das entregas</h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {deliverables.map(d => {
                        const st   = getVisualStatusStyles(d.status)
                        const busy = visualActionId === d.id
                        return (
                          <div key={d.id} className="overflow-hidden rounded-2xl border border-[#E3E7F0] bg-white">
                            {d.imageUrl ? (
                              <SignedVisualImage src={d.imageUrl} alt={d.title} className="h-32 w-full object-cover" />
                            ) : (
                              <div className="flex h-32 w-full items-center justify-center bg-[#F7F8FC]">
                                <Package size={24} className="text-[#94A3B8]" aria-hidden="true" />
                              </div>
                            )}
                            <div className="p-4">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-[#0B1020]">{d.title}</p>
                                <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                              </div>
                              {d.description && <p className="text-xs text-[#5D6475]">{d.description}</p>}
                              {/* Botões de aprovação — só aparecem quando a entrega está em validação */}
                              {d.status === 'em_validacao' && (
                                <div className="mt-2 flex gap-2">
                                  <button type="button" disabled={busy} onClick={() => handleVisualApproval('deliverables', d.id, 'aprovado')}
                                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#10B981]/10 py-1.5 text-[11px] font-bold text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-50">
                                    {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}Aprovar
                                  </button>
                                  <button type="button" disabled={busy} onClick={() => handleVisualApproval('deliverables', d.id, 'ajuste_solicitado')}
                                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#F59E0B]/10 py-1.5 text-[11px] font-bold text-[#F59E0B] hover:bg-[#F59E0B]/20 disabled:opacity-50">
                                    <AlertTriangle size={11} />Ajuste
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── Aba: Segurança ──────────────────────────────────────────────────
            Exibe o checklist de segurança (itens marcados e visíveis ao cliente)
            e os módulos do projeto com barra de progresso individual.
            hasSecurity controla se o bloco de segurança é exibido ou se mostra estado vazio. */}
        {activeTab === 'seguranca' && (
          <div className="space-y-8">
            {/* Bloco de segurança */}
            {hasSecurity ? (
              <section aria-label="Segurança do projeto">
                <div className="rounded-3xl border border-[#E3E7F0] bg-white p-5 sm:p-6">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1020]">
                    <ShieldCheck size={16} className="text-[#005BFF]" aria-hidden="true" />
                    Segurança do projeto
                  </h3>
                  <p className="mt-0.5 text-xs text-[#5D6475]">Entenda como protegemos seus dados e acessos.</p>
                  {/* Resumo textual de segurança (cp.securitySummary) */}
                  {cp.securitySummary && <p className="mt-3 text-sm text-[#5D6475]">{cp.securitySummary}</p>}
                  {/* Lista de itens do checklist de segurança já implementados */}
                  {securityItems.length > 0 && (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {securityItems.map(item => (
                        <li key={item.id} className="flex items-center gap-2 text-xs text-[#3A4256]">
                          <CheckCircle2 size={13} className="shrink-0 text-[#10B981]" aria-hidden="true" />
                          {item.label}
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Detalhes técnicos colapsáveis — apenas se cp.securityDetails foi preenchido */}
                  {cp.securityDetails && (
                    <div className="mt-4 border-t border-[#F1F3F9] pt-3">
                      <button type="button" onClick={() => setShowSecurityDetails(v => !v)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#005BFF]">
                        <ChevronDown size={13} className={`transition-transform ${showSecurityDetails ? 'rotate-180' : ''}`} aria-hidden="true" />
                        Ver detalhes da segurança
                      </button>
                      {showSecurityDetails && (
                        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[#F7F8FC] p-3 text-xs leading-relaxed text-[#5D6475]">
                          {cp.securityDetails}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </section>
            ) : (
              /* Estado vazio: segurança ainda não configurada pelo técnico */
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#E3E7F0] bg-white px-6 py-12 text-center">
                <ShieldCheck size={28} className="text-[#94A3B8]" aria-hidden="true" />
                <p className="text-sm font-semibold text-[#0B1020]">Segurança não configurada ainda</p>
                <p className="max-w-xs text-xs text-[#5D6475]">As informações de segurança do projeto serão exibidas aqui.</p>
              </div>
            )}

            {/* Grid de módulos do projeto ────────────────────────────────────
                Cada módulo mostra nome, descrição, badge de status e barra de progresso.
                Status é resolvido via MODULE_STATUS_LABEL para label e cores.
                Apenas módulos com visibleToClient !== false são exibidos (filtrado em `modules`). */}
            {modules.length > 0 && (
              <section aria-label="Módulos do projeto">
                <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  Módulos do projeto
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {modules.map((m, i) => {
                    const st = MODULE_STATUS_LABEL[m.status] ?? MODULE_STATUS_LABEL.nao_iniciado
                    return (
                      <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <LayoutGrid size={14} className="text-[#7B2CFF]" aria-hidden="true" />
                            <p className="text-sm font-bold text-[#0B1020]">{m.name}</p>
                          </div>
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </div>
                        {m.description && <p className="mb-2 text-xs text-[#5D6475]">{m.description}</p>}
                        <div className="flex items-center gap-2">
                          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#F1F3F9]">
                            <div className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]" style={{ width: `${m.progress}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-[#5D6475]">{m.progress}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ─── Aba: Relatórios ─────────────────────────────────────────────────
            Três blocos condicionais:
            1. Relatório executivo (se preenchido e visível ao cliente)
            2. Bloco de aprovação de etapa (se cp.approvalRequired = true)
            3. Histórico de atualizações (se há entradas em cp.updateHistory)
            hasRelatorios controla se o estado vazio é exibido ou o conteúdo real. */}
        {activeTab === 'relatorios' && (
          <div className="space-y-8">
            {/* Estado vazio: nenhum relatório disponível */}
            {!hasRelatorios ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#E3E7F0] bg-white px-6 py-12 text-center">
                <FileText size={28} className="text-[#94A3B8]" aria-hidden="true" />
                <p className="text-sm font-semibold text-[#0B1020]">Nenhum relatório disponível ainda</p>
                <p className="max-w-xs text-xs text-[#5D6475]">Relatórios executivos e aprovações serão exibidos aqui.</p>
              </div>
            ) : (
              <>
                {/* Relatório executivo ─────────────────────────────────────────
                    Campos: weekSummary, completedProgress, risks, nextMilestone, finalNote.
                    Botão "Copiar relatório" chama copyReport() para copiar texto formatado. */}
                {report && report.visibleToClient !== false && (report.weekSummary || report.completedProgress || report.risks || report.nextMilestone || report.finalNote) && (
                  <section aria-label="Relatório executivo">
                    <div className="rounded-3xl border border-[#E3E7F0] bg-white p-5 sm:p-6">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1020]">
                          <FileText size={16} className="text-[#10B981]" aria-hidden="true" />
                          Relatório executivo
                        </h3>
                        <button type="button" onClick={copyReport}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E7F0] px-2.5 py-1.5 text-[11px] font-semibold text-[#5D6475] transition-colors hover:border-[#005BFF]/30 hover:text-[#005BFF]">
                          <Copy size={11} aria-hidden="true" />
                          Copiar relatório
                        </button>
                      </div>
                      {report.weekSummary && <p className="text-sm text-[#3A4256]">{report.weekSummary}</p>}
                      {report.completedProgress && (
                        <p className="mt-3 rounded-xl border border-[#10B981]/20 bg-[#10B981]/[0.05] px-3 py-2 text-xs text-[#5D6475]">
                          <span className="font-bold text-[#10B981]">Avanços realizados: </span>{report.completedProgress}
                        </p>
                      )}
                      {report.risks && (
                        <p className="mt-3 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/[0.05] px-3 py-2 text-xs text-[#5D6475]">
                          <span className="font-bold text-[#F59E0B]">Pontos de atenção: </span>{report.risks}
                        </p>
                      )}
                      {report.nextMilestone && (
                        <p className="mt-3 rounded-xl border border-[#005BFF]/20 bg-[#005BFF]/[0.05] px-3 py-2 text-xs text-[#5D6475]">
                          <span className="font-bold text-[#005BFF]">Próximo marco: </span>{report.nextMilestone}
                        </p>
                      )}
                      {report.finalNote && <p className="mt-3 text-xs italic text-[#94A3B8]">{report.finalNote}</p>}
                    </div>
                  </section>
                )}

                {/* Bloco de aprovação de etapa ──────────────────────────────
                    Exibido apenas quando cp.approvalRequired = true.
                    Estados possíveis:
                    - Aguardando (sem resposta): mostra botões "Aprovar etapa" e "Solicitar ajuste"
                      - Ao clicar em "Solicitar ajuste" pela 1ª vez: abre textarea (showAdjustForm)
                      - Ao clicar novamente com texto: envia via handleApproval()
                    - Já respondido: exibe badge verde (aprovado) ou vermelho (ajustes solicitados)
                      com data da resposta */}
                {cp.approvalRequired && (
                  <section aria-label="Aprovação da etapa">
                    <div className="rounded-3xl border border-[#005BFF]/25 bg-[#005BFF]/[0.03] p-5 sm:p-6">
                      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-[#0B1020]">
                        <CheckCircle2 size={16} className="text-[#005BFF]" aria-hidden="true" />
                        Aprovação da etapa
                      </h3>
                      {/* Mensagem personalizada do técnico explicando o que precisa ser aprovado */}
                      {cp.approvalMessage && <p className="mt-2 text-sm text-[#3A4256]">{cp.approvalMessage}</p>}

                      {/* Formulário de aprovação — apenas quando ainda aguardando resposta */}
                      {!cp.approvalStatus || cp.approvalStatus === 'aguardando' ? (
                        <div className="mt-4">
                          {/* Textarea de nota de ajuste — visível após primeiro clique em "Solicitar ajuste" */}
                          {showAdjustForm && (
                            <div className="mb-3">
                              <textarea rows={2} placeholder="O que precisa ser ajustado?" value={adjustNote}
                                onChange={e => setAdjustNote(e.target.value)}
                                className="w-full resize-none rounded-xl border border-[#E3E7F0] bg-white px-3 py-2.5 text-sm text-[#0B1020] placeholder:text-[#94A3B8] outline-none focus:border-[#005BFF]/40" />
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {/* Botão principal: aprovar etapa imediatamente */}
                            <button type="button" disabled={!!submittingApproval} onClick={() => handleApproval('aprovado')}
                              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.22)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
                              {submittingApproval === 'aprovado' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              Aprovar etapa
                            </button>
                            {/* Botão de ajuste: muda de texto após abrir o formulário */}
                            {showAdjustForm ? (
                              <button type="button" disabled={!!submittingApproval || !adjustNote.trim()} onClick={() => handleApproval('ajustes_solicitados')}
                                className="inline-flex items-center gap-2 rounded-xl border border-[#F59E0B]/40 bg-white px-4 py-2.5 text-sm font-bold text-[#F59E0B] transition-all hover:bg-[#F59E0B]/5 disabled:cursor-not-allowed disabled:opacity-50">
                                {submittingApproval === 'ajustes_solicitados' ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                                Confirmar solicitação
                              </button>
                            ) : (
                              <button type="button" disabled={!!submittingApproval} onClick={() => handleApproval('ajustes_solicitados')}
                                className="inline-flex items-center gap-2 rounded-xl border border-[#E3E7F0] bg-white px-4 py-2.5 text-sm font-bold text-[#5D6475] transition-all hover:border-[#F59E0B]/40 hover:text-[#F59E0B]">
                                <AlertTriangle size={14} />
                                Solicitar ajuste
                              </button>
                            )}
                            {/* Botão cancelar — limpa o formulário de ajuste */}
                            {showAdjustForm && (
                              <button type="button" disabled={!!submittingApproval} onClick={() => { setShowAdjustForm(false); setAdjustNote('') }}
                                className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-semibold text-[#94A3B8] hover:text-[#5D6475]">
                                <X size={12} aria-hidden="true" />
                                Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Badge de resposta já enviada — verde (aprovado) ou vermelho (ajustes) */
                        <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold"
                          style={{
                            background: cp.approvalStatus === 'aprovado' ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                            color: cp.approvalStatus === 'aprovado' ? '#10B981' : '#EF4444',
                          }}>
                          <CheckCircle2 size={14} aria-hidden="true" />
                          {cp.approvalStatus === 'aprovado' ? 'Você aprovou esta etapa' : 'Você solicitou ajustes'}
                          {cp.approvalRespondedAt && (
                            <span className="ml-auto text-[10px] font-normal opacity-70">
                              {new Date(cp.approvalRespondedAt).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Histórico de atualizações ────────────────────────────────
                    Lista cronológica de eventos registrados pelo técnico em cp.updateHistory.
                    Cada entrada tem: date, type (label do tipo), title e description opcional. */}
                {history.length > 0 && (
                  <section aria-label="Histórico de atualizações">
                    <h2 className="mb-4 text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      Histórico de atualizações
                    </h2>
                    <div className="rounded-3xl border border-[#E3E7F0] bg-white p-5 sm:p-6">
                      <ul className="space-y-4">
                        {history.map((entry, i) => (
                          <li key={i} className="flex gap-3 border-b border-[#F1F3F9] pb-4 last:border-b-0 last:pb-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#005BFF]/10">
                              <HistoryIcon size={13} className="text-[#005BFF]" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#94A3B8]">
                                <span className="flex items-center gap-1"><Clock size={9} aria-hidden="true" />{new Date(entry.date).toLocaleDateString('pt-BR')}</span>
                                <span>·</span>
                                <span className="font-semibold text-[#005BFF]">{entry.type}</span>
                              </div>
                              <p className="mt-0.5 text-sm font-bold text-[#0B1020]">{entry.title}</p>
                              {entry.description && <p className="mt-0.5 text-xs text-[#5D6475]">{entry.description}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

    </div>
  )
}
