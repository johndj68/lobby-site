'use client'

// Hooks do React para estado local
import { useState } from 'react'
// Biblioteca de animações para transições de entrada dos elementos
import { motion } from 'framer-motion'
// Ícones da interface — cada um com uso específico descrito abaixo
import {
  Eye,         // Ícone de olho aberto (exibir senha)
  EyeOff,      // Ícone de olho fechado (ocultar senha)
  Loader2,     // Spinner de carregamento animado
  Mail,        // Ícone de envelope para o campo de e-mail
  Lock,        // Ícone de cadeado para o campo de senha
  User,        // Ícone de perfil para o campo de nome
  UserPlus,    // Ícone do cabeçalho do formulário de criação
  CheckCircle, // Ícone de confirmação no feedback de sucesso
  Crown,       // Ícone de coroa para badge de líder
  Users,       // Ícone do cabeçalho da lista de técnicos
  Trash2,      // Ícone de lixeira para excluir técnico
  Check,       // Ícone de confirmação no botão de confirmar exclusão
  X,           // Ícone de cancelamento no botão de cancelar exclusão
} from 'lucide-react'
// Layout padrão das páginas da área administrativa (sidebar + topbar)
import AdminShell from '@/components/layout/AdminShell'
// Server Actions: operações no banco que rodam no servidor
// createTechnician: cria usuário no Supabase Auth + insere registro em profiles
// deleteTechnician: remove usuário do Supabase Auth + exclui registro de profiles
import { createTechnician, deleteTechnician } from './actions'
// Tipo TypeScript do técnico — campos: id, full_name, email, is_leader, created_at
import type { Technician as TechnicianRow } from '@/types'
// Tipo do usuário autenticado retornado pelo Supabase Auth
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ─── Tipagem das props recebidas da Server Component (page.tsx) ─── */
interface Props {
  /** Objeto do usuário autenticado (Supabase Auth), usado para identificar
   *  o técnico logado e bloquear a exclusão do próprio perfil */
  user: SupabaseUser
  /** Perfil do técnico logado buscado na tabela profiles.
   *  Pode ser null se o perfil ainda não foi criado. */
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  /** Lista de técnicos cadastrados buscada no servidor no momento do carregamento
   *  da página — usada como valor inicial do estado `list` */
  technicians: TechnicianRow[]
}

export default function EquipeClient({ user, profile, technicians }: Props) {

  /* ─── Estados do formulário de criação ─── */

  // Campos controlados do formulário: nome, e-mail e senha do novo técnico
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  // Controla a visibilidade do campo de senha: true = texto visível, false = oculto
  const [showPw,  setShowPw]  = useState(false)

  // Indica que a Server Action de criação está em execução (exibe spinner no botão)
  const [loading, setLoading] = useState(false)

  // Armazena a mensagem de erro retornada pela Server Action (vazio = sem erro)
  const [error,   setError]   = useState('')

  // true após uma criação bem-sucedida — exibe o feedback verde por uma interação
  const [success, setSuccess] = useState(false)

  /* ─── Estados da lista de técnicos ─── */

  // Cópia local da lista de técnicos — atualizada otimisticamente após
  // criar ou excluir um técnico, sem recarregar a página
  const [list, setList] = useState(technicians)

  // ID do técnico que está com a confirmação de exclusão aberta (null = nenhum)
  // A confirmação é exibida inline no próprio item da lista, não em modal
  const [confirmId,  setConfirmId]  = useState<string | null>(null)

  // ID do técnico cuja exclusão está sendo processada no servidor
  // Enquanto preenchido, o botão confirmar exibe spinner e fica desabilitado
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Erro específico de uma exclusão, com o id do técnico afetado para exibição inline
  // Exemplo: { id: 'abc', message: 'Não é possível excluir um líder.' }
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)

  /* ─── handleSubmit: cria um novo técnico via Server Action ─── */
  /**
   * Envia os dados do formulário para a Server Action `createTechnician`,
   * que registra o usuário no Supabase Auth com role=technician e insere
   * o perfil na tabela `profiles`.
   *
   * Em caso de sucesso, adiciona o técnico à lista local em ordem alfabética
   * e limpa o formulário. As credenciais (e-mail/senha) devem ser repassadas
   * ao técnico fora do sistema, pois não há envio de e-mail automático.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    const result = await createTechnician(form)

    if (!result.success) {
      // Exibe o erro retornado pela Server Action (ex.: e-mail já cadastrado,
      // senha muito fraca, falha de permissão no Supabase)
      setError(result.error)
      setLoading(false)
      return
    }

    // Atualização otimista: insere o novo técnico na lista local e
    // reordena alfabeticamente pelo nome completo
    setList(prev => [
      ...prev,
      {
        id:         result.id,
        full_name:  form.name,
        email:      form.email,
        is_leader:  false,                      // Técnico novo nunca é líder por padrão
        created_at: new Date().toISOString(),
      },
    ].sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '')))

    // Limpa os campos do formulário e exibe feedback visual de sucesso
    setForm({ name: '', email: '', password: '' })
    setSuccess(true)
    setLoading(false)
  }

  /* ─── handleDelete: remove um técnico permanentemente ─── */
  /**
   * Chama a Server Action `deleteTechnician` que:
   * 1. Remove o usuário do Supabase Auth (admin.deleteUser)
   * 2. Exclui o registro da tabela `profiles`
   *
   * Restrições (verificadas tanto aqui quanto na Server Action):
   * - Líderes (is_leader=true) não podem ser excluídos
   * - O técnico logado não pode excluir o próprio perfil
   *
   * Em caso de sucesso, remove o item da lista local sem recarregar a página.
   * Em caso de erro, exibe a mensagem inline abaixo do item na lista.
   */
  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setDeleteError(null)

    const result = await deleteTechnician(id)

    if (!result.success) {
      // Armazena o erro vinculado ao ID para exibição inline no item correto da lista
      setDeleteError({ id, message: result.error })
      setDeletingId(null)
      setConfirmId(null)  // Fecha o modo de confirmação mesmo em caso de erro
      return
    }

    // Remove o técnico da lista local após confirmação de exclusão no banco
    setList(prev => prev.filter(t => t.id !== id))
    setDeletingId(null)
    setConfirmId(null)
  }

  /* ─── JSX ─── */
  return (
    <AdminShell user={user} profile={profile}>
      <div className="space-y-7">

        {/* ── HEADER: título e descrição da página ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Equipe
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/40">
            Crie contas de acesso para técnicos comuns. Defina e-mail e senha — o técnico entra com essas credenciais em /admin/login.
          </p>
        </motion.div>

        {/* Layout em duas colunas no desktop (xl+): formulário à esquerda, lista à direita.
            Em telas menores, os cards empilham verticalmente. */}
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">

          {/* ── FORMULÁRIO DE CRIAÇÃO DE TÉCNICO ── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)] sm:p-8"
            aria-label="Criar técnico"
          >
            {/* Cabeçalho do card: ícone + título */}
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#005BFF]/12">
                <UserPlus size={20} className="text-[#60A5FA]" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Novo técnico
              </h2>
            </div>

            {/* Formulário controlado com validação nativa do browser desabilitada
                (noValidate) — a validação é feita pela Server Action */}
            <form onSubmit={handleSubmit} noValidate className="space-y-4">

              {/* Campo: nome completo do técnico — gravado em profiles.full_name */}
              <div>
                <label htmlFor="eq-name" className="mb-2 block text-sm font-semibold text-white/80">
                  Nome completo
                </label>
                <div className="relative">
                  {/* Ícone decorativo de usuário posicionado à esquerda do input */}
                  <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
                  <input
                    id="eq-name"
                    autoComplete="name"
                    placeholder="Nome do técnico"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] pl-10 pr-4 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-300 focus:border-[#005BFF]/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-[#005BFF]/15"
                    required
                  />
                </div>
              </div>

              {/* Campo: e-mail de login — será usado como credencial de acesso ao
                  painel admin em /admin/login. autoComplete="off" evita preenchimento
                  automático indesejado ao criar múltiplos técnicos em sequência. */}
              <div>
                <label htmlFor="eq-email" className="mb-2 block text-sm font-semibold text-white/80">
                  E-mail
                </label>
                <div className="relative">
                  {/* Ícone decorativo de envelope posicionado à esquerda do input */}
                  <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
                  <input
                    id="eq-email"
                    type="email"
                    autoComplete="off"
                    placeholder="tecnico@lobby.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] pl-10 pr-4 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-300 focus:border-[#005BFF]/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-[#005BFF]/15"
                    required
                  />
                </div>
              </div>

              {/* Campo: senha inicial definida pelo líder para o técnico.
                  autoComplete="new-password" sinaliza ao browser que é uma senha nova.
                  O tipo alterna entre 'password' e 'text' conforme showPw. */}
              <div>
                <label htmlFor="eq-password" className="mb-2 block text-sm font-semibold text-white/80">
                  Senha
                </label>
                <div className="relative">
                  {/* Ícone decorativo de cadeado posicionado à esquerda do input */}
                  <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
                  <input
                    id="eq-password"
                    type={showPw ? 'text' : 'password'}  // Alterna visibilidade conforme estado showPw
                    autoComplete="new-password"
                    placeholder="Mínimo de 8 caracteres"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] pl-10 pr-11 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-300 focus:border-[#005BFF]/50 focus:bg-white/[0.08] focus:ring-4 focus:ring-[#005BFF]/15"
                    required
                  />
                  {/* Botão de toggle: exibir ou ocultar a senha digitada.
                      type="button" evita que o clique submeta o formulário. */}
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white/70"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {/* Lembrete: as credenciais não são enviadas por e-mail automaticamente */}
                <p className="mt-1.5 text-xs text-white/30">
                  Repasse essas credenciais ao técnico por fora do sistema.
                </p>
              </div>

              {/* Alerta de erro — role="alert" garante anúncio por leitores de tela */}
              {error && (
                <p role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-400">
                  {error}
                </p>
              )}

              {/* Feedback de sucesso — exibido imediatamente após a criação bem-sucedida */}
              {success && (
                <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-400">
                  <CheckCircle size={14} aria-hidden="true" />
                  Técnico criado com sucesso.
                </p>
              )}

              {/* Botão de submissão — exibe spinner e fica desabilitado durante o envio */}
              <button
                type="submit"
                disabled={loading}
                className="group mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,91,255,0.30)] transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  // Estado de carregamento: spinner + texto alternativo
                  <><Loader2 size={16} className="animate-spin" />Criando...</>
                ) : (
                  // Estado padrão
                  <>Criar técnico</>
                )}
              </button>
            </form>
          </motion.section>

          {/* ── LISTA DE TÉCNICOS CADASTRADOS ── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}  // Leve atraso em relação ao formulário para efeito cascata
            className="rounded-3xl border border-white/[0.08] bg-[#111827]/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)] sm:p-8"
            aria-label="Técnicos"
          >
            {/* Cabeçalho do card: ícone + título com contagem de técnicos */}
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#7B2CFF]/12">
                <Users size={20} className="text-[#A78BFA]" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Técnicos ({list.length})
              </h2>
            </div>

            {list.length === 0 ? (
              // Estado vazio: exibido quando não há nenhum técnico cadastrado
              <p className="py-8 text-center text-sm text-white/30">Nenhum técnico cadastrado.</p>
            ) : (
              <ul className="space-y-2" role="list">
                {list.map((t) => {
                  /* Flags calculadas por item da lista — determinam
                     quais controles de exclusão aparecem para cada técnico */

                  // true se este item é o próprio técnico autenticado
                  const isSelf = t.id === user.id

                  // Pode ser excluído? Apenas técnicos que não são líderes
                  // e que não sejam o próprio usuário logado
                  const canDelete = !t.is_leader && !isSelf

                  // true se este item está com o painel de confirmação de exclusão aberto
                  const isConfirming = confirmId === t.id

                  // true se a exclusão deste item está em progresso no servidor
                  const isDeleting = deletingId === t.id

                  return (
                    <li
                      key={t.id}
                      className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">

                        {/* Informações do técnico: nome e e-mail */}
                        <div className="min-w-0">
                          {/* Exibe full_name se disponível, caso contrário exibe o e-mail */}
                          <p className="truncate text-sm font-semibold text-white">{t.full_name || t.email}</p>
                          <p className="truncate text-xs text-white/40">{t.email}</p>
                        </div>

                        {/* Área de ações do item: badge de líder e botões de exclusão */}
                        <div className="flex shrink-0 items-center gap-2">

                          {/* Badge de coroa — exibido apenas para técnicos com is_leader=true.
                              Líderes não podem ser excluídos pela interface. */}
                          {t.is_leader && (
                            <span className="flex items-center gap-1 rounded-full bg-[#F59E0B]/15 px-2.5 py-1 text-[10px] font-bold text-[#FBBF24]">
                              <Crown size={11} aria-hidden="true" />
                              Líder
                            </span>
                          )}

                          {/* Botão de lixeira — visível apenas para técnicos que podem ser excluídos
                              e enquanto o modo de confirmação NÃO está ativo para este item */}
                          {canDelete && !isConfirming && (
                            <button
                              type="button"
                              onClick={() => setConfirmId(t.id)}  // Abre confirmação inline para este técnico
                              aria-label={`Excluir ${t.full_name || t.email}`}
                              className="rounded-lg p-1.5 text-white/25 transition-colors hover:bg-red-500/10 hover:text-red-400"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          )}

                          {/* Confirmação inline de exclusão — substitui o botão de lixeira
                              quando isConfirming=true. Dois botões: confirmar e cancelar. */}
                          {canDelete && isConfirming && (
                            <div className="flex items-center gap-1.5">

                              {/* Botão CONFIRMAR: executa handleDelete, exibe spinner durante processo */}
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => handleDelete(t.id)}
                                aria-label="Confirmar exclusão"
                                className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-60"
                              >
                                {/* Spinner durante exclusão, ícone de check quando aguardando confirmação */}
                                {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                Excluir
                              </button>

                              {/* Botão CANCELAR: fecha o modo de confirmação sem excluir */}
                              <button
                                type="button"
                                disabled={isDeleting}  // Desabilitado enquanto a exclusão está em progresso
                                onClick={() => setConfirmId(null)}
                                aria-label="Cancelar exclusão"
                                className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-60"
                              >
                                <X size={14} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Mensagem de erro de exclusão exibida inline abaixo do item afetado.
                          Só aparece para o técnico cujo id bate com deleteError.id. */}
                      {deleteError?.id === t.id && (
                        <p className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-400">
                          {deleteError.message}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.section>
        </div>
      </div>
    </AdminShell>
  )
}
