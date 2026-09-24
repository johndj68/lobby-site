'use client'

// Hooks do React para estado, referências e efeitos colaterais
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
// usePathname: rota atual (para destacar item ativo na nav)
// useRouter: redirecionamento programático (ex.: após logout)
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, Download,
  LogOut, Menu, X, Bell, Settings, Wrench,
  FolderOpen, Plus, ExternalLink, Briefcase,
  CheckCheck, Clock, ArrowRight, Users, MessageCircle,
  UserPlus, Wallet, Coins, BarChart3, Contact, Store,
} from 'lucide-react'
// Cliente Supabase: autenticação e acesso ao banco de dados em tempo real
import { createClient } from '@/lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ── Tipos das notificações exibidas no painel do sino ───────────────────── */

// Notif: representa um novo contato/lead recebido via formulário
interface Notif {
  id:            string
  name:          string
  interest_area?: string // área de interesse preenchida no formulário
  created_at:    string
}

// Invite: convite para o técnico participar de um projeto de cliente
interface Invite {
  id:         string
  project_id: string
  title:      string  // título do projeto
  added_at:   string
}

/* ── Utilitário: converte data ISO em texto relativo ("2min atrás" etc.) ──── */
function notifTimeAgo(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60)    return 'agora'
  if (s < 3600)  return `${Math.floor(s / 60)}min atrás`
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`
  return `${Math.floor(s / 86400)}d atrás`
}

/* ── Tipagem das props do componente ─────────────────────────────────────── */
// user: usuário autenticado (técnico LOBBY)
// profile: dados adicionais — full_name, email e is_leader (líder vê mais itens)
// children: conteúdo da página admin renderizado dentro do shell
interface AdminShellProps {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  children: React.ReactNode
}

/* ── Itens de navegação padrão (todos os técnicos) ───────────────────────── */
const navItems = [
  { icon: LayoutDashboard, label: 'Visão geral',        href: '/admin'                      },
  { icon: MessageSquare,   label: 'Solicitações',       href: '/admin/solicitacoes'         },
  { icon: Store,           label: 'Marketplace',        href: '/admin/marketplace'          },
  { icon: Download,        label: 'Leads',              href: '/admin/leads'                },
  { icon: Briefcase,       label: 'Projetos',           href: '/admin/projetos'             },
  { icon: Users,           label: 'Proj. de clientes',  href: '/admin/projetos-clientes'    },
  { icon: MessageCircle,   label: 'Mensagens',          href: '/admin/mensagens'            },
  { icon: FolderOpen,      label: 'Arquivos',           href: '/admin/arquivos'             },
  { icon: Settings,        label: 'Configurações',      href: '/admin/configuracoes'        },
]

// Itens visíveis só pra técnico líder (profile.is_leader === true) —
// mesma restrição aplicada no servidor por requireLeaderSession.
const leaderNavItems = [
  { icon: Wallet,    label: 'Financeiro', href: '/admin/financeiro' },
  { icon: Coins,     label: 'Créditos',   href: '/admin/creditos'   },
  { icon: UserPlus,  label: 'Equipe',     href: '/admin/equipe'     },
  { icon: Contact,   label: 'Clientes',   href: '/admin/clientes'   },
  { icon: BarChart3, label: 'Relatórios', href: '/admin/relatorios' },
]

export default function AdminShell({ user, profile, children }: AdminShellProps) {
  const router    = useRouter()
  const pathname  = usePathname()

  // Estado da sidebar mobile (aberta/fechada)
  const [open,        setOpen]        = useState(false)
  // Controla a visibilidade do painel dropdown de notificações
  const [showNotifs,  setShowNotifs]  = useState(false)
  // Lista de novos contatos/leads aguardando atenção
  const [notifs,      setNotifs]      = useState<Notif[]>([])
  // Lista de convites de projeto pendentes para este técnico
  const [invites,     setInvites]     = useState<Invite[]>([])
  // Indicador de carregamento ao marcar notificações como lidas
  const [markingRead, setMarkingRead] = useState(false)
  // Contador de mensagens não lidas enviadas por clientes
  const [unreadMsgs,  setUnreadMsgs]  = useState(0)

  // Ref para detectar cliques fora do painel de notificações (fechar ao clicar fora)
  const notifRef = useRef<HTMLDivElement>(null)
  // createClient() memoized com useRef — evita recriar em cada re-render
  const supabaseRef = useRef(createClient())

  /* ── Mensagens não lidas enviadas por clientes ───────────────────────────
     Busca inicial + subscription Realtime + evento customizado de leitura   */
  useEffect(() => {
    const sb = supabaseRef.current

    // Conta mensagens onde remetente é cliente e ainda não foram lidas
    const fetchUnreadMsgs = () => {
      sb.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_role', 'client')
        .is('read_at', null)
        .then(({ count }) => setUnreadMsgs(count ?? 0))
    }
    fetchUnreadMsgs() // carregamento inicial

    // Canal Realtime: atualiza badge quando qualquer mensagem mudar
    const channel = sb
      .channel('admin-msg-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchUnreadMsgs)
      .subscribe()

    // Evento customizado: disparado pela página de mensagens ao marcar como lido
    window.addEventListener('lobby:messages-read', fetchUnreadMsgs)

    return () => {
      sb.removeChannel(channel)
      window.removeEventListener('lobby:messages-read', fetchUnreadMsgs)
    }
  }, [])

  /* ── Busca notificações de novos contatos/leads ──────────────────────────
     Dispara ao mudar de rota, mas com throttle de 60s para evitar excesso  */
  // Ref para controlar quando foi a última busca (evita fetch em toda navegação)
  const lastFetchRef = useRef<number>(0)

  useEffect(() => {
    const now = Date.now()
    // Só refetch se passaram mais de 60s desde a última busca
    if (now - lastFetchRef.current < 60_000) return
    lastFetchRef.current = now

    // Busca os 8 contatos mais recentes com status "novo"
    supabaseRef.current
      .from('contacts')
      .select('id, name, interest_area, created_at')
      .eq('status', 'novo')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => setNotifs(data ?? []))
  }, [pathname]) // re-avalia a cada mudança de rota

  /* ── Convites de projeto pendentes para este técnico ─────────────────────
     Busca em duas tabelas: client_project_team + client_projects (para o título) */
  useEffect(() => {
    const sb = supabaseRef.current

    const fetchInvites = async () => {
      // 1. Busca convites pendentes deste técnico
      const { data: rows } = await sb
        .from('client_project_team')
        .select('id, project_id, added_at')
        .eq('technician_id', user.id)
        .eq('status', 'pending')
      if (!rows || rows.length === 0) { setInvites([]); return }

      // 2. Busca os títulos dos projetos referenciados
      const ids = rows.map(r => r.project_id)
      const { data: projects } = await sb
        .from('client_projects').select('id, title').in('id', ids)
      if (!projects) return

      // 3. Monta um mapa { project_id → title } para lookup eficiente
      const titleMap = Object.fromEntries(projects.map(p => [p.id, p.title]))
      setInvites(rows.map(r => ({ id: r.id, project_id: r.project_id, title: titleMap[r.project_id] ?? 'Projeto', added_at: r.added_at })))
    }

    fetchInvites() // carregamento inicial

    // Realtime: atualiza lista de convites em tempo real
    const channel = sb
      .channel(`admin-invites-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'client_project_team', filter: `technician_id=eq.${user.id}` },
        fetchInvites
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [user.id])

  /* ── Fecha o painel de notificações ao clicar fora dele ─────────────────── */
  useEffect(() => {
    if (!showNotifs) return // só adiciona listener quando o painel está aberto
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showNotifs])

  /* ── Marca todas as notificações de contato como "em análise" ────────────
     Remove-as da lista local e fecha o painel após confirmar no banco       */
  const markAllRead = async () => {
    if (notifs.length === 0) return
    setMarkingRead(true)
    try {
      await supabaseRef.current
        .from('contacts')
        .update({ status: 'em_analise' })
        .in('id', notifs.map(n => n.id))
      setNotifs([])      // limpa a lista local
      setShowNotifs(false)
    } finally {
      setMarkingRead(false)
    }
  }

  // Primeiro nome para exibição, com fallback para prefixo do e-mail ou "Admin"
  const firstName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Admin'
  // Inicial maiúscula para o avatar circular
  const initial   = firstName.charAt(0).toUpperCase()

  /* ── Logout: encerra sessão e redireciona para o login admin ─────────────── */
  const handleLogout = async () => {
    await supabaseRef.current.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#070D1A] text-white">
      {/* Overlay escuro para mobile: fecha a sidebar ao clicar fora */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ─── SIDEBAR ESCURA (área técnica) ──────────────────────────────── */}
      {/* Cor mais escura que o fundo principal (#08101F vs #070D1A) para hierarquia visual */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-white/[0.08] bg-[#08101F] transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        aria-label="Painel técnico"
      >
        {/* Cabeçalho da sidebar: logo + label "Área técnica" */}
        <div className="flex flex-col gap-1 border-b border-white/[0.08] px-6 py-5">
          <Link href="/admin">
            <Image
              src="/logowhite.svg"
              alt="LOBBY"
              width={176}
              height={88}
              className="h-[56px] w-auto object-contain"
              priority
            />
          </Link>
          {/* Identificador da área técnica abaixo do logo */}
          <span className="flex items-center gap-1 text-[10px] font-medium text-white/35">
            <Wrench size={9} aria-hidden="true" />
            Área técnica
          </span>
        </div>

        {/* Área de navegação: scroll vertical caso itens excedam a altura */}
        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Navegação admin">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/25">
            Menu
          </p>
          <div className="space-y-0.5">
            {/* Mescla navItems comuns com leaderNavItems se o técnico for líder */}
            {(profile?.is_leader ? [...navItems, ...leaderNavItems] : navItems).map(({ icon: Icon, label, href }) => {
              // Para "/admin" usa correspondência exata; para subpáginas usa startsWith
              const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)} // fecha sidebar no mobile ao navegar
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[#005BFF]/20 text-[#60A5FA]'   // item ativo: azul claro
                      : 'text-white/45 hover:bg-white/[0.04] hover:text-white/85'
                  }`}
                >
                  {/* Barra azul vertical à esquerda para indicar item ativo */}
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#005BFF]"
                      aria-hidden="true"
                    />
                  )}
                  <Icon size={17} aria-hidden="true" />
                  {label}
                  {/* Badge de mensagens não lidas no item "Mensagens" */}
                  {href === '/admin/mensagens' && unreadMsgs > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">
                      {unreadMsgs > 9 ? '9+' : unreadMsgs}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Rodapé da sidebar: card do usuário + botão logout */}
        <div className="border-t border-white/[0.08] p-4 space-y-2">
          {/* Card com avatar, nome e status online do técnico */}
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-3 border border-white/[0.06]">
            {/* Avatar com inicial e gradiente LOBBY */}
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{firstName}</p>
              <p className="truncate text-[10px] text-white/35">Técnico LOBBY</p>
            </div>
            {/* Indicador de status online */}
            <span className="flex items-center gap-1 text-[9px] font-bold text-[#10B981]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" aria-hidden="true" />
              Online
            </span>
          </div>
          {/* Botão de logout: encerra sessão e vai para /admin/login */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut size={16} aria-hidden="true" />
            Sair
          </button>
        </div>
      </aside>

      {/* ─── ÁREA PRINCIPAL (conteúdo à direita da sidebar) ─────────────── */}
      {/* lg:pl-72 evita que o conteúdo fique sob a sidebar fixa em desktop */}
      <div className="lg:pl-72">
        {/* ─── HEADER FIXO DA ÁREA ADMIN ──────────────────────────────────── */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.08] bg-[#070D1A]/95 px-4 backdrop-blur sm:px-6">
          {/* Botão hambúrguer — visível apenas no mobile */}
          <button
            type="button"
            className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>

          {/* Espaçador: empurra controles para a direita */}
          <div className="flex-1" />

          {/* Controles do lado direito do header admin */}
          <div className="flex items-center gap-2">
            {/* Link para ver o site público em nova aba */}
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/50 transition-all hover:border-white/20 hover:text-white/80 sm:flex"
            >
              <ExternalLink size={12} aria-hidden="true" />
              Ver site
            </Link>

            {/* Atalho para a página de exportação de leads */}
            <Link
              href="/admin/leads"
              className="hidden items-center gap-1.5 rounded-xl border border-white/[0.10] bg-transparent px-3 py-1.5 text-xs font-semibold text-white/60 transition-all hover:border-white/20 hover:bg-white/[0.05] hover:text-white sm:flex"
            >
              <Download size={12} aria-hidden="true" />
              Exportar leads
            </Link>

            {/* Botão principal: nova solicitação com gradiente azul/roxo */}
            <Link
              href="/admin/solicitacoes"
              className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-3 py-1.5 text-xs font-bold text-white shadow-[0_4px_12px_rgba(0,91,255,0.30)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,91,255,0.40)] sm:flex"
            >
              <Plus size={13} aria-hidden="true" />
              Nova solicitação
            </Link>

            {/* Ícone de chat com badge de mensagens não lidas de clientes */}
            <Link
              href="/admin/mensagens"
              className="relative rounded-lg p-2 text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white"
              aria-label={unreadMsgs > 0 ? `${unreadMsgs} mensagens não lidas` : 'Mensagens'}
            >
              <MessageCircle size={17} aria-hidden="true" />
              {/* Badge vermelho só aparece quando há mensagens não lidas */}
              {unreadMsgs > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[8px] font-bold text-white" aria-hidden="true">
                  {unreadMsgs > 9 ? '9+' : unreadMsgs}
                </span>
              )}
            </Link>

            {/* ── Sino de notificações + painel dropdown ───────────────────── */}
            {/* ref={notifRef} permite detectar cliques fora do painel para fechá-lo */}
            <div className="relative" ref={notifRef}>
              {/* Botão do sino: soma notifs de contatos + convites de projeto */}
              <button
                type="button"
                onClick={() => setShowNotifs(v => !v)}
                aria-label={`${notifs.length + invites.length} notificações`}
                aria-expanded={showNotifs}
                className={`relative rounded-lg p-2 transition-colors hover:bg-white/[0.05] ${
                  showNotifs ? 'text-white bg-white/[0.05]' : 'text-white/40 hover:text-white'
                }`}
              >
                <Bell size={17} aria-hidden="true" />
                {/* Badge vermelho com contagem total de notificações pendentes */}
                {(notifs.length + invites.length) > 0 && (
                  <span
                    className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[8px] font-bold text-white"
                    aria-hidden="true"
                  >
                    {(notifs.length + invites.length) > 9 ? '9+' : (notifs.length + invites.length)}
                  </span>
                )}
              </button>

              {/* ── Painel dropdown de notificações ─────────────────────────── */}
              {showNotifs && (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0D1428] shadow-[0_24px_70px_rgba(0,0,0,0.50)]">
                  {/* Cabeçalho do painel: título + botão "Marcar lidas" */}
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Bell size={14} className="text-[#60A5FA]" aria-hidden="true" />
                      <span className="text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                        Notificações
                      </span>
                      {/* Exibe contagem de novos contatos */}
                      {notifs.length > 0 && (
                        <span className="rounded-full bg-[#EF4444]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#F87171]">
                          {notifs.length} novas
                        </span>
                      )}
                    </div>
                    {/* Botão para marcar todos os contatos como "em análise" */}
                    {notifs.length > 0 && (
                      <button
                        type="button"
                        disabled={markingRead}
                        onClick={markAllRead}
                        className="flex items-center gap-1 text-[11px] font-semibold text-[#60A5FA] transition-colors hover:text-white disabled:opacity-50"
                      >
                        <CheckCheck size={12} aria-hidden="true" />
                        {markingRead ? 'Marcando...' : 'Marcar lidas'}
                      </button>
                    )}
                  </div>

                  {/* Seção de convites de projeto pendentes */}
                  {invites.length > 0 && (
                    <>
                      {/* Cabeçalho da seção de convites */}
                      <div className="border-b border-white/[0.07] px-4 py-2 flex items-center gap-2">
                        <Users size={12} className="text-[#A78BFA]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#A78BFA]">
                          Convites de projeto ({invites.length})
                        </span>
                      </div>
                      {/* Lista de convites com título do projeto e tempo relativo, scroll máximo de 48px */}
                      <ul className="max-h-48 overflow-y-auto" role="list">
                        {invites.map(inv => (
                          <li key={inv.id} className="border-b border-white/[0.05]">
                            <Link
                              href="/admin/projetos-clientes"
                              onClick={() => setShowNotifs(false)}
                              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]"
                            >
                              {/* Ponto roxo indica convite de projeto */}
                              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#A78BFA]" aria-hidden="true" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-white">{inv.title}</p>
                                <p className="mt-0.5 text-[11px] text-white/40">Convite para participar do projeto</p>
                              </div>
                              {/* Tempo relativo desde o convite */}
                              <div className="flex shrink-0 items-center gap-1 text-[10px] text-white/30">
                                <Clock size={9} aria-hidden="true" />
                                {notifTimeAgo(inv.added_at)}
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {/* Estado vazio ou lista de novos contatos */}
                  {notifs.length === 0 && invites.length === 0 ? (
                    /* Estado vazio: nenhuma notificação pendente */
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <CheckCheck size={24} className="text-[#34D399]" aria-hidden="true" />
                      <p className="text-sm font-semibold text-white/60">Tudo em dia!</p>
                      <p className="text-xs text-white/30">Nenhuma notificação nova.</p>
                    </div>
                  ) : notifs.length > 0 ? (
                    /* Lista de novos contatos/leads com scroll máximo de 48px */
                    <ul className="max-h-48 overflow-y-auto" role="list">
                      {notifs.map(n => (
                        <li key={n.id} className="border-b border-white/[0.05] last:border-b-0">
                          <Link
                            href="/admin/solicitacoes"
                            onClick={() => setShowNotifs(false)}
                            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]"
                          >
                            {/* Ponto vermelho indica novo contato */}
                            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#EF4444]" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{n.name}</p>
                              {/* Área de interesse ou fallback "Solicitação geral" */}
                              <p className="mt-0.5 text-[11px] text-white/40">
                                {n.interest_area ?? 'Solicitação geral'}
                              </p>
                            </div>
                            {/* Tempo relativo desde o contato */}
                            <div className="flex shrink-0 items-center gap-1 text-[10px] text-white/30">
                              <Clock size={9} aria-hidden="true" />
                              {notifTimeAgo(n.created_at)}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {/* Rodapé do painel: link para ver todas as solicitações */}
                  <div className="border-t border-white/[0.07] px-4 py-2.5">
                    <Link
                      href="/admin/solicitacoes"
                      onClick={() => setShowNotifs(false)}
                      className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white/40 transition-colors hover:text-white"
                    >
                      Ver todas as solicitações
                      <ArrowRight size={11} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Área de conteúdo da página — recebe o children passado pelo layout de rota */}
        {/* min-h calcula altura mínima subtraindo o header de 4rem (64px) */}
        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
