'use client'

// Hooks do React para estado, referências e efeitos colaterais
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
// usePathname: descobre a rota atual para destacar o item ativo na nav
// useRouter: permite redirecionar o usuário (ex.: após logout)
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Download, FolderKanban, MessageSquarePlus,
  User, LogOut, Bell, Menu, X, Plus,
  ChevronDown, HelpCircle, Sparkles, ArrowRight, MessageCircle, Coins, History, LayoutGrid,
} from 'lucide-react'
// Cliente Supabase: autenticação e acesso ao banco de dados em tempo real
import { createClient } from '@/lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/* ── Tipagem das props que o componente recebe ────────────────────────────── */
// user: objeto do usuário autenticado (vem do servidor via session)
// profile: dados adicionais do perfil (nome, empresa) — pode ser nulo
// children: conteúdo da página que será renderizado dentro do shell
interface DashboardShellProps {
  user: SupabaseUser
  profile: { full_name?: string; company_name?: string } | null
  children: React.ReactNode
}

/* ── Itens de navegação da sidebar do cliente ─────────────────────────────── */
// Cada item tem: ícone Lucide, rótulo exibido e rota de destino
const navItems = [
  { icon: LayoutDashboard,   label: 'Dashboard',         href: '/dashboard'            },
  { icon: Download,          label: 'Meus downloads',    href: '/dashboard/downloads'  },
  { icon: FolderKanban,      label: 'Projetos',          href: '/dashboard/projetos'   },
  { icon: LayoutGrid,        label: 'Meus apps',         href: '/dashboard/meus-app', matchPrefix: true },
  { icon: History,           label: 'Histórico',         href: '/dashboard/historico'  },
  { icon: Coins,             label: 'Meus créditos',     href: '/dashboard/creditos'   },
  { icon: MessageCircle,     label: 'Mensagens',         href: '/dashboard/mensagens'  },
  { icon: MessageSquarePlus, label: 'Solicitar solução', href: '/contato'              },
  { icon: User,              label: 'Conta',             href: '/dashboard/conta'      },
  { icon: HelpCircle,        label: 'Suporte',           href: '/dashboard/suporte'    },
]

export default function DashboardShell({ user, profile, children }: DashboardShellProps) {
  const router      = useRouter()
  const pathname    = usePathname()
  // useRef evita recriar o cliente Supabase a cada re-render
  const supabaseRef = useRef(createClient())

  // Controla se a sidebar está aberta no mobile (colapsada por padrão)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Contador de mensagens não lidas — exibido no badge do sino e no item "Mensagens"
  const [unreadMsgs,  setUnreadMsgs]  = useState(0)
  // Saldo de créditos do cliente — null enquanto carrega, número após a busca
  const [credits, setCredits] = useState<number | null>(null)

  // Extrai o primeiro nome para exibição amigável no header
  // Fallback: prefixo do e-mail, ou "Usuário" se ambos forem indefinidos
  const firstName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Usuário'

  /* ── Logout: encerra a sessão e redireciona para a home ──────────────────── */
  const handleLogout = async () => {
    await supabaseRef.current.auth.signOut()
    router.push('/')
    router.refresh() // força o servidor a limpar o cache da sessão
  }

  /* ── Contador de mensagens não lidas enviadas pelo técnico ───────────────── */
  // Busca inicial + inscrição em tempo real via Supabase Realtime
  // Também escuta o evento customizado 'lobby:messages-read' para atualizar
  // imediatamente quando a página de mensagens marca as mensagens como lidas
  useEffect(() => {
    const sb = supabaseRef.current

    // Conta mensagens onde: cliente é o usuário atual, remetente é técnico, ainda não lidas
    const fetchUnread = () => {
      sb.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .eq('sender_role', 'technician')
        .is('read_at', null)
        .then(({ count }) => setUnreadMsgs(count ?? 0))
    }
    fetchUnread() // carregamento inicial

    // Canal Realtime: atualiza o badge sempre que uma mensagem for inserida/alterada
    const channel = sb
      .channel(`dash-msg-badge-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `client_id=eq.${user.id}` },
        fetchUnread
      )
      .subscribe()

    // Atualização instantânea quando a página de mensagens marca como lida
    window.addEventListener('lobby:messages-read', fetchUnread)

    // Limpeza: cancela a inscrição Realtime e remove o listener ao desmontar
    return () => {
      sb.removeChannel(channel)
      window.removeEventListener('lobby:messages-read', fetchUnread)
    }
  }, [user.id])

  /* ── Saldo de créditos do cliente ───────────────────────────────────────
     Busca o saldo atual na carteira do usuário para exibir no header.
     Atualiza via Realtime quando a carteira é modificada (compra ou uso de créditos). */
  useEffect(() => {
    const sb = supabaseRef.current

    const fetchCredits = () => {
      sb.from('client_credit_wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => setCredits(data?.balance ?? 0))
    }
    fetchCredits()

    // Realtime: atualiza o saldo quando a carteira sofre qualquer alteração
    const channel = sb
      .channel(`dash-credits-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'client_credit_wallets', filter: `user_id=eq.${user.id}` },
        fetchCredits
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [user.id])

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      {/* Overlay escuro para mobile: fecha a sidebar ao clicar fora */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ─── SIDEBAR ─────────────────────────────────────────── */}
      {/* Em mobile: desliza para fora (-translate-x-full) e entra com translate-x-0
          Em desktop (lg+): sempre visível via lg:translate-x-0 */}
      <aside
        data-testid="dashboard-sidebar"
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-[#E3E7F0] bg-white/95 backdrop-blur transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        aria-label="Navegação lateral"
      >
        {/* Área do logo */}
        <div className="border-b border-[#E3E7F0] px-6 py-5">
          <Link href="/" onClick={() => setSidebarOpen(false)}>
            <Image
              src="/logowhite.svg"
              alt="LOBBY"
              width={176}
              height={88}
              className="h-[56px] w-auto object-contain"
              priority
            />
          </Link>
        </div>

        {/* Área de navegação: scroll vertical caso os itens excedam a altura */}
        <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Menu principal">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#5D6475]">Menu</p>
          <div className="space-y-0.5">
            {/* Renderiza cada item de navegação */}
            {navItems.map(({ icon: Icon, label, href, matchPrefix }) => {
              // Compara a rota atual com o href para destacar o item ativo.
              // matchPrefix: item cobre uma área com sub-rotas (ex.: Meus
              // apps também ativo em /dashboard/meus-app/[id]) em vez de só
              // a rota exata.
              const isActive = matchPrefix ? pathname.startsWith(href) : pathname === href
              return (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setSidebarOpen(false)} // fecha sidebar no mobile ao navegar
                  aria-current={isActive ? 'page' : undefined} // acessibilidade
                  className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[#005BFF]/8 text-[#005BFF]'
                      : 'text-[#5D6475] hover:bg-[#F7F8FC] hover:text-[#0B1020]'
                  }`}
                >
                  {/* Barra azul vertical à esquerda indica o item ativo */}
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#005BFF]"
                      aria-hidden="true"
                    />
                  )}
                  <Icon size={17} aria-hidden="true" />
                  {label}
                  {/* Badge vermelho de mensagens não lidas — só aparece no item "Mensagens" */}
                  {href === '/dashboard/mensagens' && unreadMsgs > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">
                      {unreadMsgs > 9 ? '9+' : unreadMsgs}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Card de diagnóstico gratuito — CTA para o cliente solicitar análise */}
          <div className="mt-6 rounded-2xl border border-[#005BFF]/15 bg-gradient-to-br from-[#F0F4FF] to-[#EEF0FF] p-4">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#005BFF]" aria-hidden="true" />
              <p className="text-xs font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Diagnóstico gratuito ✨
              </p>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-[#5D6475]">
              Receba uma análise personalizada do seu negócio e descubra oportunidades de crescimento.
            </p>
            <Link
              href="/contato"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#005BFF] transition-all duration-150 hover:gap-2"
            >
              Solicitar agora <ArrowRight size={11} aria-hidden="true" />
            </Link>
          </div>
        </nav>

        {/* Rodapé da sidebar: suporte rápido + botão de logout */}
        <div className="border-t border-[#E3E7F0] p-4 space-y-2">
          {/* Card de suporte — atalho para abrir chat com a equipe */}
          <div className="rounded-xl bg-[#F7F8FC] p-3">
            <p className="text-xs font-semibold text-[#0B1020]">Precisa de ajuda?</p>
            <p className="mt-0.5 text-[11px] text-[#5D6475]">Fale com nosso time de especialistas.</p>
            <Link
              href="/contato"
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#7B2CFF] transition-all duration-150 hover:gap-2"
            >
              Abrir chat <ArrowRight size={10} aria-hidden="true" />
            </Link>
          </div>
          {/* Botão de logout: encerra sessão e redireciona para a home */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#5D6475] transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={17} aria-hidden="true" />
            Sair
          </button>
        </div>
      </aside>

      {/* ─── ÁREA PRINCIPAL (conteúdo à direita da sidebar) ─────────────── */}
      {/* lg:pl-72 empurra o conteúdo para não ficar sob a sidebar fixa */}
      <div className="lg:pl-72">

        {/* ─── HEADER FIXO DO DASHBOARD ──────────────────────────────────── */}
        {/* sticky top-0: fica fixo no topo ao rolar a página */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E3E7F0] bg-white/90 px-4 backdrop-blur sm:px-6">
          {/* Botão hambúrguer — visível apenas no mobile para abrir/fechar sidebar */}
          <button
            type="button"
            className="rounded-lg p-2 text-[#5D6475] transition-colors hover:bg-[#F7F8FC] hover:text-[#0B1020] lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Abrir menu"
          >
            {/* Alterna entre ícone de menu e X conforme estado da sidebar */}
            {sidebarOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>

          {/* Espaçador flexível: empurra os controles para a direita */}
          <div className="flex-1" />

          {/* Controles do lado direito do header */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Badge de créditos — link para /dashboard/creditos, oculto enquanto carrega */}
            {credits !== null && (
              <Link
                href="/dashboard/creditos"
                aria-label={`${credits} créditos disponíveis`}
                className="hidden items-center gap-1.5 rounded-xl border border-[#F59E0B]/30 bg-gradient-to-r from-[#FEF3C7] to-[#FDE68A] px-3 py-1.5 text-xs font-bold text-[#92400E] transition-all hover:border-[#F59E0B]/60 hover:shadow-[0_2px_12px_rgba(245,158,11,0.20)] sm:flex"
              >
                {/* Ícone de moeda com gradiente dourado */}
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}
                  aria-hidden="true"
                >
                  <Coins size={10} className="text-white" />
                </span>
                {credits} créditos
              </Link>
            )}

            {/* Botão de nova solicitação — oculto em telas muito pequenas */}
            <Link
              href="/contato"
              className="hidden items-center gap-1.5 rounded-xl border border-[#005BFF] px-3 py-1.5 text-xs font-semibold text-[#005BFF] transition-all hover:bg-[#005BFF] hover:text-white sm:flex"
            >
              <Plus size={13} aria-hidden="true" />
              Nova solicitação
            </Link>

            {/* Sino de notificações: exibe badge vermelho se há mensagens não lidas */}
            <Link
              href="/dashboard/mensagens"
              className="relative rounded-lg p-2 text-[#5D6475] transition-colors hover:bg-[#F7F8FC]"
              aria-label={unreadMsgs > 0 ? `${unreadMsgs} mensagens não lidas` : 'Mensagens'}
            >
              <Bell size={18} aria-hidden="true" />
              {/* Badge vermelho só aparece quando há mensagens não lidas */}
              {unreadMsgs > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[8px] font-bold text-white" aria-hidden="true">
                  {unreadMsgs > 9 ? '9+' : unreadMsgs}
                </span>
              )}
            </Link>

            {/* Avatar e nome do usuário logado */}
            <div className="flex items-center gap-2 border-l border-[#E3E7F0] pl-2 sm:pl-3">
              <div className="relative shrink-0">
                {/* Círculo com inicial do nome — gradiente azul LOBBY */}
                <div className="flex h-8 w-8 items-center justify-center rounded-full lobby-gradient text-xs font-bold text-white shadow-[0_2px_8px_rgba(0,91,255,0.30)]">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                {/* Indicador de status online (bolinha verde) */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#10B981]"
                  aria-label="Online"
                />
              </div>
              {/* Nome e status — ocultos em telas muito pequenas */}
              <div className="hidden flex-col sm:flex">
                <span className="text-xs font-semibold leading-tight text-[#0B1020]">{firstName}</span>
                <span className="text-[10px] font-medium text-[#10B981]">● Online</span>
              </div>
              <ChevronDown size={13} className="hidden text-[#5D6475] sm:block" aria-hidden="true" />
            </div>
          </div>
        </header>

        {/* Área de conteúdo da página — recebe o children passado pelo layout de rota */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>

        {/* Rodapé da área autenticada com links legais */}
        <footer className="border-t border-[#E3E7F0] px-6 py-4">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <p className="text-xs text-[#5D6475]">© 2025 LOBBY. Todos os direitos reservados.</p>
            <div className="flex gap-4">
              <Link href="/sobre#privacidade" className="text-xs text-[#5D6475] transition-colors hover:text-[#005BFF]">
                Política de Privacidade
              </Link>
              <Link href="/sobre#termos" className="text-xs text-[#5D6475] transition-colors hover:text-[#005BFF]">
                Termos de Uso
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
