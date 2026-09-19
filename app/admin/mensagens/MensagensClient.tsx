'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Send, Loader2, MessageCircle, Search, CheckCheck,
  LifeBuoy, FolderKanban, ArrowLeft, ChevronUp,
} from 'lucide-react'
import AdminShell from '@/components/layout/AdminShell'
import { createClient } from '@/lib/supabase'
import { setTypingStatus, GENERAL_THREAD_ID, type TypingStatusRow } from '@/lib/typing-status'
import { timeLabel, relTime, dateLabel } from '@/lib/messages-utils'
import type { ChatMessage } from '@/types'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientInfo {
  id: string
  full_name?: string
  email?: string
  company_name?: string
}

// One row per (client_id, project_id) thread — returned by get_thread_summaries().
interface ThreadSummary {
  client_id:        string
  project_id:       string | null
  client_name:      string | null
  client_email:     string | null
  client_company:   string | null
  project_title:    string | null
  last_content:     string
  last_at:          string
  last_sender_role: string
  unread_count:     number
}

interface Props {
  user:    SupabaseUser
  profile: { full_name?: string; is_leader?: boolean } | null
}

const PAGE_SIZE = 50

// ── Component ─────────────────────────────────────────────────────────────────

export default function MensagensClient({ user, profile }: Props) {

  // ── Data state ──────────────────────────────────────────────────────────────

  // Thread summaries for the sidebar (from get_thread_summaries RPC)
  const [conversations, setConversations] = useState<ThreadSummary[]>([])

  // Client profiles for "start new conversation" feature
  const [clientsMap, setClientsMap] = useState<Record<string, ClientInfo>>({})

  // Messages for the currently open thread (lazy-loaded, paginated)
  const [threadMsgs, setThreadMsgs] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore]       = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Só o setter é usado — a leitura real vem de msgOffsetRef (evita closures
  // obsoletas nos callbacks Realtime); o valor de estado em si nunca é lido.
  const [, setMsgOffset]            = useState(0)

  // Refs to avoid stale closures in Realtime callbacks and scroll handlers
  const msgOffsetRef         = useRef(0)
  const hasMoreRef           = useRef(false)
  const selectedClientRef    = useRef<string | null>(null)
  const selectedProjectRef   = useRef<string | null>(null)

  // ── UI state ────────────────────────────────────────────────────────────────

  const searchParams = useSearchParams()
  const [selectedClient,  setSelectedClient]  = useState<string | null>(() => searchParams.get('client'))
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [search,          setSearch]          = useState('')
  const [text,            setText]            = useState('')
  const [sending,         setSending]         = useState(false)
  const [loading,         setLoading]         = useState(true)
  const [sendError,       setSendError]       = useState('')
  const [mobileShowThread, setMobileShowThread] = useState(false)

  // ── Refs ────────────────────────────────────────────────────────────────────

  const sbRef              = useRef(createClient())
  const bottomRef          = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Typing indicator — tabela public.typing_status + postgres_changes (ver
  // comentário equivalente em app/dashboard/mensagens/MensagensClient.tsx).
  const typingWatchRef    = useRef<RealtimeChannel | null>(null)
  const typingTimerRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const typingWatchdogRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [peerTyping, setPeerTyping] = useState(false)

  // Reset the stale peer-typing flag as soon as the thread target changes, during
  // render (not in an effect) so there's no extra commit showing the old value.
  const typingTarget = selectedClient ? `${selectedClient}:${selectedProject ?? 'general'}` : null
  const [prevTypingTarget, setPrevTypingTarget] = useState(typingTarget)
  if (typingTarget !== prevTypingTarget) {
    setPrevTypingTarget(typingTarget)
    if (peerTyping) setPeerTyping(false)
  }

  // Keep refs in sync with state for use in callbacks
  useEffect(() => { selectedClientRef.current  = selectedClient  }, [selectedClient])
  useEffect(() => { selectedProjectRef.current = selectedProject }, [selectedProject])

  // ── Typing indicator ────────────────────────────────────────────────────────

  const stopTyping = useCallback(() => {
    if (!selectedClient) return
    setTypingStatus(sbRef.current, selectedClient, selectedProject, 'technician', false)
  }, [selectedClient, selectedProject])

  const handleTextChange = useCallback((val: string) => {
    setText(val)
    if (!selectedClient) return
    if (val.trim()) {
      setTypingStatus(sbRef.current, selectedClient, selectedProject, 'technician', true)
      clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(stopTyping, 2000)
    } else {
      clearTimeout(typingTimerRef.current)
      stopTyping()
    }
  }, [stopTyping, selectedClient, selectedProject])

  // Observa a linha role='client' desta thread — watchdog local (ver
  // comentário equivalente em app/dashboard/mensagens/MensagensClient.tsx)
  // porque a tabela não limpa sozinha em caso de queda de conexão.
  useEffect(() => {
    const sb = sbRef.current
    if (typingWatchRef.current) sb.removeChannel(typingWatchRef.current)
    clearTimeout(typingWatchdogRef.current)
    if (!selectedClient) return

    const targetProject = selectedProject ?? GENERAL_THREAD_ID
    const ch = sb
      .channel(`typing-watch-${selectedClient}`)
      .on<TypingStatusRow>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'typing_status', filter: `client_id=eq.${selectedClient}` },
        (payload) => {
          const row = payload.new as Partial<TypingStatusRow>
          if (row.role !== 'client' || row.project_id !== targetProject) return
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
      setTypingStatus(sb, selectedClient, selectedProject, 'technician', false)
      sb.removeChannel(ch)
    }
  }, [selectedClient, selectedProject])

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    const { data } = await sbRef.current.rpc('get_thread_summaries')
    if (data) setConversations(data as ThreadSummary[])
  }, [])

  const fetchThreadMessages = useCallback(async (
    clientId: string,
    projectId: string | null,
    reset: boolean,
  ) => {
    const off = reset ? 0 : msgOffsetRef.current
    if (!reset && !hasMoreRef.current) return

    if (reset) setThreadMsgs([])
    setLoadingMore(true)

    const sb   = sbRef.current
    const base = sb
      .from('messages')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .range(off, off + PAGE_SIZE - 1)

    const { data: msgs } = await (
      projectId === null
        ? base.is('project_id', null)
        : base.eq('project_id', projectId)
    )

    if (msgs) {
      const sorted = (msgs as ChatMessage[]).reverse() // desc → asc for display
      setThreadMsgs(prev => reset ? sorted : [...sorted, ...prev])
      const newOff = off + msgs.length
      setMsgOffset(newOff)
      msgOffsetRef.current = newOff
      const more = msgs.length === PAGE_SIZE
      setHasMore(more)
      hasMoreRef.current = more
    }
    setLoadingMore(false)
  }, [])

  // Initial load: thread summaries + client profiles (for new-conversation search)
  const fetchAll = useCallback(async () => {
    const sb = sbRef.current
    await fetchConversations()
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, full_name, email, company_name')
      .or('role.eq.client,role.is.null')
      .order('full_name', { ascending: true })
    if (profiles) setClientsMap(Object.fromEntries(profiles.map(p => [p.id, p as ClientInfo])))
    setLoading(false)
  }, [fetchConversations])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Realtime ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const sb = sbRef.current
    const channel = sb
      .channel('admin-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as ChatMessage
        // Append to active thread if it matches
        if (
          row.client_id === selectedClientRef.current &&
          (row.project_id ?? null) === selectedProjectRef.current
        ) {
          setThreadMsgs(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row])
        }
        // Refresh conversation list so summary and unread count stay accurate
        fetchConversations()
        // Ensure client is in map for newClientMatches
        setClientsMap(prev => {
          if (prev[row.client_id]) return prev
          sb.from('profiles')
            .select('id, full_name, email, company_name')
            .eq('id', row.client_id)
            .single()
            .then(({ data }) => {
              if (data) setClientsMap(p => ({ ...p, [row.client_id]: data as ClientInfo }))
            })
          return prev
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as ChatMessage
        setThreadMsgs(prev => prev.map(m => m.id === row.id ? row : m))
        // Update unread count in sidebar when read_at is set
        if (row.read_at && row.sender_role === 'client') {
          setConversations(prev => prev.map(c =>
            c.client_id === row.client_id &&
            (c.project_id ?? null) === (row.project_id ?? null)
              ? { ...c, unread_count: Math.max(0, c.unread_count - 1) }
              : c
          ))
        }
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [fetchConversations])

  // ── Scroll ───────────────────────────────────────────────────────────────────

  // Auto-scroll to bottom when thread opens or new message arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedClient, selectedProject, threadMsgs])

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el || loadingMore || !hasMoreRef.current || !selectedClientRef.current) return
    if (el.scrollTop < 80) {
      const prevH = el.scrollHeight
      fetchThreadMessages(selectedClientRef.current, selectedProjectRef.current, false)
        .then(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight - prevH
          }
        })
    }
  }, [loadingMore, fetchThreadMessages])

  // ── Mark as read ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedClient) return
    const unread = threadMsgs.filter(m => m.sender_role === 'client' && !m.read_at)
    if (unread.length === 0) return
    sbRef.current
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unread.map(m => m.id))
      .then(() => {
        const now = new Date().toISOString()
        setThreadMsgs(prev => prev.map(m =>
          unread.some(u => u.id === m.id) ? { ...m, read_at: now } : m
        ))
        setConversations(prev => prev.map(c =>
          c.client_id === selectedClient &&
          (c.project_id ?? null) === selectedProject
            ? { ...c, unread_count: 0 }
            : c
        ))
        window.dispatchEvent(new CustomEvent('lobby:messages-read'))
      })
  }, [selectedClient, selectedProject, threadMsgs])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const openConversation = useCallback((clientId: string, projectId: string | null) => {
    setSelectedClient(clientId)
    setSelectedProject(projectId)
    setMobileShowThread(true)
    setMsgOffset(0)
    msgOffsetRef.current = 0
    setHasMore(false)
    hasMoreRef.current = false
    fetchThreadMessages(clientId, projectId, true)
  }, [fetchThreadMessages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content || !selectedClient) return
    setSending(true)
    setText('')
    setSendError('')
    try {
      const { data, error } = await sbRef.current
        .from('messages')
        .insert({
          client_id:     selectedClient,
          sender_id:     user.id,
          sender_role:   'technician',
          technician_id: user.id,
          project_id:    selectedProject,
          content,
        })
        .select('*')
        .single()
      if (error) throw error
      const row = data as ChatMessage
      setThreadMsgs(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row])
      // Update conversation last_content in sidebar
      setConversations(prev =>
        prev.map(c =>
          c.client_id === selectedClient && (c.project_id ?? null) === selectedProject
            ? { ...c, last_content: content, last_at: row.created_at, last_sender_role: 'technician' }
            : c
        ).sort((a, b) => +new Date(b.last_at) - +new Date(a.last_at))
      )
      fetch('/api/notify/message', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message_id: row.id }),
      }).catch(() => {})
    } catch (err) {
      setText(content)
      setSendError(
        err instanceof Error && err.message.includes('row-level security')
          ? 'Você não é o técnico responsável por este projeto — só quem aceitou ou o líder pode responder aqui.'
          : (err instanceof Error ? err.message : 'Erro ao enviar mensagem.')
      )
    } finally {
      setSending(false)
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const filteredConvos = useMemo(() => conversations.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (c.client_name  ?? '').toLowerCase().includes(q) ||
      (c.client_email ?? '').toLowerCase().includes(q)
    )
  }), [conversations, search])

  const convoClientIds   = useMemo(() => new Set(conversations.map(c => c.client_id)), [conversations])
  const newClientMatches = useMemo(() => search
    ? Object.values(clientsMap)
        .filter(c => {
          if (convoClientIds.has(c.id)) return false
          const q = search.toLowerCase()
          return (
            (c.full_name    ?? '').toLowerCase().includes(q) ||
            (c.email        ?? '').toLowerCase().includes(q) ||
            (c.company_name ?? '').toLowerCase().includes(q)
          )
        })
        .slice(0, 8)
    : [], [clientsMap, convoClientIds, search])

  // Info for the thread header — prefer data from the conversation summary
  const activeConvo = useMemo(() =>
    selectedClient
      ? conversations.find(c =>
          c.client_id === selectedClient &&
          (c.project_id ?? null) === selectedProject
        ) ?? null
      : null,
    [conversations, selectedClient, selectedProject]
  )
  const activeClientInfo = selectedClient ? (clientsMap[selectedClient] ?? null) : null
  const displayName = activeConvo?.client_name ?? activeClientInfo?.full_name ?? activeConvo?.client_email ?? activeClientInfo?.email ?? 'Cliente'
  const displayAvatar = displayName.charAt(0).toUpperCase()

  // Group active thread messages by day for date separators
  const groups: { date: string; items: ChatMessage[] }[] = []
  threadMsgs.forEach(m => {
    const d    = dateLabel(m.created_at)
    const last = groups[groups.length - 1]
    if (last && last.date === d) last.items.push(m)
    else groups.push({ date: d, items: [m] })
  })

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <AdminShell user={user} profile={profile}>
      <div className="flex h-[calc(100vh-8rem)] gap-4">

        {/* ─── LEFT: CONVERSATION LIST ─── */}
        <div className={`w-full max-w-xs shrink-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] sm:flex ${mobileShowThread ? 'hidden' : 'flex'}`}>

          <div className="border-b border-white/[0.07] p-4">
            <h1 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Mensagens
            </h1>
            <div className="relative mt-3">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-3 text-xs text-white placeholder:text-white/25 outline-none focus:border-[#005BFF]/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 size={18} className="animate-spin text-white/30" />
              </div>
            ) : filteredConvos.length === 0 && newClientMatches.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <MessageCircle size={24} className="text-white/15" />
                <p className="text-xs text-white/30">
                  {search ? 'Nenhum cliente encontrado.' : 'Nenhuma conversa ainda.'}
                </p>
              </div>
            ) : (
              filteredConvos.map(c => {
                const isActive = selectedClient === c.client_id && selectedProject === c.project_id
                const avatar = (c.client_name ?? c.client_email ?? '?').charAt(0).toUpperCase()
                return (
                  <button
                    key={`${c.client_id}::${c.project_id ?? 'general'}`}
                    type="button"
                    onClick={() => openConversation(c.client_id, c.project_id)}
                    className={`flex w-full items-start gap-3 border-b border-white/[0.04] px-4 py-3 text-left transition-colors ${isActive ? 'bg-[#005BFF]/10' : 'hover:bg-white/[0.03]'}`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#005BFF] to-[#7B2CFF] text-xs font-bold text-white">
                      {avatar}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold text-white">
                          {c.client_name ?? c.client_email ?? 'Cliente'}
                        </p>
                        <span className="shrink-0 text-[10px] text-white/30">{relTime(c.last_at)}</span>
                      </div>

                      <div className="mt-0.5 flex min-w-0 items-center gap-1">
                        {c.project_title ? (
                          <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[#7B2CFF]/12 px-1.5 py-0.5 text-[9px] font-bold text-[#A78BFA]">
                            <FolderKanban size={8} aria-hidden="true" />{c.project_title}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-bold text-white/40">
                            <LifeBuoy size={8} aria-hidden="true" />Geral
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] text-white/40">{c.last_content}</p>
                        {c.unread_count > 0 && (
                          <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#005BFF] px-1 text-[9px] font-bold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}

            {newClientMatches.length > 0 && (
              <div className="border-t border-white/[0.06] px-4 py-2">
                <p className="mb-1 px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-white/25">
                  Iniciar nova conversa
                </p>
                {newClientMatches.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openConversation(c.id, null)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-white/60">
                      {(c.full_name ?? c.email ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{c.full_name ?? c.email}</p>
                      <p className="truncate text-[10px] text-white/35">
                        {c.email}{c.company_name ? ` · ${c.company_name}` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT: ACTIVE THREAD ─── */}
        <div className={`flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] sm:flex ${mobileShowThread ? 'flex' : 'hidden'}`}>

          {!selectedClient ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <MessageCircle size={32} className="text-white/15" />
              <p className="text-sm text-white/30">Selecione uma conversa para começar.</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => setMobileShowThread(false)}
                  className="shrink-0 rounded-lg p-1 text-white/40 hover:bg-white/[0.06] hover:text-white transition-colors sm:hidden"
                  aria-label="Voltar pra lista de conversas"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#005BFF] to-[#7B2CFF] text-xs font-bold text-white">
                  {displayAvatar}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{displayName}</p>
                  <p className="truncate text-[11px] text-white/35">
                    {activeConvo?.project_title
                      ? `Projeto: ${activeConvo.project_title}`
                      : 'Conversa geral'}
                  </p>
                </div>
              </div>

              {/* Messages area */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto px-5 py-5"
                onScroll={handleMessagesScroll}
              >
                {/* Load-older indicator at top */}
                {(hasMore || loadingMore) && (
                  <div className="flex justify-center pb-4">
                    {loadingMore ? (
                      <Loader2 size={14} className="animate-spin text-white/30" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => fetchThreadMessages(selectedClient, selectedProject, false)}
                        className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-white/40 hover:bg-white/[0.08] hover:text-white/60 transition-colors"
                      >
                        <ChevronUp size={12} aria-hidden="true" />
                        Carregar mensagens anteriores
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-6">
                  {groups.map(group => (
                    <div key={group.date}>
                      <div className="mb-4 flex items-center justify-center">
                        <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                          {group.date}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {group.items.map(m => {
                          const mine = m.sender_role === 'technician'
                          return (
                            <motion.div
                              key={m.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                            >
                              <div className="max-w-[70%]">
                                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                  mine
                                    ? 'rounded-br-md bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white'
                                    : 'rounded-bl-md border border-white/[0.08] bg-white/[0.04] text-white/90'
                                }`}>
                                  {m.content}
                                </div>
                                <div className={`mt-1 flex items-center gap-1 px-1 text-[10px] text-white/30 ${mine ? 'justify-end' : 'justify-start'}`}>
                                  {timeLabel(m.created_at)}
                                  {mine && m.read_at && <CheckCheck size={11} className="text-[#60A5FA]" />}
                                </div>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {peerTyping && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.04] px-4 py-2.5">
                        <div className="flex gap-0.5">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40" style={{ animationDelay: '0ms' }} aria-hidden="true" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40" style={{ animationDelay: '150ms' }} aria-hidden="true" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40" style={{ animationDelay: '300ms' }} aria-hidden="true" />
                        </div>
                        <span className="text-[11px] text-white/40">Cliente está digitando</span>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              </div>

              {sendError && (
                <p className="border-t border-white/[0.07] bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400">
                  {sendError}
                </p>
              )}

              <form
                onSubmit={handleSend}
                className={`flex items-center gap-3 ${sendError ? '' : 'border-t border-white/[0.07]'} p-4`}
              >
                <input
                  type="text"
                  placeholder="Digite sua resposta..."
                  value={text}
                  onChange={e => handleTextChange(e.target.value)}
                  className="h-11 flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#005BFF]/50"
                />
                <button
                  type="submit"
                  disabled={sending || !text.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] text-white shadow-[0_8px_24px_rgba(0,91,255,0.28)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  )
}
