'use client'

// Chat entre cliente e equipe técnica.
// O modelo é baseado em threads: "Suporte geral" (sem projeto vinculado)
// e uma thread por projeto com técnico responsável.
// Mensagens são sincronizadas em tempo real via Supabase Realtime.

import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { motion } from 'framer-motion'
import { Send, Loader2, MessageCircle, Wrench, CheckCheck, LifeBuoy, FolderKanban, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { setTypingStatus, GENERAL_THREAD_ID, type TypingStatusRow } from '@/lib/typing-status'
import { timeLabel, dateLabel } from '@/lib/messages-utils'
import type { ChatMessage, ChatThread } from '@/types'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ── Props recebidas do Server Component (page.tsx) ─────────── */
interface Props {
  user:             SupabaseUser
  profile:          { full_name?: string; company_name?: string } | null
  initialMessages:  ChatMessage[]   // todas as mensagens do cliente (todas as threads)
  threads:          ChatThread[]    // threads de projeto disponíveis para o cliente
  initialProjectId: string | null   // thread pré-selecionada via query param ?project=
}

/**
 * Chat agora é por thread, não um fluxo único do cliente — "Suporte geral"
 * (project_id null, qualquer técnico responde) e uma thread por projeto
 * que já tem um técnico responsável (lead_technician_id). Antes disso era
 * uma conversa só, sem dizer com quem nem sobre qual projeto o cliente
 * estava falando — ver conversa com o usuário sobre a confusão gerada.
 */
export default function MensagensClient({ user, initialMessages, threads, initialProjectId }: Props) {
  // Valida se o project_id inicial ainda é uma thread válida para este cliente
  const validInitialProjectId = initialProjectId && threads.some(t => t.projectId === initialProjectId) ? initialProjectId : null

  // Todas as mensagens do cliente (todas as threads combinadas)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)

  // ID do projeto da thread ativa (null = Suporte geral)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(validInitialProjectId)

  // Texto sendo digitado no input de envio
  const [text,    setText]    = useState('')

  // Indica que a mensagem está sendo enviada para o banco
  const [sending, setSending] = useState(false)

  /* No mobile só cabe um painel por vez — lista de conversas por padrão,
     troca pra thread ao selecionar. No desktop os dois ficam lado a lado
     sempre (esses estados só afetam a classe CSS em telas <sm). */
  const [mobileShowThread, setMobileShowThread] = useState(!!validInitialProjectId)

  // Referência estável ao cliente Supabase — evita recriar a cada render
  const sbRef     = useRef(createClient())

  // Referência ao final da lista de mensagens — para auto-scroll
  const bottomRef = useRef<HTMLDivElement>(null)

  // Typing indicator — tabela public.typing_status + postgres_changes (RLS
  // aplica automaticamente). Não usa Presence: canais Presence nomeados não
  // têm autorização própria nesse projeto (RLS em realtime.messages exigiria
  // ownership que a role do `db push` não tem — ver SECURITY.md §9).
  const typingWatchRef    = useRef<RealtimeChannel | null>(null)
  const typingTimerRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const typingWatchdogRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [peerTyping, setPeerTyping] = useState(false)

  // Rola suavemente até a última mensagem
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

  // Para de emitir "digitando" após 2s de pausa
  const stopTyping = useCallback(() => {
    setTypingStatus(sbRef.current, user.id, selectedProjectId, 'client', false)
  }, [user.id, selectedProjectId])

  // Publica o próprio estado de "digitando" na tabela typing_status
  const handleTextChange = useCallback((val: string) => {
    setText(val)
    if (val.trim()) {
      setTypingStatus(sbRef.current, user.id, selectedProjectId, 'client', true)
      clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(stopTyping, 2000)
    } else {
      clearTimeout(typingTimerRef.current)
      stopTyping()
    }
  }, [stopTyping, user.id, selectedProjectId])

  /* ── Typing indicator: observa a linha role='technician' desta thread ──
     Sem cleanup automático de desconexão (diferente de Presence) — por isso
     o "watchdog": toda vez que chega typing=true, agenda um timeout local
     que zera peerTyping sozinho se nenhum evento novo chegar a tempo (a
     ponta que está digitando reafirma typing=true a cada tecla, então esse
     timeout só dispara de verdade se ela sumir/cair no meio do caminho). */
  useEffect(() => {
    const sb = sbRef.current
    if (typingWatchRef.current) sb.removeChannel(typingWatchRef.current)
    clearTimeout(typingWatchdogRef.current)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeerTyping(false)

    const targetProject = selectedProjectId ?? GENERAL_THREAD_ID
    const ch = sb
      .channel(`typing-watch-${user.id}`)
      .on<TypingStatusRow>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'typing_status', filter: `client_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as Partial<TypingStatusRow>
          if (row.role !== 'technician' || row.project_id !== targetProject) return
          clearTimeout(typingWatchdogRef.current)
          if (row.typing) {
            setPeerTyping(true)
            typingWatchdogRef.current = setTimeout(() => setPeerTyping(false), 4000)
          } else {
            setPeerTyping(false)
          }
        },
      )
      .subscribe()
    typingWatchRef.current = ch

    return () => {
      clearTimeout(typingTimerRef.current)
      clearTimeout(typingWatchdogRef.current)
      setTypingStatus(sb, user.id, selectedProjectId, 'client', false)
      sb.removeChannel(ch)
    }
  }, [user.id, selectedProjectId])

  /* ── Subscription Realtime ───────────────────────────────────
     Escuta inserções na tabela messages filtradas pelo client_id.
     Garante que novas mensagens do técnico apareçam instantaneamente
     sem recarregar a página. Deduplication por id evita duplicatas
     caso a mensagem chegue via payload E via fetch local. */
  useEffect(() => {
    const sb = sbRef.current
    const channel = sb
      .channel(`client-chat-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as ChatMessage
          setMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row])
        }
      )
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [user.id])

  /* ── Mensagens da thread ativa ───────────────────────────────
     Filtra pelo project_id selecionado (null = Suporte geral) e
     ordena cronologicamente para exibição no chat. */
  const threadMessages = useMemo(
    () => messages
      .filter(m => (m.project_id ?? null) === selectedProjectId)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [messages, selectedProjectId]
  )

  // Scrolla para o fundo sempre que chegam novas mensagens na thread ativa
  useEffect(() => { scrollToBottom() }, [threadMessages])

  /* ── Marcar mensagens como lidas ─────────────────────────────
     Marca como lidas só as mensagens da thread aberta — cada thread tem
     seu próprio contador de não lidas, abrir uma não deveria zerar as
     outras. Dispara evento customizado para atualizar o badge no header
     principal (DashboardClient). */
  useEffect(() => {
    const unread = messages.filter(m =>
      m.sender_role === 'technician' && !m.read_at && (m.project_id ?? null) === selectedProjectId
    )
    if (unread.length === 0) return
    sbRef.current
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unread.map(m => m.id))
      .then(() => {
        // Atualiza estado local com read_at preenchido
        setMessages(prev => prev.map(m =>
          unread.some(u => u.id === m.id) ? { ...m, read_at: new Date().toISOString() } : m
        ))
        // Notifica o DashboardClient para atualizar o badge de não lidas no sino
        window.dispatchEvent(new CustomEvent('lobby:messages-read'))
      })
  }, [selectedProjectId, messages])

  /* ── Envio de mensagem ───────────────────────────────────────
     Insere no banco e adiciona à lista local com deduplication.
     Em caso de erro, restaura o texto no input para o cliente tentar novamente. */
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    setSending(true)
    setText('')
    try {
      const { data, error } = await sbRef.current
        .from('messages')
        .insert({
          client_id:   user.id,
          sender_id:   user.id,
          sender_role: 'client',
          project_id:  selectedProjectId, // null para Suporte geral
          content,
        })
        .select('*')
        .single()
      if (error) throw error
      const row = data as ChatMessage
      // Evita duplicata se o Realtime já adicionou antes do insert retornar
      setMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row])
      // Notifica técnicos — fire-and-forget, não bloqueia o UX
      fetch('/api/notify/message', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message_id: row.id }),
      }).catch(() => {/* silencioso */})
    } catch {
      setText(content) // restaura o texto em caso de erro para não perder o que o cliente digitou
    } finally {
      setSending(false)
    }
  }

  /* ── Contagem de não lidas por thread ────────────────────────
     Alimenta o badge numérico na lista lateral de conversas.
     Chave '__general__' representa o Suporte geral (project_id null). */
  const unreadByThread = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of messages) {
      if (m.sender_role !== 'technician' || m.read_at) continue
      const key = m.project_id ?? '__general__'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [messages])

  // Retorna a última mensagem de uma thread para mostrar preview na lista
  const lastMessageOf = (projectId: string | null) => {
    const list = messages.filter(m => (m.project_id ?? null) === projectId)
    return list[list.length - 1]
  }

  // Thread ativa (objeto completo com título e nome do técnico)
  const activeThread = threads.find(t => t.projectId === selectedProjectId) ?? null

  /* ── Agrupamento de mensagens por dia ───────────────────────
     Gera separadores visuais de data entre grupos de mensagens
     do mesmo dia (ex: "Hoje", "15 de julho"). */
  const groups: { date: string; items: ChatMessage[] }[] = []
  threadMessages.forEach(m => {
    const d = dateLabel(m.created_at)
    const last = groups[groups.length - 1]
    if (last && last.date === d) last.items.push(m)
    else groups.push({ date: d, items: [m] })
  })

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">

        {/* Cabeçalho da página de mensagens */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Mensagens
          </h1>
          <p className="mt-0.5 text-sm text-[#5D6475]">Converse com a equipe técnica LOBBY — geral ou por projeto.</p>
        </div>

        {/* Layout de dois painéis lado a lado no desktop */}
        <div className="flex flex-1 gap-4 overflow-hidden">

          {/* ── PAINEL ESQUERDO: LISTA DE CONVERSAS ──────────────
              No mobile aparece quando mobileShowThread = false.
              No desktop sempre visível (sm:flex). */}
          <div className={`w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white shadow-[0_20px_70px_rgba(11,16,32,0.06)] sm:flex sm:max-w-[15rem] ${mobileShowThread ? 'hidden' : 'flex'}`}>
            <div className="flex-1 overflow-y-auto p-2">
              {/* Thread de Suporte geral — sempre disponível, project_id null */}
              <button type="button" onClick={() => { setSelectedProjectId(null); setMobileShowThread(true) }}
                className={`flex w-full items-start gap-2.5 rounded-2xl px-3 py-3 text-left transition-colors ${selectedProjectId === null ? 'bg-[#005BFF]/8' : 'hover:bg-[#F7F8FC]'}`}>
                {/* Avatar escuro com ícone de suporte */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B1020]">
                  <LifeBuoy size={14} className="text-white" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-xs font-bold text-[#0B1020]">Suporte geral</p>
                    {/* Badge de não lidas para o suporte geral */}
                    {(unreadByThread.get('__general__') ?? 0) > 0 && (
                      <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#005BFF] px-1 text-[9px] font-bold text-white">
                        {unreadByThread.get('__general__')}
                      </span>
                    )}
                  </div>
                  {/* Preview da última mensagem ou texto padrão */}
                  <p className="truncate text-[10px] text-[#5D6475]">{lastMessageOf(null)?.content ?? 'Dúvidas gerais'}</p>
                </div>
              </button>

              {/* Threads por projeto — uma para cada projeto com técnico atribuído */}
              {threads.map(t => (
                <button key={t.projectId} type="button" onClick={() => { setSelectedProjectId(t.projectId); setMobileShowThread(true) }}
                  className={`flex w-full items-start gap-2.5 rounded-2xl px-3 py-3 text-left transition-colors ${selectedProjectId === t.projectId ? 'bg-[#005BFF]/8' : 'hover:bg-[#F7F8FC]'}`}>
                  {/* Avatar gradiente com ícone de pasta para thread de projeto */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#005BFF] to-[#7B2CFF]">
                    <FolderKanban size={13} className="text-white" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="truncate text-xs font-bold text-[#0B1020]">{t.projectTitle}</p>
                      {/* Badge de não lidas por project_id */}
                      {(unreadByThread.get(t.projectId as string) ?? 0) > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#005BFF] px-1 text-[9px] font-bold text-white">
                          {unreadByThread.get(t.projectId as string)}
                        </span>
                      )}
                    </div>
                    {/* Nome do técnico responsável ou texto padrão */}
                    <p className="truncate text-[10px] text-[#5D6475]">{t.technicianName ?? 'Técnico responsável'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── PAINEL DIREITO: THREAD ATIVA ─────────────────────
              No mobile aparece quando mobileShowThread = true.
              No desktop sempre visível (sm:flex). */}
          <div className={`flex-1 flex-col overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white shadow-[0_20px_70px_rgba(11,16,32,0.06)] sm:flex ${mobileShowThread ? 'flex' : 'hidden'}`}>

            {/* Cabeçalho da thread: botão voltar (mobile), indicador online, título e técnico */}
            <div className="flex items-center gap-3 border-b border-[#E3E7F0] px-5 py-3.5">
              {/* Botão voltar — só aparece no mobile */}
              <button type="button" onClick={() => setMobileShowThread(false)}
                className="shrink-0 rounded-lg p-1 text-[#5D6475] hover:bg-[#F7F8FC] hover:text-[#0B1020] transition-colors sm:hidden"
                aria-label="Voltar pra lista de conversas">
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
              {/* Ponto verde de status online */}
              <div className="h-2 w-2 shrink-0 rounded-full bg-[#10B981]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {/* Título da thread ou "Suporte geral" */}
                <p className="truncate text-sm font-bold text-[#0B1020]">
                  {activeThread ? activeThread.projectTitle : 'Suporte geral'}
                </p>
                {/* Técnico responsável ou "Equipe LOBBY" para suporte geral */}
                <p className="truncate text-[11px] text-[#5D6475]">
                  {activeThread ? (activeThread.technicianName ?? 'Técnico responsável') : 'Equipe LOBBY'}
                </p>
              </div>
            </div>

            {/* Área de mensagens com scroll vertical */}
            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
              {threadMessages.length === 0 ? (
                /* Estado vazio da thread — convida a iniciar a conversa */
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.08), rgba(123,44,255,0.08))' }}>
                    <MessageCircle size={26} style={{ color: '#005BFF' }} />
                  </div>
                  <div>
                    <p className="text-base font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      Inicie uma conversa
                    </p>
                    <p className="mt-1 max-w-xs text-sm text-[#5D6475]">
                      {activeThread
                        ? `Fale com ${activeThread.technicianName ?? 'o técnico responsável'} sobre o projeto "${activeThread.projectTitle}".`
                        : 'Tire dúvidas gerais ou fale com a equipe antes de ter um projeto em andamento.'}
                    </p>
                  </div>
                </div>
              ) : (
                /* Lista de mensagens agrupadas por dia */
                <div className="space-y-6">
                  {groups.map(group => (
                    <div key={group.date}>
                      {/* Separador de data centralizado */}
                      <div className="mb-4 flex items-center justify-center">
                        <span className="rounded-full bg-[#F7F8FC] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#5D6475]">
                          {group.date}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {group.items.map(m => {
                          const mine = m.sender_role === 'client' // true = mensagem do cliente
                          return (
                            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                              className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                              <div className={`flex max-w-[75%] items-end gap-2 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                                {/* Avatar do técnico com ícone de ferramenta (só aparece em mensagens do técnico) */}
                                {!mine && (
                                  <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0B1020]">
                                    <Wrench size={12} className="text-white" />
                                  </div>
                                )}
                                <div>
                                  {/* Bolha da mensagem — azul/roxo para o cliente, cinza para o técnico */}
                                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                    mine
                                      ? 'rounded-br-md bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white'
                                      : 'rounded-bl-md border border-[#E3E7F0] bg-[#F7F8FC] text-[#0B1020]'
                                  }`}>
                                    {m.content}
                                  </div>
                                  {/* Horário e checkmark de leitura (apenas para mensagens do cliente) */}
                                  <div className={`mt-1 flex items-center gap-1 px-1 text-[10px] text-[#5D6475] ${mine ? 'justify-end' : 'justify-start'}`}>
                                    {timeLabel(m.created_at)}
                                    {/* Double-check azul indica que o técnico leu a mensagem */}
                                    {mine && m.read_at && <CheckCheck size={11} className="text-[#005BFF]" />}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {/* Typing indicator — aparece quando o técnico está digitando */}
                  {peerTyping && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[#E3E7F0] bg-[#F7F8FC] px-4 py-2.5">
                        <div className="flex gap-0.5">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5D6475]" style={{ animationDelay: '0ms' }} aria-hidden="true" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5D6475]" style={{ animationDelay: '150ms' }} aria-hidden="true" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5D6475]" style={{ animationDelay: '300ms' }} aria-hidden="true" />
                        </div>
                        <span className="text-[11px] text-[#5D6475]">Equipe LOBBY está digitando</span>
                      </div>
                    </div>
                  )}
                  {/* Âncora invisível para auto-scroll ao fundo */}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Input de envio de mensagem */}
            <form onSubmit={handleSend} className="flex items-center gap-3 border-t border-[#E3E7F0] p-4">
              <input
                type="text"
                placeholder="Digite sua mensagem..."
                value={text}
                onChange={e => handleTextChange(e.target.value)}
                className="h-12 flex-1 rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC] px-4 text-sm text-[#0B1020] placeholder:text-[#5D6475]/50 outline-none focus:border-[#005BFF]/40 focus:ring-4 focus:ring-[#005BFF]/10 transition-all"
              />
              {/* Botão de envio — desabilitado enquanto envia ou texto vazio */}
              <button type="submit" disabled={sending || !text.trim()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_8px_24px_rgba(0,91,255,0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0">
                {/* Spinner durante envio, ícone de avião quando idle */}
                {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            </form>
          </div>
        </div>
    </div>
  )
}
