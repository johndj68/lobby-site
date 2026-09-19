'use client'

// Página de projetos do dashboard.
// Divide-se em duas seções:
// 1. "Meus projetos" — projetos reais do cliente gerenciados pelo técnico
// 2. "Cases da LOBBY" — portfólio público de cases do estúdio (dados estáticos)

import { useState, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  ArrowRight, FolderKanban, Rocket, Sparkles,
  ChevronDown, CheckCircle2, Plus, CheckCircle,
  X, Loader2, Send,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import ProjectMockup from '@/components/cards/ProjectMockup'
import { projects } from '@/lib/data'
import { createClient } from '@/lib/supabase'
import { STATUS_CFG, DEFAULT_STATUS_CFG } from '@/lib/project-status'
import { useCrudModal } from '@/hooks/useCrudModal'
import type { ClientProject } from '@/types'
import { CATEGORY_STYLE } from '@/lib/categories'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ── Props recebidas do Server Component (page.tsx) ─────────── */
interface Props {
  user:           SupabaseUser
  profile:        { full_name?: string; company_name?: string; phone?: string; document?: string } | null
  clientProjects: ClientProject[] // projetos reais do cliente vindos do banco
}

// Alias para o status padrão quando o status do banco não tem config
const DEFAULT_STATUS = DEFAULT_STATUS_CFG

/* ── Formata tempo relativo em português ──────────────────────── */
function timeFromNow(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return '1 dia atrás'
  if (days < 30)  return `${days} dias atrás`
  if (days < 365) return `${Math.floor(days / 30)} meses atrás`
  return `${Math.floor(days / 365)} ano(s) atrás`
}

/* ── Dados estáticos dos cases do portfólio ─────────────────── */

/* Mapeamento estático de status por id de case do portfólio.
   Estes são os cases da LOBBY (não projetos do cliente) —
   o status aqui é visual, não vem do banco. */
const PROJECT_STATUS: Record<string, string> = {
  '1': 'Concluído',
  '2': 'Em andamento',
  '3': 'Em andamento',
  '4': 'Planejamento',
  '5': 'Concluído',
  '6': 'Planejamento',
}

/* Contagens derivadas do array `projects` (portfólio de cases da LOBBY) —
   calculadas dinamicamente para bater com o que a grade abaixo mostra,
   evitando valores hardcoded que ficam defasados se novos cases forem adicionados. */
const projectsInProgress = projects.filter(p => PROJECT_STATUS[p.id] === 'Em andamento').length
const projectsDelivered  = projects.filter(p => PROJECT_STATUS[p.id] === 'Concluído').length
const projectsPlanned    = projects.filter(p => PROJECT_STATUS[p.id] === 'Planejamento').length

/* Cards de métricas do portfólio: Em andamento / Entregues / Planejamento */
const METRIC_CARDS = [
  { icon: FolderKanban, title: 'Em andamento',  value: String(projectsInProgress), desc: 'Cases da LOBBY em execução',      gradFrom: '#005BFF', gradTo: '#00A3FF', color: '#005BFF' },
  { icon: Rocket,       title: 'Entregues',     value: String(projectsDelivered),  desc: 'Cases já concluídos',              gradFrom: '#10B981', gradTo: '#059669', color: '#10B981' },
  { icon: Sparkles,     title: 'Planejamento',  value: String(projectsPlanned),    desc: 'Cases em fase de planejamento',    gradFrom: '#7B2CFF', gradTo: '#005BFF', color: '#7B2CFF' },
]

/* Opções do filtro de status dos cases (inclui contagem para o badge) */
const STATUS_FILTERS = [
  { label: 'Todos',        count: projects.length },
  { label: 'Em andamento', count: projectsInProgress },
  { label: 'Concluídos',   count: projectsDelivered },
  { label: 'Planejamento', count: projectsPlanned },
]

// Categorias disponíveis para filtro dos cases
const CATEGORIES = ['Todas', 'Software', 'Automação', 'Dados', 'Cibersegurança']

/* Classes Tailwind para o badge de status dos cases do portfólio —
   cada status tem cor e borda específicas. */
const STATUS_BADGE: Record<string, string> = {
  'Concluído':    'bg-[#10B981]/10 text-[#059669] border border-[#10B981]/25',
  'Em andamento': 'bg-[#005BFF]/10 text-[#005BFF] border border-[#005BFF]/25',
  'Em validação': 'bg-[#7B2CFF]/10 text-[#7B2CFF] border border-[#7B2CFF]/25',
  'Planejamento': 'bg-[#F59E0B]/10 text-[#B45309] border border-[#F59E0B]/25',
}

/* ── Configuração do modal de solicitação de projeto ────────── */

// Categorias do formulário de solicitação (subconjunto das categorias do filtro)
const CATEGORIES_FORM = ['Software', 'Automação', 'Dados', 'Cibersegurança']

// Valor inicial vazio do formulário de solicitação
const EMPTY_FORM = { title: '', description: '', category: '', name: '', email: '', company: '', phone: '', document: '' }

/* Formata CPF ou CNPJ enquanto o usuário digita.
   CPF: 000.000.000-00 | CNPJ: 00.000.000/0000-00 */
function formatDoc(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  return d.slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export default function ProjetosClient({ user, profile, clientProjects: initialProjects }: Props) {
  // Filtros ativos para os cases do portfólio
  const [activeStatus,   setActiveStatus]   = useState('Todos')
  const [activeCategory, setActiveCategory] = useState('Todas')

  // Estado local para projetos do cliente — permite inserção otimista após solicitação
  const [myProjects, setMyProjects] = useState<ClientProject[]>(initialProjects)

  // Estado e handlers do modal de solicitação via useCrudModal hook
  const {
    showForm, setShowForm, form, setForm,
    saving: submitting, setSaving: setSubmitting,
    error: formError, setError: setFormError,
    saved: formOk, setSaved: setFormOk,
  } = useCrudModal(EMPTY_FORM)

  // Referência estável ao cliente Supabase — evita recriar a cada render
  const sbRef = useRef(createClient())

  /* ── Abre o modal de solicitação ─────────────────────────────
     Pré-preenche com dados da prop profile (vindo do servidor)
     e depois busca dados frescos do banco para sobrescrever, caso
     o usuário tenha atualizado o perfil em outra aba. */
  const openModal = async () => {
    // Pré-preenche com server prop enquanto busca dado fresco
    setForm({
      ...EMPTY_FORM,
      name:     profile?.full_name    ?? '',
      email:    user.email            ?? '',
      company:  profile?.company_name ?? '',
      phone:    profile?.phone        ?? '',
      document: profile?.document ? formatDoc(profile.document) : '',
    })
    setFormError(''); setFormOk(false); setShowForm(true)

    // Busca perfil fresco direto do banco para garantir dados atualizados
    const { data } = await sbRef.current
      .from('profiles')
      .select('full_name, company_name, phone, document')
      .eq('id', user.id)
      .single()

    if (data) {
      const p = data as { full_name?: string; company_name?: string; phone?: string; document?: string }
      // Merge: mantém o que o usuário já digitou se o banco não tiver dado mais recente
      setForm(f => ({
        ...f,
        name:     p.full_name    || f.name,
        email:    user.email     || f.email,
        company:  p.company_name || f.company,
        phone:    p.phone        || f.phone,
        document: p.document ? formatDoc(p.document) : f.document,
      }))
    }
  }

  /* ── Submissão do formulário de solicitação ──────────────────
     1. Valida campos obrigatórios
     2. Atualiza o perfil do usuário (upsert) para manter dados atualizados
     3. Insere o projeto em client_projects com status 'solicitado'
     4. Adiciona o projeto ao estado local de forma otimista
     5. Fecha o modal após 1.8s mostrando tela de sucesso */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Validações em sequência — mostra o primeiro erro encontrado
    if (!form.name.trim())     { setFormError('Informe seu nome.');                    return }
    if (!form.email.trim())    { setFormError('Informe seu e-mail.');                  return }
    if (!form.phone.trim())    { setFormError('Informe seu telefone/WhatsApp.');       return }
    if (!form.company.trim())  { setFormError('Informe o nome da empresa.');           return }
    if (!form.document.trim()) { setFormError('Informe seu CPF ou CNPJ.');             return }
    const docDigits = form.document.replace(/\D/g, '')
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      setFormError('CPF deve ter 11 dígitos e CNPJ 14 dígitos.'); return
    }
    if (!form.title.trim())    { setFormError('Informe o título do projeto.');         return }
    setSubmitting(true); setFormError('')
    try {
      const sb = sbRef.current

      // Atualiza perfil do usuário com os dados do formulário
      await sb.from('profiles').upsert({
        id:           user.id,
        full_name:    form.name.trim(),
        company_name: form.company.trim()  || null,
        phone:        form.phone.trim()    || null,
        document:     docDigits,
      }, { onConflict: 'id' })

      // Insere o projeto com dados do cliente embutidos no registro —
      // o técnico lê esses dados direto sem precisar fazer JOIN com profiles
      const { data, error } = await sb
        .from('client_projects')
        .insert({
          client_id:       user.id,
          title:           form.title.trim(),
          description:     form.description || null,
          category:        form.category    || null,
          status:          'solicitado',
          progress:        0,
          priority:        'normal',
          updated_at:      new Date().toISOString(),
          // Dados do cliente embutidos — técnico lê sem depender de join
          client_name:     form.name.trim()    || null,
          client_email:    form.email.trim()   || null,
          client_phone:    form.phone.trim()   || null,
          client_company:  form.company.trim() || null,
          client_document: docDigits           || null,
        })
        .select('*')
        .single()
      if (error) throw error
      // Insere o novo projeto no início da lista (otimistic update)
      setMyProjects(prev => [data as ClientProject, ...prev])
      setFormOk(true)
      // Fecha o modal após 1.8s para o cliente ver a confirmação de sucesso
      setTimeout(() => setShowForm(false), 1800)
    } catch { setFormError('Erro ao enviar. Tente novamente.') } finally { setSubmitting(false) }
  }

  /* ── Filtragem dos cases do portfólio ────────────────────────
     Aplica filtro de status E categoria simultaneamente.
     "Concluídos" (plural no UI) mapeia para "Concluído" (singular no dado). */
  const filteredProjects = projects.filter(p => {
    const status = PROJECT_STATUS[p.id] ?? 'Concluído'
    const normalizedFilter = activeStatus === 'Concluídos' ? 'Concluído' : activeStatus
    const statusMatch   = normalizedFilter === 'Todos' || status === normalizedFilter
    const categoryMatch = activeCategory === 'Todas'  || p.category === activeCategory
    return statusMatch && categoryMatch
  })

  return (
    <>
    <div className="space-y-8">

        {/* ── MEUS PROJETOS (projetos reais do cliente) ────────────
             Seção personalizada: exibe projetos atribuídos pelo técnico
             via painel admin. Vazio → CTA para solicitar o primeiro. */}
        <section aria-label="Meus projetos">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Meus projetos
              </h2>
              <p className="mt-0.5 text-sm text-[#5D6475]">
                Acompanhe o desenvolvimento e status das suas soluções.
              </p>
            </div>
            {/* Botão de solicitar projeto no canto superior direito */}
            <button type="button" onClick={openModal}
              className="group inline-flex items-center gap-1.5 rounded-xl border border-[#E3E7F0] bg-white px-4 py-2 text-xs font-semibold text-[#005BFF] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#005BFF]/30">
              <Plus size={13} aria-hidden="true" />
              Solicitar projeto
            </button>
          </div>

          {myProjects.length === 0 ? (
            /* ── Estado vazio: nenhum projeto cadastrado ainda ── */
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-5 rounded-3xl border border-dashed border-[#E3E7F0] bg-white/60 px-6 py-12 text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.08), rgba(123,44,255,0.08))' }}>
                <FolderKanban size={28} style={{ color: '#005BFF' }} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  Você ainda não tem projetos em andamento
                </h3>
                <p className="mt-1.5 max-w-sm text-sm text-[#5D6475]">
                  Solicite uma solução e nossa equipe criará um projeto personalizado para o seu negócio.
                </p>
              </div>
              <button type="button" onClick={openModal}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.22)] transition-all hover:-translate-y-0.5">
                <Plus size={15} aria-hidden="true" />
                Solicitar meu primeiro projeto
              </button>
            </motion.div>
          ) : (
            /* ── Cards dos projetos reais do cliente ── */
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {myProjects.map((proj, i) => {
                // cfg contém label, cor, fundo e ícone de status vindos de STATUS_CFG
                const cfg = STATUS_CFG[proj.status] ?? DEFAULT_STATUS
                const StatusIcon = cfg.icon
                return (
                  <motion.article
                    key={proj.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white shadow-[0_8px_40px_rgba(11,16,32,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(0,91,255,0.08)]"
                  >
                    {/* Faixa de cor no topo do card derivada do status */}
                    <div className="h-1 w-full" style={{ background: `linear-gradient(to right, ${cfg.color}, ${cfg.color}66)` }} />

                    <div className="p-5">
                      {/* Cabeçalho: status, prioridade, título, categoria e % concluído */}
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            {/* Badge de status com ícone e cores dinâmicos */}
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold"
                              style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
                            >
                              <StatusIcon size={10} aria-hidden="true" />
                              {cfg.label}
                            </span>
                            {/* Badge de prioridade alta — só exibido quando necessário */}
                            {proj.priority === 'alta' && (
                              <span className="rounded-full border border-[#EF4444]/25 bg-[#EF4444]/10 px-2 py-0.5 text-[10px] font-bold text-[#EF4444]">
                                Prioridade alta
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold leading-snug text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                            {proj.title}
                          </h3>
                          {/* Categoria do projeto em azul */}
                          {proj.category && (
                            <p className="mt-0.5 text-xs text-[#005BFF]">{proj.category}</p>
                          )}
                        </div>
                        {/* Percentual de conclusão no canto direito */}
                        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                          <span className="text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                            {proj.progress}%
                          </span>
                          <span className="text-[10px] text-[#5D6475]">concluído</span>
                        </div>
                      </div>

                      {/* Descrição resumida (limitada a 2 linhas via line-clamp) */}
                      {proj.description && (
                        <p className="mb-4 text-xs leading-relaxed text-[#5D6475] line-clamp-2">
                          {proj.description}
                        </p>
                      )}

                      {/* Nota da equipe técnica (atualização textual do técnico) */}
                      {proj.notes && (
                        <div className="mb-4 rounded-xl border border-[#005BFF]/10 bg-[#005BFF]/[0.04] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#005BFF] mb-1">
                            Atualização da equipe
                          </p>
                          <p className="text-xs text-[#5D6475]">{proj.notes}</p>
                        </div>
                      )}

                      {/* Barra de progresso animada com cor do status */}
                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-[10px] text-[#5D6475]">
                          <span>Progresso do projeto</span>
                          {/* Prazo formatado em português, se definido pelo técnico */}
                          {proj.deadline && (
                            <span>Prazo: {new Date(proj.deadline).toLocaleDateString('pt-BR')}</span>
                          )}
                        </div>
                        <div className="relative h-2 overflow-hidden rounded-full bg-[#F7F8FC]">
                          {/* Barra animada: começa em 0 e vai até o progresso real */}
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${proj.progress}%` }}
                            transition={{ delay: 0.3 + i * 0.07, duration: 0.8 }}
                            className="absolute left-0 top-0 h-full rounded-full"
                            style={{ background: `linear-gradient(to right, ${cfg.color}, ${cfg.color}99)` }}
                          />
                        </div>
                      </div>

                      {/* Link para a página de acompanhamento detalhado do projeto */}
                      <Link href={`/dashboard/projetos/${proj.id}`}
                        className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-[#005BFF]/20 bg-[#005BFF]/[0.04] py-2.5 text-xs font-bold text-[#005BFF] transition-all hover:bg-[#005BFF]/[0.08]">
                        Ver acompanhamento completo
                        <ArrowRight size={12} aria-hidden="true" />
                      </Link>

                      {/* Rodapé do card: tempo da última atualização + link para o chat */}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-[#5D6475]">
                          Atualizado {timeFromNow(proj.updated_at)}
                        </span>
                        {/* Abre o chat só se já existe um técnico responsável
                            (lead_technician_id — setado quando um técnico
                            aceita o projeto em /admin/projetos-clientes).
                            Sem isso, avisa que ainda está em análise em vez
                            de levar pro /contato (formulário de lead, não
                            é o chat real do projeto). */}
                        {proj.lead_technician_id ? (
                          // Link direto para a thread do chat deste projeto
                          <Link href={`/dashboard/mensagens?project=${proj.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#005BFF] transition-all hover:gap-2">
                            Falar com equipe
                            <ArrowRight size={11} className="transition-transform" aria-hidden="true" />
                          </Link>
                        ) : (
                          // Botão informativo: projeto ainda sem técnico atribuído
                          <button
                            type="button"
                            onClick={() => toast.info('Seu projeto ainda está em análise. Assim que um técnico assumir a responsabilidade, você poderá conversar por aqui.')}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5D6475] transition-all hover:text-[#0B1020]"
                          >
                            Falar com equipe
                            <ArrowRight size={11} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.article>
                )
              })}
            </div>
          )}

          {/* Botão para solicitar mais um projeto (exibido quando já há projetos) */}
          {myProjects.length > 0 && (
            <button type="button" onClick={openModal}
              className="group mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E3E7F0] bg-white/60 px-6 py-4 text-sm font-semibold text-[#5D6475] transition-all hover:border-[#005BFF]/30 hover:text-[#005BFF]">
              <Plus size={16} aria-hidden="true" />
              Solicitar mais um projeto
            </button>
          )}
        </section>

        {/* ── HERO: TÍTULO E CTAs PRINCIPAIS ────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"
        >
          <div>
            <h1
              className="text-3xl font-bold tracking-tight text-[#0B1020]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Projetos da sua central LOBBY
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5D6475]">
              Acompanhe soluções em andamento, veja cases entregues e solicite novos projetos sob medida para sua operação.
            </p>
          </div>

          {/* Botões principais de ação */}
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            {/* CTA de solicitar projeto — abre o modal */}
            <button
              type="button"
              onClick={openModal}
              className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(123,44,255,0.28)]"
            >
              Solicitar novo projeto
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </button>
            {/* Alternativa: falar diretamente com um especialista */}
            <Link
              href="/contato"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white px-6 py-3 text-sm font-bold text-[#0B1020] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:text-[#005BFF]"
            >
              Falar com especialista
            </Link>
          </div>
        </motion.div>

        {/* ── INTRODUÇÃO DOS CASES DA LOBBY ─────────────────────── */}
        {/* Seção separada dos projetos do cliente — são cases do portfólio público */}
        <div>
          <h2 className="text-xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Cases entregues pela LOBBY
          </h2>
          <p className="mt-1 text-sm text-[#5D6475]">
            Conheça outras soluções que já construímos — filtre por status ou categoria.
          </p>
        </div>

        {/* ── CARDS DE MÉTRICAS DOS CASES ───────────────────────── */}
        {/* Grade de 3 contadores: Em andamento / Entregues / Planejamento */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Resumo dos cases da LOBBY">
          {METRIC_CARDS.map(({ icon: Icon, title, value, desc, gradFrom, gradTo, color }, i) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.07 }}
              role="listitem"
              className="group relative overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_18px_60px_rgba(11,16,32,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/25 hover:shadow-[0_24px_80px_rgba(0,91,255,0.12)]"
            >
              {/* Faixa de cor no topo */}
              <div
                className="absolute inset-x-0 top-0 h-0.5"
                style={{ background: `linear-gradient(to right, ${gradFrom}, ${gradTo})` }}
                aria-hidden="true"
              />
              {/* Ícone com fundo translúcido */}
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{ background: `linear-gradient(135deg, ${gradFrom}14, ${gradTo}14)` }}
              >
                <Icon size={20} style={{ color }} aria-hidden="true" />
              </div>
              <p className="text-xs font-medium text-[#5D6475]">{title}</p>
              <p
                className="my-1 text-3xl font-bold text-[#0B1020]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {value}
              </p>
              <p className="text-xs text-[#5D6475]">{desc}</p>
            </motion.article>
          ))}
        </div>

        {/* ── BARRA DE FILTROS ──────────────────────────────────────
            Linha com filtros de status (Todos / Em andamento / Concluídos / Planejamento)
            e filtros de categoria (Software / Automação / Dados / Cibersegurança). */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-3xl border border-[#E3E7F0] bg-white/90 p-4 shadow-sm"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            {/* Filtros de status com contagem no badge */}
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filtrar por status"
            >
              {STATUS_FILTERS.map(({ label, count }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveStatus(label)}
                  aria-pressed={activeStatus === label}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-150 ${
                    activeStatus === label
                      ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_12px_rgba(0,91,255,0.25)]'
                      : 'border border-[#E3E7F0] bg-white text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF]'
                  }`}
                >
                  {label}
                  {/* Badge de contagem com fundo diferente conforme estado ativo/inativo */}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      activeStatus === label ? 'bg-white/25 text-white' : 'bg-[#F7F8FC] text-[#5D6475]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* Filtros de categoria + botão de ordenação */}
            <div className="flex flex-wrap gap-2">
              {/* Toggle de categoria: clica novamente para desmarcar */}
              {CATEGORIES.filter(c => c !== 'Todas').map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(activeCategory === cat ? 'Todas' : cat)}
                  aria-pressed={activeCategory === cat}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all duration-150 ${
                    activeCategory === cat
                      ? 'bg-[#0B1020] text-white'
                      : 'border border-[#E3E7F0] bg-white text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF]'
                  }`}
                >
                  {cat}
                </button>
              ))}
              {/* Ordenação (visual apenas — sem lógica implementada) */}
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-[#E3E7F0] bg-white px-3 py-1 text-[11px] font-semibold text-[#5D6475] transition-all hover:border-[#005BFF]/30 hover:text-[#005BFF]"
              >
                Mais recentes
                <ChevronDown size={11} aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── GRADE DE CASES DO PORTFÓLIO ───────────────────────── */}
        {/* Cards dos cases filtrados — cada um com mockup visual, categoria,
            título, descrição, impacto e link para a página pública do case. */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          aria-label="Cases da LOBBY"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2
              className="text-xl font-bold text-[#0B1020]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Cases da LOBBY
              {/* Contador de resultados — visível quando há filtro ativo */}
              {filteredProjects.length !== projects.length && (
                <span className="ml-2 text-base font-normal text-[#5D6475]">
                  ({filteredProjects.length} encontrado{filteredProjects.length !== 1 ? 's' : ''})
                </span>
              )}
            </h2>
          </div>

          {filteredProjects.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project, i) => {
                const cat = project.category as string
                // Estilo visual da categoria (bg, text, border)
                const catStyle = CATEGORY_STYLE[cat] ?? CATEGORY_STYLE['Software']
                const status = PROJECT_STATUS[project.id] ?? 'Concluído'
                // Classes de badge de status estáticas para os cases do portfólio
                const statusClass = STATUS_BADGE[status] ?? STATUS_BADGE['Concluído']

                return (
                  <motion.article
                    key={project.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 + i * 0.06 }}
                    className="group overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 shadow-[0_18px_60px_rgba(11,16,32,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/25 hover:shadow-[0_24px_80px_rgba(0,91,255,0.12)]"
                  >
                    {/* Mockup visual do projeto com zoom suave no hover */}
                    <div className="relative h-44 overflow-hidden">
                      <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.03]">
                        <ProjectMockup slug={project.slug} category={cat} />
                      </div>
                    </div>

                    <div className="p-5">
                      {/* Badge de categoria com cor específica */}
                      <span
                        className="mb-3 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: catStyle.bg, color: catStyle.text, borderColor: catStyle.border }}
                      >
                        {cat}
                      </span>

                      <h3
                        className="mb-2 text-base font-bold leading-snug text-[#0B1020]"
                        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        {project.title}
                      </h3>

                      <p className="mb-3 text-xs leading-relaxed text-[#5D6475]">
                        {project.description}
                      </p>

                      {/* Resultado/impacto do projeto (opcional) */}
                      {project.impact && (
                        <p className="mb-4 text-xs font-semibold text-[#005BFF]">
                          📈 {project.impact}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        {/* Badge de status do case */}
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusClass}`}
                        >
                          {status}
                        </span>

                        {/* Link para a página pública detalhada do case */}
                        <Link
                          href={`/projetos/${project.slug}`}
                          className="group/link inline-flex items-center gap-1 text-xs font-bold text-[#005BFF] transition-all hover:gap-2"
                        >
                          Ver detalhes
                          <ArrowRight
                            size={12}
                            className="transition-transform group-hover/link:translate-x-1"
                            aria-hidden="true"
                          />
                        </Link>
                      </div>
                    </div>
                  </motion.article>
                )
              })}
            </div>
          ) : (
            /* Nenhum case encontrado com os filtros — oferece limpar tudo */
            <div className="rounded-3xl border border-[#E3E7F0] bg-white/90 p-10 text-center shadow-sm">
              <p className="text-sm font-medium text-[#5D6475]">
                Nenhum projeto encontrado com os filtros selecionados.
              </p>
              <button
                type="button"
                onClick={() => { setActiveStatus('Todos'); setActiveCategory('Todas') }}
                className="mt-3 text-sm font-bold text-[#005BFF] hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </motion.section>

        {/* ── CTA FINAL: SOLICITAR PROJETO ──────────────────────── */}
        {/* Banner de conversão para incentivar o cliente a solicitar
            um projeto personalizado com a equipe da LOBBY. */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_20px_70px_rgba(11,16,32,0.08)] sm:p-8"
          aria-label="Solicitar projeto"
        >
          {/* Gradientes decorativos de fundo */}
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{ background: 'radial-gradient(circle at 80% 50%,rgba(123,44,255,0.09) 0%,transparent 35%),radial-gradient(circle at 20% 80%,rgba(0,91,255,0.06) 0%,transparent 40%)' }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-[#7B2CFF]/6 blur-3xl" aria-hidden="true" />

          <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-5">
              {/* Ícone com gradiente lobby */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl lobby-gradient shadow-[0_8px_24px_rgba(0,91,255,0.28)]">
                <FolderKanban size={22} className="text-white" aria-hidden="true" />
              </div>
              <div>
                <h3
                  className="mb-1.5 text-lg font-bold text-[#0B1020]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Quer transformar um desafio em projeto?
                </h3>
                <p className="mb-4 max-w-lg text-sm text-[#5D6475]">
                  Conte para a LOBBY o que sua empresa precisa e receba uma proposta de solução sob medida para gerar resultados reais.
                </p>
                {/* Lista de benefícios da solicitação */}
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  {['Diagnóstico gratuito', 'Escopo inicial personalizado', 'Recomendação técnica'].map(b => (
                    <span key={b} className="flex items-center gap-1.5 text-xs font-medium text-[#0B1020]">
                      <CheckCircle2 size={12} className="text-[#10B981]" aria-hidden="true" />
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Botão de conversão — abre o modal de solicitação */}
            <button
              type="button"
              onClick={openModal}
              className="shrink-0 inline-flex items-center gap-2 rounded-2xl lobby-gradient px-6 py-3.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5 hover:opacity-90 hover:shadow-[0_12px_32px_rgba(0,91,255,0.38)]"
            >
              Solicitar projeto agora
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </motion.section>

      </div>

    {/* ── MODAL DE SOLICITAÇÃO DE PROJETO ──────────────────────────
        Dialog controlado por showForm. Não fecha durante envio
        para evitar perda de dados. Exibe tela de sucesso após envio. */}
    <Dialog open={showForm} onOpenChange={(next) => !next && !submitting && setShowForm(false)}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl overflow-y-auto max-h-[92vh] rounded-3xl border border-[#E3E7F0] bg-white p-8 shadow-[0_32px_80px_rgba(0,0,0,0.18)]"
      >
            {/* Cabeçalho do modal com título e botão de fechar */}
            <div className="mb-7 flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  Solicitar projeto
                </DialogTitle>
                <p className="mt-1 text-sm text-[#5D6475]">Preencha os dados abaixo para nossa equipe entrar em contato.</p>
              </div>
              {/* Botão de fechar — desabilitado durante envio */}
              <button type="button" disabled={submitting} onClick={() => setShowForm(false)}
                className="rounded-xl p-2 text-[#5D6475] hover:bg-[#F7F8FC] hover:text-[#0B1020] transition-colors">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {formOk ? (
              /* Tela de confirmação de sucesso após envio */
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]">
                  <CheckCircle size={34} className="text-white" />
                </div>
                <div>
                  <p className="text-xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    Projeto solicitado!
                  </p>
                  <p className="mt-1.5 text-sm text-[#5D6475]">Acompanhe o status aqui mesmo. Nossa equipe vai analisar em breve.</p>
                </div>
              </motion.div>
            ) : (
              /* Formulário de solicitação de projeto */
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Bloco de dados de contato (nome, email, telefone, empresa, CPF/CNPJ) */}
                <div className="rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC] px-5 py-4 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#5D6475]">Seus dados de contato</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-[#0B1020]">Nome <span className="text-[#005BFF]">*</span></label>
                      <input type="text" placeholder="Seu nome completo"
                        value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className="h-12 w-full rounded-xl border border-[#E3E7F0] bg-white px-4 text-[15px] text-[#0B1020] placeholder:text-[#5D6475]/40 outline-none focus:border-[#005BFF]/40 focus:ring-2 focus:ring-[#005BFF]/10 transition-all" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-[#0B1020]">E-mail <span className="text-[#005BFF]">*</span></label>
                      <input type="email" placeholder="seu@email.com"
                        value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        className="h-12 w-full rounded-xl border border-[#E3E7F0] bg-white px-4 text-[15px] text-[#0B1020] placeholder:text-[#5D6475]/40 outline-none focus:border-[#005BFF]/40 focus:ring-2 focus:ring-[#005BFF]/10 transition-all" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-[#0B1020]">Telefone / WhatsApp <span className="text-[#005BFF]">*</span></label>
                      <input type="tel" placeholder="(11) 99999-9999"
                        value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        className="h-12 w-full rounded-xl border border-[#E3E7F0] bg-white px-4 text-[15px] text-[#0B1020] placeholder:text-[#5D6475]/40 outline-none focus:border-[#005BFF]/40 focus:ring-2 focus:ring-[#005BFF]/10 transition-all" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-[#0B1020]">Empresa <span className="text-[#005BFF]">*</span></label>
                      <input type="text" placeholder="Nome da empresa"
                        value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                        className="h-12 w-full rounded-xl border border-[#E3E7F0] bg-white px-4 text-[15px] text-[#0B1020] placeholder:text-[#5D6475]/40 outline-none focus:border-[#005BFF]/40 focus:ring-2 focus:ring-[#005BFF]/10 transition-all" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-sm font-semibold text-[#0B1020]">CPF ou CNPJ <span className="text-[#005BFF]">*</span></label>
                      {/* Máscara aplicada via formatDoc durante onChange */}
                      <input type="text" inputMode="numeric" maxLength={18}
                        placeholder="000.000.000-00 ou 00.000.000/0000-00"
                        value={form.document} onChange={e => setForm(f => ({ ...f, document: formatDoc(e.target.value) }))}
                        className="h-12 w-full rounded-xl border border-[#E3E7F0] bg-white px-4 text-[15px] text-[#0B1020] placeholder:text-[#5D6475]/40 outline-none focus:border-[#005BFF]/40 focus:ring-2 focus:ring-[#005BFF]/10 transition-all" />
                    </div>
                  </div>
                </div>

                {/* Campo de título do projeto */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#0B1020]">
                    Título do projeto <span className="text-[#005BFF]">*</span>
                  </label>
                  <input type="text" placeholder="Ex: Plataforma de automação de relatórios"
                    value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="h-12 w-full rounded-2xl border border-[#E3E7F0] px-4 text-[15px] text-[#0B1020] placeholder:text-[#5D6475]/50 outline-none focus:border-[#005BFF]/40 focus:ring-4 focus:ring-[#005BFF]/10 transition-all" />
                </div>

                {/* Seleção de área de interesse (toggle — clica novamente para desmarcar) */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#0B1020]">Área de interesse</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES_FORM.map(c => (
                      <button key={c} type="button" aria-pressed={form.category === c}
                        onClick={() => setForm(f => ({ ...f, category: f.category === c ? '' : c }))}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${form.category === c ? 'border-transparent bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_4px_12px_rgba(0,91,255,0.2)]' : 'border-[#E3E7F0] text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF]'}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Descrição opcional do projeto */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#0B1020]">
                    Descreva o que você precisa <span className="text-[#5D6475] font-normal">(opcional)</span>
                  </label>
                  <textarea rows={4} placeholder="Contexto sobre sua empresa, desafio atual, resultado esperado..."
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full resize-none rounded-2xl border border-[#E3E7F0] px-4 py-3 text-[15px] text-[#0B1020] placeholder:text-[#5D6475]/50 outline-none focus:border-[#005BFF]/40 focus:ring-4 focus:ring-[#005BFF]/10 transition-all" />
                </div>

                {/* Mensagem de erro de validação ou falha de envio */}
                {formError && (
                  <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{formError}</p>
                )}

                {/* Botão de envio — mostra spinner durante submissão */}
                <button type="submit" disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-3.5 text-base font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.22)] transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0">
                  {submitting
                    ? <><Loader2 size={18} className="animate-spin" />Enviando...</>
                    : <><Send size={17} />Enviar solicitação</>}
                </button>
              </form>
            )}
      </DialogContent>
    </Dialog>
    </>
  )
}
