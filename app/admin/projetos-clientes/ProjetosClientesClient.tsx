'use client'

// Importações de hooks do React para estado, referências e efeitos colaterais
import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
// Biblioteca de animações para transições suaves de entrada/saída
import { motion, AnimatePresence } from 'framer-motion'
// Notificações de feedback para o usuário (toast)
import { toast } from 'sonner'
// Ícones da interface
import {
  Plus, Trash2, Loader2, Save, X, CheckCircle,
  Users, FolderKanban, TrendingUp, Clock, RefreshCw,
  Eye, EyeOff, Mail,
  FileText, BarChart3, ShieldCheck, Monitor, Copy, MessageCircle,
  Building2, Phone, AlertTriangle, User, Hash,
} from 'lucide-react'
// Layout padrão das páginas admin
import AdminShell from '@/components/layout/AdminShell'
// Modal de confirmação antes de excluir
import ConfirmDialog from '@/components/admin/ConfirmDialog'
// Cliente do Supabase para operações no banco
import { createClient } from '@/lib/supabase'
// Sub-componentes de edição por aba
import ProjectClientProgressEditor from '@/components/sections/ProjectClientProgressEditor'
import ProjectSecurityModulesEditor from '@/components/sections/ProjectSecurityModulesEditor'
import ProjectVisualCenter from '@/components/sections/ProjectVisualCenter'
import ProjectLivePreview from '@/components/sections/ProjectLivePreview'
// Funções utilitárias para status e prazos
import { getDeadlineBadge, isDeadlineOverdue, getProgressStatusWarning } from '@/lib/project-status'
// Hooks customizados para modal de CRUD e confirmação de exclusão
import { useCrudModal } from '@/hooks/useCrudModal'
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
// Card de exibição do projeto e tipos auxiliares
import ProjectClientCard, {
  STATUSES, STATUS_COLOR, type Client, type TeamRow,
} from '@/components/admin/ProjectClientCard'
// Tipos globais do projeto
import type { ProjectUpdateEntry, ClientProgress, ClientProject, Technician, CreditPaymentStatus } from '@/types'
// Formata timestamps relativos (ex: "há 2 horas")
import { timeAgo } from '@/lib/utils'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// CP era uma cópia manual do shape de client_projects, com drift em
// relação ao ClientProject usado no dashboard do cliente — consolidado em
// types/index.ts; mantido como alias local só pra não precisar renomear
// toda referência a `CP` neste arquivo.
type CP = ClientProject

// Props recebidas pelo componente vindo da Server Component (page.tsx)
interface Props {
  user:            SupabaseUser          // Usuário autenticado (técnico)
  profile:         { full_name?: string } | null  // Perfil do técnico logado
  isLeader:        boolean               // Se o técnico atual é líder (acesso a créditos)
  initialProjects: CP[]                  // Projetos carregados no servidor
  clients:         Client[]              // Lista de clientes para autocomplete
  technicians:     Technician[]          // Técnicos disponíveis para adicionar à equipe
  initialTeam:     TeamRow[]             // Vínculos técnico-projeto (pending/accepted)
}

// Categorias de projeto disponíveis no select
const CATEGORIES = ['Software', 'Automação', 'Dados', 'Cibersegurança']

// Opções de prioridade com suas cores visuais correspondentes
const PRIORITY_OPTIONS = [
  { value: 'baixa',   label: 'Baixa',   color: '#10B981' },
  { value: 'normal',  label: 'Normal',  color: '#005BFF' },
  { value: 'alta',    label: 'Alta',    color: '#7B2CFF' },
  { value: 'urgente', label: 'Urgente', color: '#EF4444' },
]

// Templates de mensagem para preencher rapidamente o campo "Atualização para o cliente"
const NOTE_TEMPLATES = [
  { label: 'Início do projeto', text: 'Seu projeto foi iniciado. Nossa equipe está organizando as primeiras etapas e preparando a estrutura principal.' },
  { label: 'Etapa concluída', text: 'Finalizamos uma etapa importante do projeto e seguimos para a próxima fase do desenvolvimento.' },
  { label: 'Aguardando validação', text: 'Precisamos da sua validação para avançar com segurança para a próxima etapa.' },
  { label: 'Revisão necessária', text: 'Identificamos alguns ajustes necessários e estamos revisando os pontos para garantir uma entrega melhor.' },
  { label: 'Impedimento', text: 'Existe um ponto que precisa ser resolvido antes de avançarmos. Nossa equipe já está acompanhando a situação.' },
  { label: 'Próxima entrega', text: 'A próxima entrega prevista será apresentada em breve para validação.' },
]

// Abas do formulário de edição de projeto — cada aba agrupa um conjunto de campos
const FORM_TABS = [
  { key: 'basico' as const,         label: 'Básico',              icon: FileText  },
  { key: 'acompanhamento' as const, label: 'Acompanhamento',      icon: BarChart3 },
  { key: 'seguranca' as const,      label: 'Segurança & Extras',  icon: ShieldCheck },
  { key: 'visual' as const,         label: 'Visão visual',        icon: Monitor   },
  { key: 'previa' as const,         label: 'Prévia',               icon: Eye       },
]


// Verifica a qualidade do texto de atualização para o cliente
// Retorna checklist com indicadores de boas práticas de comunicação
function getUpdateQualityChecks(text: string): { label: string; ok: boolean }[] {
  const t = text.toLowerCase()
  return [
    { label: 'Informa a etapa atual',       ok: /etapa|fase/.test(t) },
    { label: 'Explica o que foi feito',     ok: /finalizamos|conclu|fizemos|realizamos|iniciamos/.test(t) },
    { label: 'Informa o próximo passo',     ok: /próxima|próximo|seguir|avançar/.test(t) },
    { label: 'Usa linguagem simples',       ok: text.trim().length > 0 && text.length < 600 },
    { label: 'Não está vazio',              ok: text.trim().length > 40 },
  ]
}

// Estado inicial do formulário de criação/edição de projeto
const EMPTY_FORM = {
  client_id: '', title: '', description: '', category: '', status: 'em_analise',
  progress: 0, priority: 'normal', notes: '', deadline: '',
  client_progress: {} as ClientProgress,
  credit_cost: '', allow_credit_payment: false, credit_payment_status: 'nao_aplicavel' as CreditPaymentStatus,
}

export default function ProjetosClientesClient({ user, profile, isLeader, initialProjects, clients: initialClients, technicians, initialTeam }: Props) {
  const searchParams = useSearchParams()
  // Lista de projetos exibida na tela (atualizada otimisticamente)
  const [projects,    setProjects]    = useState<CP[]>(initialProjects)
  // Mapa de clientes indexado por ID para busca rápida
  const [clientsMap,  setClientsMap]  = useState<Record<string, Client>>(
    () => Object.fromEntries(initialClients.map(c => [c.id, c]))
  )
  // Mapa de técnicos indexado por ID (sem setter — lista não muda nesta sessão)
  const [techMap] = useState<Record<string, Technician>>(
    () => Object.fromEntries(technicians.map(t => [t.id, t]))
  )
  // project_id -> linhas de equipe (com status pending/accepted)
  const [team, setTeam] = useState<Record<string, TeamRow[]>>(() => {
    const map: Record<string, TeamRow[]> = {}
    initialTeam.forEach(t => { (map[t.project_id] ??= []).push(t) })
    return map
  })
  // Indica se projetos estão sendo carregados (exibe skeleton)
  const [loading,     setLoading]     = useState(true)
  // Estado do modal de criação/edição via hook genérico de CRUD
  const {
    showForm, setShowForm, editingId, setEditingId, form, setForm,
    saving, setSaving, error, setError, saved, setSaved,
  } = useCrudModal(EMPTY_FORM)
  // Estado de confirmação de exclusão via hook dedicado
  const {
    confirmId: confirmDel, setConfirmId: setConfirmDel, deleting, setDeleting,
  } = useConfirmDelete()
  // Controla visibilidade da prévia lateral no desktop
  const [showSidebarPreview, setShowSidebarPreview] = useState(true)
  // Aba ativa do formulário de edição
  const [formTab,     setFormTab]     = useState<'basico' | 'acompanhamento' | 'seguranca' | 'visual' | 'previa'>('basico')
  // Checkbox "Notificar cliente" na aba Acompanhamento — reseta para true após cada save
  const [notifyClient, setNotifyClient] = useState(true)
  // Mensagem de feedback após salvar (draft vs publish)
  const [savedMessage, setSavedMessage] = useState('')
  // ID do projeto em processo de aceite (evita cliques duplos)
  const [accepting,   setAccepting]   = useState<string | null>(null)
  // ID do projeto com menu "adicionar técnico" aberto
  const [addTechFor,  setAddTechFor]  = useState<string | null>(null)
  // Erros de nível de página (ex: falha ao aceitar projeto)
  const [pageError,   setPageError]   = useState('')
  // Autocomplete do campo cliente
  const [clientSearch,     setClientSearch]     = useState('')
  const [showSuggestions,  setShowSuggestions]  = useState(false)
  // Ref do container de autocomplete (para fechar ao clicar fora)
  const clientSearchRef = useRef<HTMLDivElement>(null)
  // Guarda o resumo original ao abrir edição (detecta se mudou para criar entrada no histórico)
  const originalSummaryRef = useRef('')
  // Instância estável do Supabase (evita recriar a cada render)
  const sbRef = useRef(createClient())
  const sb = sbRef.current

  /* Busca equipe de todos os projetos */
  const fetchTeam = async () => {
    const { data } = await sb.from('client_project_team').select('id, project_id, technician_id, status, invited_by')
    if (data) {
      const map: Record<string, TeamRow[]> = {}
      data.forEach((t: TeamRow) => { (map[t.project_id] ??= []).push(t) })
      setTeam(map)
    }
  }

  /* Aceitar projeto — vira líder + entra direto como membro aceito */
  const handleAccept = async (projectId: string) => {
    setAccepting(projectId)
    try {
      // Insere o técnico na equipe com status 'accepted' imediatamente
      const { data: row, error: teamErr } = await sb
        .from('client_project_team')
        .insert({ project_id: projectId, technician_id: user.id, status: 'accepted' })
        .select('*').single()
      if (teamErr) throw teamErr
      // Define o técnico como líder técnico do projeto
      const { error: leadErr } = await sb.from('client_projects').update({ lead_technician_id: user.id }).eq('id', projectId)
      if (leadErr) throw leadErr
      // Atualiza estado local otimisticamente sem recarregar
      setTeam(prev => ({ ...prev, [projectId]: [...(prev[projectId] ?? []), row as TeamRow] }))
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, lead_technician_id: user.id } : p))
    } catch { setPageError('Erro ao aceitar projeto.'); setTimeout(() => setPageError(''), 4000) } finally { setAccepting(null) }
  }

  /* Convida técnico — fica pendente até ele aceitar */
  const handleAddTechnician = async (projectId: string, technicianId: string) => {
    const { data: row, error: err } = await sb
      .from('client_project_team')
      .insert({ project_id: projectId, technician_id: technicianId, status: 'pending', invited_by: user.id })
      .select('*').single()
    if (!err && row) {
      // Adiciona a linha de convite no estado local
      setTeam(prev => ({ ...prev, [projectId]: [...(prev[projectId] ?? []), row as TeamRow] }))
    }
    setAddTechFor(null) // Fecha o menu de seleção de técnico
  }

  /* Aceita convite pendente — o próprio técnico muda seu status para 'accepted' */
  const handleAcceptInvite = async (projectId: string) => {
    const { error: err } = await sb
      .from('client_project_team')
      .update({ status: 'accepted' })
      .eq('project_id', projectId).eq('technician_id', user.id)
    if (!err) {
      setTeam(prev => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).map(t => t.technician_id === user.id ? { ...t, status: 'accepted' } : t),
      }))
    }
  }

  /* Recusa convite pendente (remove a própria linha) */
  const handleDeclineInvite = async (projectId: string) => {
    await sb.from('client_project_team').delete().eq('project_id', projectId).eq('technician_id', user.id)
    setTeam(prev => ({ ...prev, [projectId]: (prev[projectId] ?? []).filter(t => t.technician_id !== user.id) }))
  }

  /* Remove técnico da equipe (membro aceito remove qualquer um, exceto a si via aqui) */
  const handleRemoveTechnician = async (projectId: string, technicianId: string) => {
    await sb.from('client_project_team').delete().eq('project_id', projectId).eq('technician_id', technicianId)
    setTeam(prev => ({ ...prev, [projectId]: (prev[projectId] ?? []).filter(t => t.technician_id !== technicianId) }))
  }

  /* Busca todos os clientes no browser (ignora RLS do servidor) */
  const fetchClients = async () => {
    const { data } = await sb
      .from('profiles')
      .select('id, full_name, email, company_name, phone, document')
      .or('role.eq.client,role.is.null')
      .order('full_name', { ascending: true })
    if (data && data.length > 0) {
      // Mescla com o mapa existente sem apagar clientes já carregados
      setClientsMap(prev => ({
        ...prev,
        ...Object.fromEntries(data.map(c => [c.id, c as Client])),
      }))
    }
  }

  /* Fecha sugestões ao clicar fora do container de autocomplete */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* Fetch projetos + perfis dos clientes envolvidos. Sem setState síncrono no
     topo — pode ser chamada direto do efeito de montagem. */
  const fetchProjects = async () => {
    const { data: rows } = await sb
      .from('client_projects')
      .select('*')
      .order('updated_at', { ascending: false })

    if (rows && rows.length > 0) {
      // Busca perfis dos clientes referenciados nos projetos (em lote)
      const ids = [...new Set(rows.map((r: CP) => r.client_id))]
      const { data: profiles, error: profErr } = await sb
        .from('profiles')
        .select('id, full_name, email, company_name, phone, document')
        .in('id', ids)
      if (profErr) console.error('[proj-clientes] profiles RLS error:', profErr.message)
      if (profiles && profiles.length > 0) {
        setClientsMap(prev => ({
          ...prev,
          ...Object.fromEntries(profiles.map(p => [p.id, p as Client])),
        }))
      }
      setProjects(rows as CP[])
    } else {
      setProjects([])
    }
    setLoading(false)
  }

  /* Usado pelo botão "Atualizar" — mostra o spinner de loading antes de refazer o fetch. */
  const refreshProjects = async () => {
    setLoading(true)
    await fetchProjects()
  }

  // Carrega dados ao montar o componente (loading já inicia true, sem precisar reafirmar)
  useEffect(() => {
    fetchProjects()
    fetchClients()
    fetchTeam()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Abre o formulário limpo para criação de novo projeto
  const openAdd = () => {
    setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); setError(''); setFormTab('basico')
    setClientSearch(''); setShowSuggestions(false)
    originalSummaryRef.current = ''
  }

  // Abre o formulário preenchido com os dados do projeto existente para edição
  const openEdit = (p: CP) => {
    setForm({
      client_id: p.client_id, title: p.title, description: p.description ?? '',
      category: p.category ?? '', status: p.status, progress: p.progress,
      priority: p.priority, notes: p.notes ?? '', deadline: p.deadline ?? '',
      client_progress: p.client_progress ?? {},
      credit_cost: p.credit_cost != null ? String(p.credit_cost) : '',
      allow_credit_payment: p.allow_credit_payment ?? false,
      credit_payment_status: p.credit_payment_status ?? 'nao_aplicavel',
    })
    // Preenche campo de busca com o nome do cliente atual
    const c = clientsMap[p.client_id]
    setClientSearch(c?.full_name ?? c?.email ?? '')
    setShowSuggestions(false)
    setEditingId(p.id); setShowForm(true); setError(''); setFormTab('basico')
    // Salva o resumo atual para detectar alterações e gerar entrada no histórico
    originalSummaryRef.current = p.client_progress?.projectSummary ?? ''
  }

  // Abre automaticamente o projeto especificado em ?open=<id>
  const openParam = searchParams.get('open')
  useEffect(() => {
    if (!openParam || loading) return
    const proj = projects.find(p => p.id === openParam)
    // Abertura do form é intencionalmente síncrona à mudança de ?open=<id> na
    // URL (deep link) — não há como derivar isso durante o render, já que
    // depende do fetch assíncrono de `projects` ter terminado (`loading`).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (proj) openEdit(proj)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, loading])

  // Salva o projeto (criar ou atualizar) — mode 'draft' não exibe mensagem de publicação
  const handleSave = async (e?: React.FormEvent, mode: 'draft' | 'publish' = 'publish') => {
    e?.preventDefault()
    // Validações obrigatórias antes de prosseguir
    if (!form.client_id || !form.title) { setError('Cliente e título são obrigatórios.'); return }
    if (form.allow_credit_payment && !form.credit_cost.trim()) { setError('Informe o custo em créditos deste projeto.'); return }
    setSaving(true); setError('')
    try {
      let clientProgress = form.client_progress
      const currentSummary = clientProgress.projectSummary ?? ''
      // Se o resumo executivo foi alterado, cria entrada automática no histórico
      if (formTab === 'acompanhamento' && currentSummary && currentSummary !== originalSummaryRef.current) {
        const autoEntry: ProjectUpdateEntry = {
          date: new Date().toISOString().slice(0, 10),
          type: 'Atualização',
          title: 'Acompanhamento atualizado',
          description: currentSummary,
          responsavel: profile?.full_name || user.email || '',
        }
        clientProgress = { ...clientProgress, updateHistory: [autoEntry, ...(clientProgress.updateHistory ?? [])].slice(0, 50) }
        originalSummaryRef.current = currentSummary
      }

      // allow_credit_payment liga/desliga sem passar por 'pendente' manual;
      // 'pago' nunca é sobrescrito aqui (só a função redeem_credits_for_project
      // marca isso, ao debitar de fato os créditos do cliente).
      let creditPaymentStatus = form.credit_payment_status
      if (creditPaymentStatus !== 'pago') {
        creditPaymentStatus = form.allow_credit_payment ? 'pendente' : 'nao_aplicavel'
      }

      // Monta o payload final para inserção/atualização no banco
      const payload = {
        client_id: form.client_id, title: form.title.trim(),
        description: form.description || null, category: form.category || null,
        status: form.status, progress: Number(form.progress),
        priority: form.priority, notes: form.notes || null,
        deadline: form.deadline || null, updated_at: new Date().toISOString(),
        client_progress: clientProgress,
        credit_cost: form.allow_credit_payment && form.credit_cost.trim() ? Number(form.credit_cost) : null,
        allow_credit_payment: form.allow_credit_payment,
        credit_payment_status: creditPaymentStatus,
      }
      if (editingId) {
        // Atualização: persiste e atualiza estado local sem recarregar
        const { error: err } = await sb.from('client_projects').update(payload).eq('id', editingId)
        if (err) throw err
        setProjects(prev => prev.map(p => p.id === editingId ? { ...p, ...payload } : p))
        if (formTab === 'acompanhamento' && mode !== 'draft' && notifyClient) {
          fetch('/api/notify/project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: editingId }),
          }).catch(() => {/* silencioso */})
        }
      } else {
        // Criação: insere e adiciona no topo da lista
        const { data, error: err } = await sb.from('client_projects').insert(payload).select('*').single()
        if (err) throw err
        setProjects(prev => [data, ...prev])
      }
      setShowForm(false); setEditingId(null)
      setSavedMessage(mode === 'draft'
        ? 'Rascunho salvo com sucesso.'
        : 'Projeto atualizado com sucesso. As informações já estão disponíveis para o cliente.')
      setSaved(true); setNotifyClient(true); setTimeout(() => setSaved(false), 4000)
    } catch {
      setError('Não foi possível salvar as alterações. Verifique os campos obrigatórios e tente novamente.')
    } finally { setSaving(false) }
  }

  // Exclui o projeto permanentemente após confirmação
  const handleDelete = async (id: string) => {
    setDeleting(id)
    await sb.from('client_projects').delete().eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
    setDeleting(null); setConfirmDel(null)
  }

  // Helper: retorna os dados do cliente a partir do mapa pelo ID
  const clientInfo = (id: string) => clientsMap[id] ?? null

  return (
    <>
    <AdminShell user={user} profile={profile}>
      <div className="space-y-6">
        {/* Header: título da página e botões de ação principais */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Projetos de clientes
            </h1>
            <p className="mt-1 text-sm text-white/40">Gerencie e acompanhe projetos por cliente.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Botão de recarregar projetos manualmente */}
            <button type="button" onClick={refreshProjects} disabled={loading}
              title="Recarregar projetos"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/60 transition-all hover:text-white disabled:opacity-40">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Carregando...' : 'Atualizar'}
            </button>
            {/* Botão para abrir formulário de novo projeto */}
            <button type="button" onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5">
              <Plus size={16} />Adicionar projeto
            </button>
          </div>
        </div>

        {/* Feedback de sucesso após salvar projeto */}
        {saved && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-2xl bg-[#10B981]/15 px-4 py-3 text-sm font-semibold text-[#34D399]">
            <CheckCircle size={16} />{savedMessage || 'Projeto salvo com sucesso!'}
          </motion.div>
        )}

        {/* Erro de nível de página (aceitar/adicionar técnico) */}
        {pageError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-400">
            {pageError}
          </motion.div>
        )}

        {/* Cards de estatísticas: total, em andamento, concluídos, clientes únicos */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: FolderKanban, label: 'Total',         value: projects.length,                                          color: '#60A5FA' },
            { icon: TrendingUp,   label: 'Em andamento', value: projects.filter(p => p.status === 'em_desenvolvimento').length, color: '#005BFF' },
            { icon: CheckCircle,  label: 'Concluídos',   value: projects.filter(p => p.status === 'concluido').length,    color: '#10B981' },
            { icon: Users,        label: 'Clientes',      value: new Set(projects.map(p => p.client_id)).size,             color: '#A78BFA' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
                <Icon size={16} style={{ color }} aria-hidden="true" />
              </div>
              <p className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', color }}>{value}</p>
              <p className="text-xs text-white/40">{label}</p>
            </div>
          ))}
        </div>

        {/* Formulário de criação/edição (animado com AnimatePresence) */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className="rounded-2xl border border-[#005BFF]/25 bg-[#0D1428]">

              {/* Cabeçalho do painel com título, info do cliente e botão de prévia */}
              <div className="border-b border-white/[0.08] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      {editingId ? 'Editar projeto' : 'Novo projeto'}
                    </h2>
                    <p className="mt-1 text-xs text-white/40">
                      Atualize as informações do projeto e acompanhe o que seu cliente verá.
                    </p>
                  </div>
                  {/* Botão fechar formulário */}
                  <button type="button" onClick={() => setShowForm(false)} aria-label="Fechar"
                    className="shrink-0 text-white/40 hover:text-white transition-colors"><X size={18} /></button>
                </div>

                {/* Metadados do projeto em edição: status, última atualização, ID, dados do cliente */}
                {editingId && (() => {
                  const proj = projects.find(p => p.id === editingId)
                  if (!proj) return null
                  const color = STATUS_COLOR[proj.status] ?? '#64748B'
                  const fb = clientsMap[proj.client_id]
                  // Prioriza dados salvos no snapshot do projeto (client_name) em vez do perfil ao vivo
                  const cName    = proj.client_name    || fb?.full_name    || '—'
                  const cCompany = proj.client_company || fb?.company_name
                  const cPhone   = proj.client_phone   || fb?.phone
                  return (
                    <>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 font-bold text-white">{proj.title}</span>
                        <span className="rounded-full px-2.5 py-1 font-bold" style={{ background: `${color}18`, color }}>
                          {STATUSES.find(s => s.value === proj.status)?.label ?? proj.status}
                        </span>
                        <span className="flex items-center gap-1 text-white/30">
                          <Clock size={11} aria-hidden="true" />Última atualização {timeAgo(proj.updated_at)}
                        </span>
                        <span className="flex items-center gap-1 text-white/30">
                          <Hash size={11} aria-hidden="true" />{proj.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-white/40">
                        Cliente: <span className="text-white/70">{cName}</span>
                        {cCompany && <> · Empresa: <span className="text-white/70">{cCompany}</span></>}
                        {cPhone && <> · Telefone: <span className="text-white/70">{cPhone}</span></>}
                      </p>
                    </>
                  )
                })()}

                {/* Toggle: mostrar/ocultar prévia lateral (só faz sentido no desktop) */}
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setShowSidebarPreview(v => !v)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] px-3.5 py-2 text-xs font-bold text-white/60 transition-all hover:border-[#005BFF]/40 hover:text-[#60A5FA]">
                    {showSidebarPreview ? <><EyeOff size={13} aria-hidden="true" />Ocultar prévia</> : <><Eye size={13} aria-hidden="true" />Pré-visualizar cliente</>}
                  </button>
                </div>
              </div>

              {/* Abas de navegação do formulário com ícones */}
              <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-white/[0.08] px-6">
                {FORM_TABS.map(tab => (
                  <button key={tab.key} type="button" onClick={() => setFormTab(tab.key)}
                    className={`relative flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${
                      formTab === tab.key ? 'text-white' : 'text-white/40 hover:text-white/70'
                    }`}>
                    <tab.icon size={14} aria-hidden="true" />
                    {tab.label}
                    {/* Indicador de aba ativa (linha colorida na base) */}
                    {formTab === tab.key && (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]" />
                    )}
                  </button>
                ))}
              </div>

              {/* Layout principal: campos do formulário + prévia lateral (desktop) */}
              <div className={`grid gap-6 p-6 ${showSidebarPreview ? 'xl:grid-cols-[1fr_360px]' : ''}`}>
              <div className="min-w-0 max-h-[65vh] overflow-y-auto pr-1">
              <form id="project-edit-form" onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">

              {/* ── ABA: BÁSICO ──────────────────────────────── */}
              {formTab === 'basico' && (
              <>
                {/* Alertas inteligentes: prazo vencido, progresso inconsistente, campos vazios */}
                {(() => {
                  const alerts: { text: string; tone: 'late' | 'warn' }[] = []
                  if (isDeadlineOverdue(form.deadline)) {
                    alerts.push({ text: 'Prazo vencido. Atualize o prazo antes de publicar para o cliente.', tone: 'late' })
                  }
                  const progressWarning = getProgressStatusWarning(form.status, Number(form.progress))
                  if (progressWarning) alerts.push({ text: progressWarning, tone: 'warn' })
                  if (!form.notes.trim()) alerts.push({ text: 'A atualização para o cliente está vazia. Adicione uma mensagem antes de publicar.', tone: 'warn' })
                  if (!form.client_progress.nextMilestone) alerts.push({ text: 'Projeto sem próximo marco definido.', tone: 'warn' })
                  if (editingId) {
                    const proj = projects.find(p => p.id === editingId)
                    if (proj && !proj.lead_technician_id) alerts.push({ text: 'Projeto ainda sem um técnico responsável.', tone: 'warn' })
                  }
                  if (!form.client_id || !form.title.trim()) alerts.push({ text: 'Dados obrigatórios incompletos: cliente e título do projeto.', tone: 'warn' })
                  if (alerts.length === 0) return null
                  return (
                    <div className="sm:col-span-2 space-y-2">
                      {alerts.map((a, i) => (
                        <div key={i} className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                          a.tone === 'late' ? 'border-red-500/25 bg-red-500/[0.06] text-red-400' : 'border-[#F59E0B]/25 bg-[#F59E0B]/[0.06] text-[#FBBF24]'
                        }`}>
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {a.text}
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* 1. Card com dados do cliente (somente em modo edição) */}
                {editingId && (() => {
                  const proj = projects.find(p => p.id === editingId)
                  const fb   = clientsMap[form.client_id]
                  // Prioriza snapshot salvo no projeto; fallback para perfil ao vivo
                  const name    = proj?.client_name     || fb?.full_name    || null
                  const company = proj?.client_company  || fb?.company_name || null
                  const email   = proj?.client_email    || fb?.email        || null
                  const phone   = proj?.client_phone    || fb?.phone        || null
                  const doc     = proj?.client_document || fb?.document     || null
                  if (!name && !email) return null
                  // Monta link direto para WhatsApp se o telefone estiver disponível
                  const waHref = phone ? `https://wa.me/55${phone.replace(/\D/g, '')}` : null
                  return (
                    <div className="sm:col-span-2 rounded-2xl border border-white/[0.08] bg-[#111C2E] p-4">
                      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-white/70">
                        <User size={13} aria-hidden="true" />Dados do cliente
                      </p>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="flex items-center gap-2 text-xs">
                          <User size={12} className="shrink-0 text-white/25" aria-hidden="true" />
                          <span className="text-white/40">Nome:</span>
                          <span className="font-semibold text-white">{name ?? '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Building2 size={12} className="shrink-0 text-white/25" aria-hidden="true" />
                          <span className="text-white/40">Empresa:</span>
                          <span className="font-semibold text-white">{company ?? '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Mail size={12} className="shrink-0 text-white/25" aria-hidden="true" />
                          <span className="truncate text-white/70">{email ?? '—'}</span>
                          {/* Botão copiar e-mail para a área de transferência */}
                          {email && (
                            <button type="button" onClick={() => { navigator.clipboard.writeText(email); toast.success('E-mail copiado') }}
                              aria-label="Copiar e-mail" className="shrink-0 text-white/25 hover:text-white/60 transition-colors">
                              <Copy size={11} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Phone size={12} className="shrink-0 text-white/25" aria-hidden="true" />
                          <span className="text-white/70">{phone ?? '—'}</span>
                          {phone && (
                            <>
                              {/* Botão copiar telefone */}
                              <button type="button" onClick={() => { navigator.clipboard.writeText(phone); toast.success('Telefone copiado') }}
                                aria-label="Copiar telefone" className="shrink-0 text-white/25 hover:text-white/60 transition-colors">
                                <Copy size={11} aria-hidden="true" />
                              </button>
                              {/* Link para abrir conversa no WhatsApp */}
                              {waHref && (
                                <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp"
                                  className="shrink-0 text-[#10B981] hover:text-[#34D399] transition-colors">
                                  <MessageCircle size={12} aria-hidden="true" />
                                </a>
                              )}
                            </>
                          )}
                        </div>
                        {/* CPF/CNPJ formatado automaticamente conforme o tamanho */}
                        {doc && (
                          <div className="sm:col-span-2 flex items-center gap-2 text-xs">
                            <Hash size={12} className="shrink-0 text-white/25" aria-hidden="true" />
                            <span className="text-white/40">CPF/CNPJ:</span>
                            <span className="font-mono text-white/70">{doc.length === 11
                              ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                              : doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* 2. Informações principais: cliente, título, categoria, status */}
                <div className="sm:col-span-2 rounded-2xl border border-white/[0.08] p-4">
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-white/70">
                    <FileText size={13} aria-hidden="true" />Informações principais
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">

                {/* Campo cliente com autocomplete — busca por nome, e-mail ou empresa */}
                <div className="relative" ref={clientSearchRef}>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Cliente *</label>
                  <input
                    type="text"
                    placeholder="Digite nome, e-mail ou empresa..."
                    value={clientSearch}
                    autoComplete="off"
                    onChange={e => {
                      setClientSearch(e.target.value)
                      setShowSuggestions(true)
                      // Limpa client_id se o campo for apagado
                      if (!e.target.value) setForm(f => ({ ...f, client_id: '' }))
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
                  />
                  {/* Badge confirmando qual cliente está selecionado */}
                  {form.client_id && clientsMap[form.client_id] && (
                    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-[#005BFF]/10 px-2.5 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                      <span className="text-xs font-semibold text-[#60A5FA] truncate">
                        {clientsMap[form.client_id].full_name ?? clientsMap[form.client_id].email}
                      </span>
                      {/* Botão para limpar a seleção */}
                      <button type="button" onClick={() => { setForm(f => ({ ...f, client_id: '' })); setClientSearch('') }}
                        className="ml-auto text-white/30 hover:text-white/70 transition-colors">
                        <X size={11} />
                      </button>
                    </div>
                  )}
                  {/* Lista de sugestões filtrada — no máximo 6 resultados */}
                  {showSuggestions && clientSearch.length >= 1 && (() => {
                    const q = clientSearch.toLowerCase()
                    const matches = Object.values(clientsMap).filter(c =>
                      (c.full_name  ?? '').toLowerCase().includes(q) ||
                      (c.email      ?? '').toLowerCase().includes(q) ||
                      (c.company_name ?? '').toLowerCase().includes(q)
                    ).slice(0, 6)
                    if (matches.length === 0) return (
                      <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 py-2.5 text-xs text-white/30">
                        Nenhum cliente encontrado
                      </div>
                    )
                    return (
                      <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#0D1428] shadow-[0_12px_40px_rgba(0,0,0,0.40)]">
                        {matches.map(c => (
                          <li key={c.id}>
                            <button type="button"
                              onClick={() => {
                                // Ao selecionar, guarda o ID e preenche o campo de busca
                                setForm(f => ({ ...f, client_id: c.id }))
                                setClientSearch(c.full_name ?? c.email ?? '')
                                setShowSuggestions(false)
                              }}
                              className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]">
                              <span className="text-sm font-semibold text-white">{c.full_name ?? c.email}</span>
                              <span className="text-[10px] text-white/35">
                                {c.email}{c.company_name ? ` · ${c.company_name}` : ''}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  })()}
                </div>

                {/* Título do projeto */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Título *</label>
                  <input type="text" placeholder="Nome do projeto" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" required />
                </div>

                {/* Categoria do projeto */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Categoria</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50">
                    <option value="">Selecionar</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Status do projeto */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50">
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                  </div>
                </div>

                {/* 3. Cronograma: slider de progresso e data limite */}
                <div className="sm:col-span-2 rounded-2xl border border-white/[0.08] p-4">
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-white/70">
                    <TrendingUp size={13} aria-hidden="true" />Cronograma
                  </p>

                  {/* Slider de progresso de 0 a 100% com passo de 5 */}
                  <div className="mb-1.5 flex items-end justify-between">
                    <span className="text-xs font-semibold text-white/60">Progresso do projeto</span>
                    <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{form.progress}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={5} value={form.progress}
                    onChange={e => setForm(f => ({ ...f, progress: Number(e.target.value) }))}
                    className="w-full accent-[#005BFF]" />
                  <div className="mt-1 flex justify-between text-[10px] text-white/25">
                    {[0, 25, 50, 75, 100].map(m => <span key={m}>{m}%</span>)}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {/* Campo de data limite */}
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-white/60">Prazo (data limite)</label>
                      <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                        className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50 [color-scheme:dark]" />
                    </div>
                    {/* Badge dinâmico de status do prazo (dentro do prazo, próximo, vencido) */}
                    <div className="flex items-end">
                      {(() => {
                        const badge = getDeadlineBadge(form.deadline)
                        return (
                          <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: `${badge.color}18`, color: badge.color }}>
                            {badge.label}
                          </span>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Alerta vermelho se o prazo já passou */}
                  {isDeadlineOverdue(form.deadline) && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3.5 py-2.5 text-xs text-red-400">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <div>
                        <p className="font-bold">Prazo vencido</p>
                        <p className="text-red-400/80">O prazo definido já passou. Atualize a data limite ou revise o progresso.</p>
                      </div>
                    </div>
                  )}
                  {/* Alerta amarelo se o progresso não bate com o status (ex: 0% + concluído) */}
                  {(() => {
                    const w = getProgressStatusWarning(form.status, Number(form.progress))
                    if (!w) return null
                    return (
                      <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.06] px-3.5 py-2.5 text-xs text-[#FBBF24]">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                        {w}
                      </div>
                    )
                  })()}
                </div>

                {/* 4. Seletor de prioridade e opção de visibilidade para o cliente */}
                <div className="sm:col-span-2 rounded-2xl border border-white/[0.08] p-4">
                  <p className="mb-3 text-xs font-bold text-white/70">Prioridade</p>
                  <div className="flex gap-2">
                    {PRIORITY_OPTIONS.map(p => (
                      <button key={p.value} type="button" aria-pressed={form.priority === p.value}
                        onClick={() => setForm(f => ({ ...f, priority: p.value }))}
                        className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all"
                        style={form.priority === p.value
                          ? { background: `linear-gradient(135deg, ${p.color}, ${p.color}CC)`, color: '#fff' }
                          : { border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {/* Checkbox para exibir ou ocultar a prioridade no dashboard do cliente */}
                  <label className="mt-3 flex items-center gap-2.5 text-xs font-medium text-white/60">
                    <input type="checkbox" checked={form.client_progress.priorityVisibleToClient ?? false}
                      onChange={e => setForm(f => ({ ...f, client_progress: { ...f.client_progress, priorityVisibleToClient: e.target.checked } }))}
                      className="h-4 w-4 accent-[#005BFF]" />
                    Mostrar prioridade para o cliente
                  </label>
                </div>

                {/* 4b. Pagamento com créditos — leader-only (trigger
                    client_projects_prevent_credit_cost_escalation garante
                    isso no banco também, não só aqui). */}
                {isLeader && (
                  <div className="sm:col-span-2 rounded-2xl border border-[#FBBF24]/20 bg-[#FBBF24]/[0.04] p-4">
                    {/* Ativa ou desativa a opção de o cliente pagar com créditos */}
                    <label className="flex items-center gap-2.5 text-xs font-bold text-white/70">
                      <input type="checkbox" checked={form.allow_credit_payment}
                        onChange={e => setForm(f => ({ ...f, allow_credit_payment: e.target.checked }))}
                        className="h-4 w-4 accent-[#FBBF24]" />
                      Permitir pagamento deste projeto com créditos
                    </label>
                    {form.allow_credit_payment && (
                      <div className="mt-3 max-w-xs">
                        <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="project-credit-cost">
                          Custo em créditos <span className="text-[#FBBF24]">*</span>
                        </label>
                        {/* Aceita apenas números — valor em créditos (não BRL) */}
                        <input
                          id="project-credit-cost"
                          type="text"
                          inputMode="numeric"
                          placeholder="Ex: 300"
                          value={form.credit_cost}
                          onChange={e => setForm(f => ({ ...f, credit_cost: e.target.value.replace(/[^0-9]/g, '') }))}
                          className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#FBBF24]/50"
                        />
                        {/* Indica se o projeto já foi pago via créditos (estado final, não editável aqui) */}
                        {form.credit_payment_status === 'pago' && (
                          <p className="mt-1.5 text-[11px] font-semibold text-[#34D399]">Já pago com créditos pelo cliente.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 5. Descrição do projeto (até 800 chars, com contador) */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-white/60">Descrição</label>
                  <textarea rows={3} maxLength={800} placeholder="Descreva o objetivo do projeto, o problema que será resolvido e o resultado esperado."
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
                  {/* Contador muda de cor quando próximo do limite */}
                  <p className={`mt-1 text-right text-[10px] ${form.description.length > 500 ? 'text-[#F59E0B]' : 'text-white/25'}`}>
                    {form.description.length}/500
                  </p>
                </div>

                {/* 6. Atualização para o cliente: templates rápidos + checker de qualidade */}
                <div className="sm:col-span-2 rounded-2xl border border-white/[0.08] p-4">
                  <label className="mb-0.5 block text-xs font-bold text-white/70">Atualização para o cliente</label>
                  <p className="mb-3 text-[11px] text-white/35">Escreva uma atualização clara que será exibida para seu cliente no dashboard.</p>

                  {/* Botões de template para preenchimento rápido do campo de notas */}
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {NOTE_TEMPLATES.map(t => (
                      <button key={t.label} type="button"
                        onClick={() => setForm(f => ({ ...f, notes: t.text }))}
                        className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 transition-colors hover:border-[#005BFF]/40 hover:text-[#60A5FA]">
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <textarea rows={3} maxLength={800} placeholder="Ex: Finalizamos a etapa de design. Iniciando desenvolvimento..." value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-[10px] text-white/25">Seja claro, objetivo e informe o próximo passo.</p>
                    <p className={`text-[10px] ${form.notes.length > 500 ? 'text-[#F59E0B]' : 'text-white/25'}`}>{form.notes.length}/500</p>
                  </div>

                  {/* Checklist de qualidade: verifica se a atualização segue boas práticas */}
                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/25">Clareza da atualização</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {getUpdateQualityChecks(form.notes).map(check => (
                        <div key={check.label} className="flex items-center gap-1.5 text-[11px]">
                          {check.ok
                            ? <CheckCircle size={12} className="shrink-0 text-[#10B981]" aria-hidden="true" />
                            : <AlertTriangle size={12} className="shrink-0 text-[#F59E0B]" aria-hidden="true" />}
                          <span className={check.ok ? 'text-white/60' : 'text-white/35'}>{check.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
              )}

              {/* ── ABA: ACOMPANHAMENTO — editor de progresso por fases, marco, resumo executivo */}
              {formTab === 'acompanhamento' && (
                <div className="sm:col-span-2 space-y-3">
                  <ProjectClientProgressEditor
                    value={form.client_progress}
                    onChange={(next) => setForm(f => ({ ...f, client_progress: next }))}
                    deadline={form.deadline}
                    status={form.status}
                    progress={Number(form.progress)}
                  />
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.05] transition-colors">
                    <input
                      type="checkbox"
                      checked={notifyClient}
                      onChange={e => setNotifyClient(e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-white/20 accent-[#005BFF]"
                    />
                    <div>
                      <p className="text-xs font-semibold text-white/80">Notificar cliente ao salvar</p>
                      <p className="text-[10px] text-white/35">Envia e-mail e WhatsApp com resumo da atualização</p>
                    </div>
                  </label>
                </div>
              )}

              {/* ── ABA: SEGURANÇA & EXTRAS — módulos de segurança do projeto */}
              {formTab === 'seguranca' && (
                <div className="sm:col-span-2">
                  <ProjectSecurityModulesEditor
                    value={form.client_progress}
                    onChange={(next) => setForm(f => ({ ...f, client_progress: next }))}
                  />
                </div>
              )}

              {/* ── ABA: VISUAL — upload e gestão de materiais visuais do projeto */}
              {formTab === 'visual' && (
                <div className="sm:col-span-2">
                  <ProjectVisualCenter
                    value={form.client_progress}
                    onChange={(next) => setForm(f => ({ ...f, client_progress: next }))}
                  />
                </div>
              )}

              {/* ── ABA: PRÉVIA — renderiza como o cliente verá o projeto */}
              {formTab === 'previa' && (
                // Oculta em XL quando a prévia lateral já está visível para evitar duplicação
                <div className={`sm:col-span-2 ${showSidebarPreview ? 'xl:hidden' : ''}`}>
                  <ProjectLivePreview
                    variant="full"
                    title={form.title}
                    status={form.status}
                    progress={Number(form.progress)}
                    deadline={form.deadline}
                    description={form.description}
                    value={form.client_progress}
                  />
                </div>
              )}
              {/* Em telas grandes com sidebar ativa, redireciona o olhar para a coluna lateral */}
              {formTab === 'previa' && showSidebarPreview && (
                <div className="hidden sm:col-span-2 xl:block">
                  <p className="text-xs text-white/30">A prévia completa aparece na coluna lateral em telas grandes →</p>
                </div>
              )}

                {/* Mensagem de erro de validação do formulário */}
                {error && <p role="alert" className="sm:col-span-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">{error}</p>}

              </form>
              </div>

              {/* Prévia lateral fixa no desktop (sticky) — exibe versão compacta para o técnico */}
              {showSidebarPreview && (
                <aside className="hidden xl:block">
                  <div className="xl:sticky xl:top-6">
                    <ProjectLivePreview
                      variant="compact"
                      title={form.title}
                      status={form.status}
                      progress={Number(form.progress)}
                      deadline={form.deadline}
                      description={form.description}
                      value={form.client_progress}
                      onViewFullPreview={() => setFormTab('previa')}
                      onViewSecurityExtras={() => setFormTab('seguranca')}
                    />
                  </div>
                </aside>
              )}
              </div>

              {/* Rodapé fixo do formulário: cancelar, rascunho, publicar */}
              <div className="sticky bottom-0 flex flex-col gap-3 border-t border-white/[0.08] bg-[#0D1428]/95 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-white/30">
                  {saving ? 'Salvando alterações...' : 'Todas as alterações são salvas ao clicar em Atualizar projeto.'}
                </p>
                <div className="flex flex-wrap gap-3">
                  {/* Cancela sem salvar */}
                  <button type="button" onClick={() => setShowForm(false)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/50 hover:text-white transition-colors">
                    Cancelar
                  </button>
                  {/* Salva rascunho — persiste mas sem mensagem de publicação */}
                  <button type="button" disabled={saving} onClick={() => handleSave(undefined, 'draft')}
                    className="rounded-xl border border-white/[0.10] px-5 py-2.5 text-sm font-semibold text-white/60 transition-colors hover:text-white disabled:opacity-50">
                    Salvar rascunho
                  </button>
                  {/* Publica o projeto — as alterações ficam visíveis para o cliente */}
                  <button type="button" disabled={saving} onClick={() => handleSave(undefined, 'publish')}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow transition-all hover:-translate-y-0.5 disabled:opacity-60">
                    {saving ? <><Loader2 size={14} className="animate-spin" />Salvando...</> : <><Save size={14} />{editingId ? 'Atualizar projeto' : 'Criar projeto'}</>}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lista de projetos: skeleton durante carregamento, empty state ou cards */}
        {projects.length === 0 ? (
          loading ? (
            // Skeleton de carregamento: 3 linhas animadas
            <div className="space-y-3">
              {[1,2,3].map(k => (
                <div key={k} className="h-20 animate-pulse rounded-2xl bg-white/[0.04]" />
              ))}
            </div>
          ) : (
            // Estado vazio: sem projetos cadastrados
            <div className="rounded-2xl border border-white/[0.06] p-12 text-center">
              <FolderKanban size={32} className="mx-auto mb-3 text-white/20" />
              <p className="text-sm text-white/30">Nenhum projeto ainda. Clique em &quot;Adicionar projeto&quot;.</p>
            </div>
          )
        ) : (
          // Renderiza um card por projeto com todas as ações disponíveis
          <div className="space-y-3">
            {projects.map((p, i) => (
              <ProjectClientCard
                key={p.id}
                project={p}
                index={i}
                fallbackClient={clientInfo(p.client_id)}   // Dados do cliente para exibição
                projectTeam={team[p.id] ?? []}              // Membros da equipe deste projeto
                techMap={techMap}                           // Mapa de técnicos para lookup por ID
                technicians={technicians}                   // Lista completa para adicionar ao projeto
                currentUserId={user.id}                     // Para distinguir ações do técnico logado
                accepting={accepting}                       // ID do projeto em aceite (loading)
                addTechFor={addTechFor}                     // Controla menu de adicionar técnico
                deleting={deleting}                         // ID sendo excluído
                onAccept={handleAccept}
                onToggleAddTechMenu={(projectId) => setAddTechFor(addTechFor === projectId ? null : projectId)}
                onAddTechnician={handleAddTechnician}
                onAcceptInvite={handleAcceptInvite}
                onDeclineInvite={handleDeclineInvite}
                onRemoveTechnician={handleRemoveTechnician}
                onEdit={openEdit}
                onRequestDelete={setConfirmDel}
              />
            ))}
          </div>
        )}
      </div>
    </AdminShell>

    {/* Modal de confirmação antes de excluir projeto permanentemente */}
    <ConfirmDialog
      open={!!confirmDel}
      onOpenChange={(open) => !open && setConfirmDel(null)}
      icon={Trash2}
      title="Excluir projeto?"
      description={
        <>&quot;<span className="text-white/80">{projects.find(p => p.id === confirmDel)?.title}</span>&quot; será removido permanentemente.</>
      }
      confirmLabel={<><Trash2 size={15} />Sim, excluir</>}
      confirmingLabel="Excluindo..."
      busy={!!deleting}
      onConfirm={() => confirmDel && handleDelete(confirmDel)}
    />
    </>
  )
}
