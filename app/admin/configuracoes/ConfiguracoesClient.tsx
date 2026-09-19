'use client'

// Componente cliente da página de Configurações do Admin.
// Permite ao técnico editar dados pessoais, visualizar segurança/permissões,
// ajustar preferências do painel e (se for líder) gerenciar modelos de resposta.

/* ── Imports ────────────────────────────────────────────────────── */
// Hook de estado do React
import { useState } from 'react'
// Biblioteca de animações: motion para transições e AnimatePresence para mount/unmount
import { motion, AnimatePresence } from 'framer-motion'
// Ícones do Lucide utilizados ao longo do componente
import {
  Loader2, User, Mail, Building2, CheckCircle, ShieldCheck,
  CheckCircle2, Headphones, ArrowRight, X, Crown,
  Mails, Plus, Pencil, Trash2, Check,
} from 'lucide-react'
// Layout administrativo compartilhado entre todas as páginas do admin
import AdminShell from '@/components/layout/AdminShell'
// Cliente do Supabase para operações de banco no lado cliente
import { createClient } from '@/lib/supabase'
// Server Actions para criação, edição e exclusão de modelos de resposta
import { createResponseTemplate, updateResponseTemplate, deleteResponseTemplate } from './template-actions'
// Tipos externos: usuário autenticado e modelo de resposta
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { ResponseTemplate } from '../solicitacoes/page'

/* ── Tipos e interfaces ─────────────────────────────────────────── */

// Props recebidas do Server Component pai
interface Props {
  user:      SupabaseUser                                                                          // Usuário autenticado
  profile:   { full_name?: string; company_name?: string; email?: string; is_leader?: boolean } | null  // Perfil do técnico
  templates: ResponseTemplate[]                                                                    // Modelos de resposta existentes (só para líderes)
}

/* ── Inline toggle (no shadcn Switch dependency) ────────────────── */
// Componente de toggle on/off acessível, sem dependência do shadcn/Switch.
// Usado nas preferências do painel.
function Toggle({ checked, onChange, id }: { checked: boolean; onChange: () => void; id: string }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={onChange}
      className={`inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BFF] ${
        checked ? 'bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]' : 'bg-white/[0.15]'
      }`}
    >
      {/* Bolinha deslizante do toggle */}
      <span
        aria-hidden="true"
        className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

/* ── Constantes estáticas ───────────────────────────────────────── */

// Itens de status de segurança exibidos no card de segurança
const SECURITY_ITEMS = [
  'E-mail verificado',
  'Sessão ativa',
  'Acesso técnico protegido',
  'Recuperação de senha disponível',
]

// Permissões disponíveis para o técnico (nível admin técnico)
const PERMISSIONS = [
  'Visualizar solicitações',
  'Gerenciar leads',
  'Enviar arquivos',
  'Exportar dados',
  'Acessar configurações',
]

// Opções de preferências do painel com suas chaves, títulos e descrições
const PREF_OPTIONS = [
  { key: 'notifSolic'  as const, title: 'Novas solicitações',        desc: 'Receba notificações de novas solicitações de clientes.' },
  { key: 'notifLeads'  as const, title: 'Alertas de novos leads',     desc: 'Receba alertas quando um usuário baixar um material.'   },
  { key: 'resumeCards' as const, title: 'Cards de resumo ao entrar',  desc: 'Mostrar os cards de resumo ao acessar o painel.'        },
  { key: 'compact'     as const, title: 'Modo compacto',              desc: 'Reduz o espaçamento para visualizar mais conteúdo.'     },
]

// Tipo das chaves de preferências para tipagem segura do estado
type PrefKey = 'notifSolic' | 'notifLeads' | 'resumeCards' | 'compact'

/* ── Component ──────────────────────────────────────────────────── */
export default function ConfiguracoesClient({ user, profile, templates }: Props) {

  /* ── Estado do formulário de dados pessoais ─────────────────── */

  // Campos do formulário de dados pessoais
  const [form, setForm] = useState({
    full_name:    profile?.full_name    || '',
    company_name: profile?.company_name || '',
  })

  // Estados de loading, sucesso e erro do formulário de dados pessoais
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState('')

  // Estado das preferências do painel (armazenado localmente, não no banco)
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    notifSolic:   true,
    notifLeads:   true,
    resumeCards:  true,
    compact:      false,
  })

  /* ── Estado dos modelos de resposta (líder) ─────────────────── */

  // Lista de modelos de resposta exibida na UI (sincronizada com banco)
  const [templateList, setTemplateList] = useState(templates)

  // Valores atuais do formulário de criação/edição de modelo
  const [tplForm,    setTplForm]    = useState({ title: '', subject: '', body: '' })

  // ID do modelo sendo editado (null = criando novo)
  const [editingId,  setEditingId]  = useState<string | null>(null)

  // Estados de loading e erro do formulário de modelos
  const [tplSaving,  setTplSaving]  = useState(false)
  const [tplError,   setTplError]   = useState('')

  // ID do modelo aguardando confirmação de exclusão (exibe botões de confirmar/cancelar)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ID do modelo sendo excluído (para mostrar spinner no item certo)
  const [deletingTplId,   setDeletingTplId]   = useState<string | null>(null)

  /* ── Funções auxiliares dos modelos ────────────────────────────── */

  // Limpa o formulário de modelo e sai do modo de edição
  const resetTplForm = () => { setTplForm({ title: '', subject: '', body: '' }); setEditingId(null) }

  // Pré-popula o formulário com os dados do modelo para edição
  const startEditTemplate = (t: ResponseTemplate) => {
    setEditingId(t.id)
    setTplForm({ title: t.title, subject: t.subject, body: t.body })
  }

  // Cria ou atualiza um modelo de resposta via Server Action
  const handleTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTplSaving(true)
    setTplError('')

    // Se editingId existe, atualiza; caso contrário, cria novo
    const result = editingId
      ? await updateResponseTemplate(editingId, tplForm)
      : await createResponseTemplate(tplForm)

    if (!result.success) {
      setTplError(result.error)
      setTplSaving(false)
      return
    }

    if (editingId) {
      // Atualiza o item na lista local com os novos valores
      setTemplateList(prev => prev.map(t => t.id === editingId ? { ...t, ...tplForm } : t))
    } else {
      // Adiciona o novo modelo à lista local com UUID temporário
      setTemplateList(prev => [...prev, { id: crypto.randomUUID(), ...tplForm }])
    }
    resetTplForm()
    setTplSaving(false)
  }

  // Exclui um modelo de resposta via Server Action e remove da lista local
  const handleDeleteTemplate = async (id: string) => {
    setDeletingTplId(id)
    const result = await deleteResponseTemplate(id)
    if (!result.success) {
      setTplError(result.error)
      setDeletingTplId(null)
      setConfirmDeleteId(null)
      return
    }
    // Remove o modelo da lista local após exclusão bem-sucedida
    setTemplateList(prev => prev.filter(t => t.id !== id))
    setDeletingTplId(null)
    setConfirmDeleteId(null)
  }

  /* ── Dados derivados do perfil ──────────────────────────────── */

  // Primeiro nome para exibição no avatar e saudação
  const firstName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Admin'

  // Inicial maiúscula para o avatar
  const initial   = firstName.charAt(0).toUpperCase()

  /* ── Submit dos dados pessoais ──────────────────────────────── */

  // Salva os dados pessoais (nome e empresa) na tabela profiles via upsert
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(''); setSuccess(false)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.from('profiles').upsert({
        id:           user.id,
        email:        user.email,
        full_name:    form.full_name,
        company_name: form.company_name,
        role:         'technician',
      })
      if (err) throw err
      setSuccess(true)
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <AdminShell user={user} profile={profile}>
      <div className="space-y-7">

        {/* ── PAGE HEADER ──────────────────────────────────────── */}
        {/* Título e subtítulo da página — animados na entrada com framer-motion */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Configurações
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/40">
            Gerencie seu perfil técnico, segurança e preferências do painel.
          </p>
        </motion.div>

        {/* ── PROFILE CARD ─────────────────────────────────────── */}
        {/* Card de identificação do técnico: avatar, nome, e-mail e métricas */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8"
          aria-label="Perfil técnico"
        >
          {/* Gradiente decorativo de fundo — dois focos de luz (azul e roxo) */}
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{ background: 'radial-gradient(circle at 85% 30%,rgba(123,44,255,0.14),transparent 35%),radial-gradient(circle at 15% 20%,rgba(0,91,255,0.10),transparent 35%)' }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Avatar com inicial e indicador de online */}
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                {/* Círculo com gradiente e inicial do técnico */}
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white shadow-[0_18px_50px_rgba(0,91,255,0.35)]"
                  style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
                >
                  {initial}
                </div>
                {/* Bolinha verde indicando sessão ativa */}
                <span
                  className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[#111827] bg-[#10B981]"
                  aria-label="Online"
                />
              </div>

              {/* Nome, badge de nível e e-mail do técnico */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {firstName}
                  </h2>
                  <span className="rounded-full bg-[#005BFF]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#60A5FA]">
                    Técnico LOBBY
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/50">{user.email}</p>
                <span className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#10B981]">
                  <span className="h-2 w-2 rounded-full bg-[#10B981]" aria-hidden="true" />
                  Online
                </span>
              </div>
            </div>

            {/* Meta stats: perfil, último acesso e nível de permissão */}
            <div className="grid grid-cols-3 gap-5">
              {[
                { label: 'Perfil',        value: 'Técnico'          },
                { label: 'Último acesso', value: 'Hoje, 10:24'      },
                { label: 'Permissão',     value: 'Admin. técnico'   },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</p>
                  <p className="mt-1 text-sm font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ── TWO-COLUMN GRID ──────────────────────────────────── */}
        {/* Layout de duas colunas: formulários à esquerda, cards informativos à direita.
            Em telas menores que xl, as colunas empilham verticalmente. */}
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">

          {/* ── LEFT COLUMN ──────────────────────────────────── */}
          {/* Coluna principal com card de conta, formulário de dados e banner de sucesso */}
          <div className="space-y-6">

            {/* Account card — exibe o e-mail de login (somente leitura) */}
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)] transition-all duration-300 hover:border-[#005BFF]/30"
            >
              <div className="flex items-start gap-4">
                {/* Ícone de e-mail com fundo azul translúcido */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#005BFF]/12">
                  <Mail size={20} className="text-[#60A5FA]" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      Conta
                    </h3>
                    {/* Badge "Verificado" — e-mail confirmado no Supabase Auth */}
                    <span className="shrink-0 rounded-full bg-[#10B981]/12 px-2.5 py-0.5 text-[10px] font-bold text-[#34D399]">
                      Verificado
                    </span>
                  </div>
                  <p className="mt-3 break-all text-sm font-semibold text-white">{user.email}</p>
                  <p className="mt-2 text-xs leading-relaxed text-white/40">
                    Este e-mail é usado para login e para o recebimento de notificações importantes.
                  </p>
                  {/* Link para solicitar troca de e-mail — ainda não implementado */}
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#60A5FA] transition-all hover:gap-2"
                  >
                    Solicitar alteração <ArrowRight size={11} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </motion.article>

            {/* Personal data form — edita nome completo e empresa */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
            >
              {/* Formulário de dados pessoais — chama handleSubmit ao enviar */}
              <form
                onSubmit={handleSubmit}
                className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)] sm:p-7"
              >
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    Dados pessoais
                  </h2>
                  <p className="mt-1 text-sm text-white/40">
                    Atualize suas informações pessoais e da sua equipe técnica.
                  </p>
                </div>

                <div className="space-y-5">
                  {/* Campo: Nome completo — atualiza form.full_name no onChange */}
                  <div>
                    <label htmlFor="cfg-name" className="mb-2 block text-sm font-semibold text-white/70">
                      Nome completo
                    </label>
                    <div className="relative">
                      <User
                        size={17}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#005BFF]/50"
                        aria-hidden="true"
                      />
                      <input
                        id="cfg-name"
                        placeholder="Seu nome completo"
                        value={form.full_name}
                        onChange={e => setForm({ ...form, full_name: e.target.value })}
                        className="h-14 w-full rounded-2xl border border-white/[0.10] bg-[#0F172A] pl-12 pr-4 text-sm text-white placeholder:text-white/20 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/10"
                      />
                    </div>
                  </div>

                  {/* Campo: Empresa ou equipe — atualiza form.company_name no onChange */}
                  <div>
                    <label htmlFor="cfg-company" className="mb-2 block text-sm font-semibold text-white/70">
                      Empresa / Equipe
                    </label>
                    <div className="relative">
                      <Building2
                        size={17}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#005BFF]/50"
                        aria-hidden="true"
                      />
                      <input
                        id="cfg-company"
                        placeholder="Ex: LOBBY — Equipe técnica"
                        value={form.company_name}
                        onChange={e => setForm({ ...form, company_name: e.target.value })}
                        className="h-14 w-full rounded-2xl border border-white/[0.10] bg-[#0F172A] pl-12 pr-4 text-sm text-white placeholder:text-white/20 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/10"
                      />
                    </div>
                  </div>
                </div>

                {/* Mensagem de erro ao salvar — exibida apenas quando `error` não está vazio */}
                {error && (
                  <div className="mt-5 flex items-center gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400" role="alert">
                    {error}
                  </div>
                )}

                {/* Botão de envio — desabilitado durante o loading; alterna ícone e texto */}
                <button
                  type="submit"
                  disabled={loading}
                  className="group mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(123,44,255,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    /* Estado de carregamento: spinner animado */
                    <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Salvando...</>
                  ) : (
                    /* Estado padrão: ícone de seta com animação no hover */
                    <>
                      Salvar alterações
                      <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>

            {/* Save success feedback — banner verde animado após salvar com sucesso.
                AnimatePresence garante que a saída do banner seja também animada. */}
            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="status"
                  className="flex items-center justify-between rounded-2xl border border-[#10B981]/25 bg-[#10B981]/10 p-4"
                >
                  <div className="flex items-center gap-3 text-sm text-[#D1FAE5]">
                    <CheckCircle size={17} className="shrink-0 text-[#10B981]" aria-hidden="true" />
                    Alterações salvas com sucesso
                  </div>
                  {/* Botão fechar: reseta o estado de sucesso */}
                  <button
                    type="button"
                    onClick={() => setSuccess(false)}
                    aria-label="Fechar aviso"
                    className="text-white/30 hover:text-white transition-colors"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── RIGHT COLUMN ─────────────────────────────────── */}
          {/* Coluna lateral com cards informativos de segurança, permissões,
              preferências e suporte. Usa <aside> para semântica correta. */}
          <aside className="space-y-5">

            {/* Security card — lista os status de segurança da conta */}
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)]"
            >
              {/* Escudo decorativo no fundo — puramente visual, oculto para leitores de tela */}
              <div
                className="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 opacity-[0.06] lg:block"
                aria-hidden="true"
              >
                <div className="h-24 w-20 rounded-[40%_40%_50%_50%] border-4 border-white" />
              </div>

              <div className="relative z-10">
                {/* Cabeçalho do card com ícone de escudo e título */}
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#10B981]/12">
                    <ShieldCheck size={19} className="text-[#34D399]" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      Segurança da conta
                    </h3>
                    <p className="text-xs text-white/35">Proteção ativa</p>
                  </div>
                </div>

                {/* Lista de itens de segurança — todos marcados como ativos */}
                <ul className="mt-5 space-y-2.5" aria-label="Status de segurança">
                  {SECURITY_ITEMS.map(item => (
                    <li key={item} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2.5">
                      <CheckCircle2 size={14} className="shrink-0 text-[#34D399]" aria-hidden="true" />
                      <span className="text-xs font-medium text-white/70">{item}</span>
                    </li>
                  ))}
                </ul>

                {/* Link para solicitar envio de e-mail de recuperação de senha */}
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#60A5FA] transition-all hover:gap-2.5"
                >
                  Enviar link de recuperação <ArrowRight size={11} aria-hidden="true" />
                </button>
              </div>
            </motion.article>

            {/* Permissions card — lista as permissões do nível de acesso do técnico */}
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)]"
            >
              {/* Cabeçalho com ícone de coroa (nível líder/técnico) */}
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#7B2CFF]/12">
                  <Crown size={18} className="text-[#A78BFA]" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    Permissões
                  </h3>
                  <p className="text-xs text-white/35">Nível: Técnico admin</p>
                </div>
              </div>

              {/* Grid de permissões com ícone de check — 2 colunas em telas médias */}
              <ul className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Permissões do técnico">
                {PERMISSIONS.map(perm => (
                  <li key={perm} className="flex items-center gap-2 text-xs text-white/60">
                    <CheckCircle2 size={13} className="shrink-0 text-white/35" aria-hidden="true" />
                    {perm}
                  </li>
                ))}
              </ul>
            </motion.article>

            {/* Preferences card — toggles para preferências do painel.
                Os estados são mantidos localmente (useState), sem persistência no banco. */}
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26 }}
              className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)]"
            >
              <h3
                className="mb-5 text-base font-bold text-white"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Preferências do painel
              </h3>

              {/* Mapeia cada preferência em uma linha com toggle.
                  O onChange inverte o booleano da chave correspondente no estado `prefs`. */}
              <div className="space-y-3">
                {PREF_OPTIONS.map(({ key, title, desc }) => (
                  <div key={key} className="flex items-start justify-between gap-4 rounded-2xl border border-white/[0.06] p-3.5 transition-all hover:border-white/[0.10]">
                    {/* Label clicável associada ao Toggle via id */}
                    <label htmlFor={`pref-${key}`} className="cursor-pointer">
                      <p className="text-sm font-semibold text-white/80">{title}</p>
                      <p className="mt-0.5 text-[11px] text-white/35">{desc}</p>
                    </label>
                    {/* Toggle associado à preferência pelo id */}
                    <Toggle
                      id={`pref-${key}`}
                      checked={prefs[key]}
                      onChange={() => setPrefs(p => ({ ...p, [key]: !p[key] }))}
                    />
                  </div>
                ))}
              </div>
            </motion.article>

            {/* Support card — CTA para contato de suporte em caso de alterações sensíveis */}
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="relative overflow-hidden rounded-3xl border border-[#7B2CFF]/25 bg-gradient-to-br from-[#7B2CFF]/20 to-[#005BFF]/10 p-6"
            >
              {/* Glow decorativo no canto superior direito */}
              <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-[#7B2CFF]/10 blur-2xl" aria-hidden="true" />
              <div className="relative z-10">
                {/* Ícone de headphone representando o suporte */}
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7B2CFF]/20">
                  <Headphones size={18} className="text-[#A78BFA]" aria-hidden="true" />
                </div>
                <h3
                  className="mb-1.5 text-base font-bold text-white"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Precisa alterar dados sensíveis?
                </h3>
                <p className="mb-4 text-sm text-white/45">
                  Para sua segurança, alterações críticas são feitas com o apoio do nosso time de suporte.
                </p>
                {/* Botão CTA para abrir canal de suporte */}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.15] bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/80 transition-all hover:border-white/30 hover:bg-white/[0.10] hover:text-white"
                >
                  Falar com suporte
                  <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
            </motion.article>

          </aside>
        </div>

        {/* ── MODELOS DE RESPOSTA (líder) ─────────────────────── */}
        {/* Seção exclusiva para técnicos líderes: CRUD de modelos de e-mail
            usados no modal "Responder" das solicitações.
            Oculta automaticamente para técnicos sem `profile.is_leader = true`. */}
        {profile?.is_leader === true && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
            className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)] sm:p-8"
            aria-label="Modelos de resposta"
          >
            {/* Cabeçalho da seção com ícone de e-mails */}
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#005BFF]/12">
                <Mails size={20} className="text-[#60A5FA]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  Modelos de resposta
                </h3>
                <p className="text-xs text-white/35">Modelos rápidos usados no modal de &ldquo;Responder&rdquo; das solicitações.</p>
              </div>
            </div>

            {/* Layout de duas colunas: formulário à esquerda, lista à direita */}
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">

              {/* Formulário de criação/edição de modelo — modo determinado por editingId */}
              <form onSubmit={handleTemplateSubmit} className="space-y-3">
                {/* Campo: título do botão exibido no modal de resposta */}
                <div>
                  <label htmlFor="tpl-title" className="mb-1.5 block text-xs font-semibold text-white/50">Título do botão</label>
                  <input
                    id="tpl-title"
                    value={tplForm.title}
                    onChange={(e) => setTplForm({ ...tplForm, title: e.target.value })}
                    placeholder="Ex: Agendar diagnóstico"
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-sm text-white placeholder:text-white/25 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-4 focus:ring-[#005BFF]/15"
                    required
                  />
                </div>
                {/* Campo: assunto padrão do e-mail enviado ao cliente */}
                <div>
                  <label htmlFor="tpl-subject" className="mb-1.5 block text-xs font-semibold text-white/50">Assunto padrão</label>
                  <input
                    id="tpl-subject"
                    value={tplForm.subject}
                    onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })}
                    placeholder="Retorno sobre sua solicitação - LOBBY"
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 text-sm text-white placeholder:text-white/25 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-4 focus:ring-[#005BFF]/15"
                    required
                  />
                </div>
                {/* Campo: corpo do e-mail com suporte à variável {{nome}} para personalização */}
                <div>
                  <label htmlFor="tpl-body" className="mb-1.5 block text-xs font-semibold text-white/50">
                    Mensagem padrão <span className="font-normal text-white/25">— use {'{{nome}}'} pro nome do cliente</span>
                  </label>
                  <textarea
                    id="tpl-body"
                    value={tplForm.body}
                    onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
                    rows={4}
                    placeholder="Olá, {{nome}}. ..."
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-all focus:border-[#005BFF]/50 focus:ring-4 focus:ring-[#005BFF]/15"
                    required
                  />
                </div>

                {/* Mensagem de erro do formulário de modelo */}
                {tplError && (
                  <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-400">{tplError}</p>
                )}

                <div className="flex gap-2">
                  {/* Botão de submissão: "Adicionar" ou "Salvar alterações" dependendo do modo.
                      O ícone também muda: Plus (novo) vs Check (editando). */}
                  <button
                    type="submit"
                    disabled={tplSaving}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-2.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,91,255,0.30)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tplSaving
                      ? <Loader2 size={14} className="animate-spin" />
                      : editingId ? <Check size={14} /> : <Plus size={14} />}
                    {editingId ? 'Salvar alterações' : 'Adicionar modelo'}
                  </button>
                  {/* Botão cancelar — aparece apenas no modo de edição; chama resetTplForm */}
                  {editingId && (
                    <button
                      type="button"
                      disabled={tplSaving}
                      onClick={resetTplForm}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/50 transition-all hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>

              {/* Lista de modelos cadastrados */}
              <div>
                {templateList.length === 0 ? (
                  /* Estado vazio: nenhum modelo cadastrado ainda */
                  <p className="py-8 text-center text-sm text-white/30">Nenhum modelo cadastrado.</p>
                ) : (
                  <ul className="space-y-2" role="list">
                    {/* Cada item mostra título, assunto e botões de editar/excluir.
                        O fluxo de exclusão usa dois passos: clique → confirmação → executar. */}
                    {templateList.map((t) => {
                      const isConfirming = confirmDeleteId === t.id  // Aguardando confirmação de exclusão
                      const isDeleting   = deletingTplId === t.id    // Exclusão em andamento
                      return (
                        <li key={t.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            {/* Título e assunto do modelo — truncados se longos */}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">{t.title}</p>
                              <p className="truncate text-xs text-white/40">{t.subject}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {/* Botão editar: pré-popula o formulário com os dados do modelo */}
                              <button
                                type="button"
                                onClick={() => startEditTemplate(t)}
                                aria-label={`Editar ${t.title}`}
                                className="rounded-lg p-1.5 text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                              >
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                              {/* Botão excluir — visível enquanto não está em modo de confirmação */}
                              {!isConfirming && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(t.id)}
                                  aria-label={`Excluir ${t.title}`}
                                  className="rounded-lg p-1.5 text-white/25 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                >
                                  <Trash2 size={14} aria-hidden="true" />
                                </button>
                              )}
                              {/* Estado de confirmação: confirmar (Excluir) ou cancelar (X) */}
                              {isConfirming && (
                                <div className="flex items-center gap-1.5">
                                  {/* Confirmar exclusão: chama handleDeleteTemplate com spinner */}
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => handleDeleteTemplate(t.id)}
                                    className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-60"
                                  >
                                    {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                    Excluir
                                  </button>
                                  {/* Cancelar exclusão: volta ao estado normal */}
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-60"
                                  >
                                    <X size={14} aria-hidden="true" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </motion.section>
        )}

      </div>
    </AdminShell>
  )
}
