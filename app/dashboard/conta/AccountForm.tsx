'use client'

// Componente Client: exige interatividade (useState, eventos de formulário)
import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Loader2, CheckCircle, User, Building2, Mail, ArrowRight,
  ShieldCheck, Code2, Settings2, BarChart3, Shield,
  Headphones, CheckCircle2, Crown, Phone,
} from 'lucide-react'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { createClient } from '@/lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ── Dados estáticos ────────────────────────────────────────────── */

// Opções de área de interesse — cada item mapeia para um ícone do lucide
const INTEREST_OPTIONS = [
  { label: 'Software',       icon: Code2     },
  { label: 'Automação',      icon: Settings2 },
  { label: 'Dados',          icon: BarChart3 },
  { label: 'Cibersegurança', icon: Shield    },
] as const

// Itens de status de segurança exibidos no card lateral direito
const SECURITY_ITEMS = [
  'E-mail verificado',
  'Senha protegida',
  'Sessão ativa',
  'Dados seguros',
]

// Preferências de notificação disponíveis para o usuário ativar/desativar
const PREF_OPTIONS = [
  { key: 'materials'       as const, title: 'Materiais gratuitos',          desc: 'Receba novidades e conteúdos práticos da LOBBY.'        },
  { key: 'projectUpdates'  as const, title: 'Atualizações de projetos',     desc: 'Seja notificado sobre mudanças nos seus projetos.'      },
  { key: 'recommendations' as const, title: 'Recomendações personalizadas', desc: 'Conteúdos e soluções selecionados para o seu perfil.'   },
]

// Tipo auxiliar para as chaves de preferências — garante type-safety no estado
type PrefKey = 'materials' | 'projectUpdates' | 'recommendations'

/* ── Componente ─────────────────────────────────────────────────── */

// Props recebidas da página pai (dashboard/conta/page.tsx)
// user: objeto do Supabase Auth com id e email
// profile: linha da tabela `profiles` com dados complementares do cliente
interface Props {
  user: SupabaseUser
  profile: {
    full_name?: string; company_name?: string; interest_area?: string; email?: string; phone?: string
    notification_prefs?: Record<PrefKey, boolean> | null
  } | null
}

// Valores padrão para as preferências de notificação quando o perfil ainda não tem registro
const DEFAULT_PREFS: Record<PrefKey, boolean> = {
  materials:       true,  // habilitado por padrão — conteúdo gratuito é sempre bom-vindo
  projectUpdates:  true,  // habilitado por padrão — cliente quer acompanhar seus projetos
  recommendations: false, // desabilitado por padrão — conteúdo personalizado é opt-in
}

export default function AccountForm({ user, profile }: Props) {
  // Estado controlado do formulário de dados pessoais
  // Inicializado com valores do perfil existente ou strings vazias
  const [form, setForm] = useState({
    full_name:     profile?.full_name     || '',
    company_name:  profile?.company_name  || '',
    interest_area: profile?.interest_area || '',
    phone:         profile?.phone         || '',
  })

  // Estados de UI do submit: loading evita duplo envio, success/error dão feedback
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState('')

  // Estado das preferências de notificação, mesclando defaults com valores salvos no banco
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    ...DEFAULT_PREFS,
    ...(profile?.notification_prefs ?? {}), // sobrescreve defaults com prefs salvas
  })

  // Extrai primeiro nome para exibição no avatar — fallback para nome antes do @ do e-mail
  const firstName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Usuário'
  // Inicial maiúscula para o avatar circular
  const initial   = firstName.charAt(0).toUpperCase()

  /* Persiste as alterações na tabela `profiles` do Supabase.
   * Usa upsert para criar ou atualizar a linha do usuário. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id:            user.id,    // chave primária da linha do perfil
          email:         user.email, // mantém e-mail sincronizado com o Auth
          full_name:     form.full_name,
          company_name:  form.company_name,
          interest_area: form.interest_area,
          phone:         form.phone || null, // salva null quando vazio (campo opcional)
          notification_prefs: prefs,         // objeto JSON com as preferências
        })
      if (updateError) throw updateError
      setSuccess(true)
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">

      {/* ── CABEÇALHO DA PÁGINA ──────────────────────────────────── */}
      {/* Animação de entrada suave com framer-motion */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <h1
            className="text-3xl font-bold tracking-tight text-[#0B1020]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Minha conta
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#5D6475]">
            Gerencie suas informações, preferências e segurança da sua conta LOBBY.
          </p>
        </div>
        {/* Botão de suporte — leva para /contato sem depender do formulário */}
        <Link
          href="/contato"
          className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white px-5 py-3 text-sm font-bold text-[#0B1020] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:text-[#005BFF]"
        >
          Falar com suporte
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </motion.div>

      {/* ── CARD DE PERFIL ───────────────────────────────────────── */}
      {/* Exibe avatar, nome, e-mail, plano e datas — somente leitura */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_20px_70px_rgba(11,16,32,0.06)] backdrop-blur sm:p-8"
        aria-label="Perfil do usuário"
      >
        {/* Gradiente decorativo de fundo — não interativo */}
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl"
          style={{ background: 'radial-gradient(circle at 85% 30%,rgba(123,44,255,0.08) 0%,transparent 35%),radial-gradient(circle at 50% 100%,rgba(0,91,255,0.06) 0%,transparent 40%)' }}
          aria-hidden="true"
        />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Avatar circular com inicial + nome e e-mail */}
          <div className="flex items-center gap-5">
            {/* Avatar: círculo com gradiente e inicial do nome */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl lobby-gradient text-xl font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)]">
              {initial}
            </div>
            <div>
              <h2
                className="text-xl font-bold text-[#0B1020]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {firstName}
              </h2>
              <p className="mt-0.5 text-sm text-[#5D6475]">{user.email}</p>
              {/* Badge de status — sempre "Conta ativa" para usuários autenticados */}
              <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#10B981]/10 px-3 py-1 text-xs font-bold text-[#059669]">
                <span className="h-2 w-2 rounded-full bg-[#10B981]" aria-hidden="true" />
                Conta ativa
              </span>
            </div>
          </div>

          {/* Metadados: plano, último acesso e ano de entrada */}
          <div className="grid grid-cols-3 gap-6 lg:gap-8">
            <div>
              <p className="text-xs font-medium text-[#5D6475]">Plano</p>
              <div className="mt-1 flex items-center gap-1">
                <Crown size={13} className="text-[#005BFF]" aria-hidden="true" />
                <p className="text-sm font-bold text-[#0B1020]">Cliente</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#5D6475]">Último acesso</p>
              <p className="mt-1 text-sm font-bold text-[#0B1020]">
                {user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#5D6475]">Membro desde</p>
              <p className="mt-1 text-sm font-bold text-[#0B1020]">
                {user.created_at
                  ? new Date(user.created_at).getFullYear()
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── GRADE DE DUAS COLUNAS ────────────────────────────────── */}
      {/* Esquerda: formulário de dados | Direita: cards de e-mail, segurança, prefs */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">

        {/* ── ESQUERDA: FORMULÁRIO DE DADOS PESSOAIS ───────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          {/* onSubmit chama handleSubmit que faz upsert no Supabase */}
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_18px_60px_rgba(11,16,32,0.06)] sm:p-7"
          >
            <div className="mb-6">
              <h2
                className="text-xl font-bold text-[#0B1020]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Dados pessoais
              </h2>
              <p className="mt-1 text-sm text-[#5D6475]">
                Mantenha suas informações sempre atualizadas.
              </p>
            </div>

            <div className="space-y-5">
              {/* Campo: nome completo */}
              <div>
                <Label htmlFor="full_name" className="mb-2 block text-sm font-semibold text-[#0B1020]">
                  Nome completo
                </Label>
                <div className="relative">
                  {/* Ícone posicionado absolutamente à esquerda do input */}
                  <User
                    size={17}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#005BFF]/60"
                    aria-hidden="true"
                  />
                  <Input
                    id="full_name"
                    placeholder="Seu nome completo"
                    value={form.full_name}
                    // Atualiza apenas o campo full_name mantendo o restante do estado
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="h-14 rounded-2xl border-[#E3E7F0] bg-white pl-12 text-sm text-[#0B1020] transition-all duration-300 placeholder:text-[#5D6475]/60 focus-visible:border-[#005BFF]/40 focus-visible:ring-4 focus-visible:ring-[#005BFF]/10"
                  />
                </div>
              </div>

              {/* Campo: nome da empresa */}
              <div>
                <Label htmlFor="company_name" className="mb-2 block text-sm font-semibold text-[#0B1020]">
                  Empresa
                </Label>
                <div className="relative">
                  <Building2
                    size={17}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#005BFF]/60"
                    aria-hidden="true"
                  />
                  <Input
                    id="company_name"
                    placeholder="Nome da sua empresa"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    className="h-14 rounded-2xl border-[#E3E7F0] bg-white pl-12 text-sm text-[#0B1020] transition-all duration-300 placeholder:text-[#5D6475]/60 focus-visible:border-[#005BFF]/40 focus-visible:ring-4 focus-visible:ring-[#005BFF]/10"
                  />
                </div>
              </div>

              {/* Campo: telefone / WhatsApp (opcional) */}
              <div>
                <Label htmlFor="phone" className="mb-2 block text-sm font-semibold text-[#0B1020]">
                  Telefone / WhatsApp
                </Label>
                <div className="relative">
                  <Phone size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#005BFF]/60" aria-hidden="true" />
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="(11) 99999-9999"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="h-14 rounded-2xl border-[#E3E7F0] bg-white pl-12 text-sm text-[#0B1020] transition-all duration-300 placeholder:text-[#5D6475]/60 focus-visible:border-[#005BFF]/40 focus-visible:ring-4 focus-visible:ring-[#005BFF]/10"
                  />
                </div>
              </div>

              {/* Seletor de área de interesse — botões tipo chip (toggle único) */}
              <div>
                <Label className="mb-3 block text-sm font-semibold text-[#0B1020]">
                  Área de interesse
                </Label>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Selecione sua área de interesse"
                >
                  {INTEREST_OPTIONS.map(({ label, icon: Icon }) => {
                    // Verifica se este chip é o selecionado atualmente
                    const isActive = form.interest_area === label
                    return (
                      <button
                        key={label}
                        type="button" // evita submit acidental do formulário pai
                        aria-pressed={isActive}
                        // Toggle: deseleciona se já ativo, seleciona se inativo
                        onClick={() => setForm({ ...form, interest_area: isActive ? '' : label })}
                        className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                          isActive
                            ? 'border-transparent bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_8px_20px_rgba(0,91,255,0.20)]'
                            : 'border-[#E3E7F0] bg-white text-[#5D6475] hover:border-[#005BFF]/30 hover:text-[#005BFF]'
                        }`}
                      >
                        <Icon size={15} aria-hidden="true" />
                        {label}
                        {/* Ícone de check aparece apenas no chip ativo */}
                        {isActive && <CheckCircle2 size={13} aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Feedback de erro — exibido quando o upsert retorna erro */}
            {error && (
              <div
                className="mt-5 flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
                role="alert"
              >
                {error}
              </div>
            )}
            {/* Feedback de sucesso — exibido após salvar com êxito */}
            {success && (
              <div
                className="mt-5 flex items-center gap-2 rounded-2xl bg-[#10B981]/8 px-4 py-3 text-sm font-medium text-[#059669]"
                role="status"
              >
                <CheckCircle size={16} aria-hidden="true" />
                Alterações salvas com sucesso!
              </div>
            )}

            {/* Botão de submit — desabilitado durante o loading para evitar duplo envio */}
            <button
              type="submit"
              disabled={loading}
              className="group mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,91,255,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(123,44,255,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {/* Alterna entre spinner de loading e texto normal */}
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Salvando...
                </>
              ) : (
                <>
                  Salvar alterações
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </>
              )}
            </button>
          </form>
        </motion.div>

        {/* ── COLUNA DIREITA: cards informativos e preferências ──── */}
        <aside className="space-y-5">

          {/* Card: e-mail da conta (somente leitura — alteração via suporte) */}
          <motion.article
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_18px_60px_rgba(11,16,32,0.06)]"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#005BFF]/10">
                <Mail size={18} className="text-[#005BFF]" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3
                    className="text-base font-bold text-[#0B1020]"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    E-mail da conta
                  </h3>
                  {/* Badge mostrando que o e-mail foi verificado pelo Supabase Auth */}
                  <span className="rounded-full bg-[#10B981]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#059669]">
                    Verificado
                  </span>
                </div>
                <p className="mt-2 break-all text-sm font-semibold text-[#0B1020]">
                  {user.email}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[#5D6475]">
                  Usado para login, notificações e recuperação de acesso.
                </p>
                {/* Solicitar alteração de e-mail requer contato com suporte (dado sensível) */}
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#005BFF] transition-all hover:gap-2 hover:text-[#7B2CFF]"
                >
                  Solicitar alteração <ArrowRight size={11} aria-hidden="true" />
                </button>
              </div>
            </div>
          </motion.article>

          {/* Card: status de segurança da conta */}
          <motion.article
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_18px_60px_rgba(11,16,32,0.06)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#10B981]/10">
                <ShieldCheck size={18} className="text-[#10B981]" aria-hidden="true" />
              </div>
              <div>
                <h3
                  className="text-base font-bold text-[#0B1020]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Segurança da conta
                </h3>
                <p className="text-xs text-[#5D6475]">Proteção e acesso seguro.</p>
              </div>
            </div>

            {/* Lista de itens de segurança — todos exibidos como verificados */}
            <ul className="mt-5 space-y-2" aria-label="Status de segurança">
              {SECURITY_ITEMS.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2.5 rounded-xl bg-[#F7F8FC] px-3 py-2.5"
                >
                  <CheckCircle2 size={14} className="shrink-0 text-[#10B981]" aria-hidden="true" />
                  <span className="text-xs font-medium text-[#0B1020]">{item}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/contato"
              className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#005BFF] transition-all hover:gap-2"
            >
              Falar com suporte <ArrowRight size={11} aria-hidden="true" />
            </Link>
          </motion.article>

          {/* Card: preferências de notificação — checkboxes persistidos no banco */}
          <motion.article
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_18px_60px_rgba(11,16,32,0.06)]"
          >
            <h3
              className="mb-4 text-base font-bold text-[#0B1020]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Preferências de comunicação
            </h3>

            <div className="space-y-2.5">
              {/* Itera sobre as opções de preferência, cada uma com seu próprio checkbox */}
              {PREF_OPTIONS.map(({ key, title, desc }) => (
                <label
                  key={key}
                  htmlFor={`pref-${key}`}
                  // label clicável que engloba o checkbox — melhora área de toque
                  className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-[#E3E7F0] bg-white p-4 transition-all hover:border-[#005BFF]/20 hover:bg-[#F7F8FC]/50"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#0B1020]">{title}</p>
                    <p className="mt-0.5 text-xs text-[#5D6475]">{desc}</p>
                  </div>
                  <Checkbox
                    id={`pref-${key}`}
                    checked={prefs[key]}
                    // Atualiza a chave correspondente no estado de prefs
                    onCheckedChange={(v) => setPrefs(p => ({ ...p, [key]: !!v }))}
                    className="mt-0.5 shrink-0 data-[state=checked]:border-[#005BFF] data-[state=checked]:bg-[#005BFF]"
                  />
                </label>
              ))}
            </div>
          </motion.article>

          {/* Card: chamada para suporte — dados sensíveis exigem atendimento humano */}
          <motion.article
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="relative overflow-hidden rounded-3xl border border-[#005BFF]/15 bg-gradient-to-br from-[#F0F4FF] to-[#EEF0FF] p-6"
          >
            {/* Blob decorativo de fundo */}
            <div
              className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-[#7B2CFF]/8 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative z-10">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#005BFF]/10">
                <Headphones size={18} className="text-[#005BFF]" aria-hidden="true" />
              </div>
              <h3
                className="mb-1.5 text-base font-bold text-[#0B1020]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Precisa alterar dados sensíveis?
              </h3>
              <p className="mb-4 text-sm leading-relaxed text-[#5D6475]">
                Para alterar e-mail, senha ou informações críticas, fale com nosso suporte.
              </p>
              <Link
                href="/contato"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#005BFF] transition-all hover:gap-2.5"
              >
                Falar com suporte <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </motion.article>

        </aside>
      </div>
    </div>
  )
}
