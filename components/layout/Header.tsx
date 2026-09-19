'use client'

// Hooks do React — estado, efeitos, refs e memoização de callbacks
import { useState, useEffect, startTransition, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
// usePathname: rota atual (destacar item ativo e esconder header em /dashboard e /admin)
// useRouter: redirecionar após busca ou logout
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X, LayoutDashboard, LogOut, Search } from 'lucide-react'
// motion + AnimatePresence: animações de entrada/saída do menu mobile e overlay de busca
import { motion, AnimatePresence } from 'framer-motion'
// cn: utilitário para combinar classes Tailwind condicionalmente
import { cn } from '@/lib/utils'
import Container from './Container'
// Cliente Supabase: detecta sessão ativa para exibir estado correto no header
import { createClient } from '@/lib/supabase'
import { getProfileRole } from '@/lib/services/role'

/* ── Itens de navegação do site público ──────────────────────────────────── */
const navItems = [
  { label: 'Home',     href: '/'         },
  { label: 'Soluções', href: '/solucoes' },
  { label: 'Projetos', href: '/projetos' },
  { label: 'Recursos', href: '/recursos' },
  { label: 'Sobre',    href: '/sobre'    },
]

export default function Header() {
  const router   = useRouter()
  const pathname = usePathname()

  // true quando o usuário rolou mais de 10px — aplica sombra e fundo mais opaco
  const [isScrolled,    setIsScrolled]    = useState(false)
  // Controla abertura/fechamento do menu hambúrguer no mobile
  const [isMobileOpen,  setIsMobileOpen]  = useState(false)
  // Dados do usuário autenticado (null = não logado)
  const [user,          setUser]          = useState<{ email: string; name?: string } | null>(null)
  // Role do usuário logado — usada para apontar o link "Dashboard" direto para
  // /admin quando é técnico, evitando depender do redirect de proxy.ts (que
  // interrompe a navegação client-side e cai no fallback de browser navigation)
  const [role,          setRole]          = useState<string | undefined>(undefined)
  // false enquanto o estado de autenticação ainda não foi determinado
  // Evita piscar botões de "Entrar/Sair" antes de saber se há sessão ativa
  const [authReady,     setAuthReady]     = useState(false)
  // Controla visibilidade do overlay de busca global
  const [showSearch,    setShowSearch]    = useState(false)
  // Valor atual do campo de busca
  const [searchTerm,    setSearchTerm]    = useState('')
  // Ref para focar o input de busca assim que o overlay abre
  const searchInputRef = useRef<HTMLInputElement>(null)

  /* ── Abre overlay de busca e foca o input imediatamente ─────────────────── */
  // useCallback evita recriar a função a cada render (usada em múltiplos lugares)
  const openSearch = useCallback(() => {
    setShowSearch(true)
    setTimeout(() => searchInputRef.current?.focus(), 50) // pequeno delay para garantir montagem
  }, [])

  /* ── Fecha overlay de busca e limpa o termo digitado ────────────────────── */
  const closeSearch = useCallback(() => {
    setShowSearch(false)
    setSearchTerm('')
  }, [])

  /* ── Executa a busca: redireciona para /busca?q=<termo> ─────────────────── */
  const handleSearch = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const term = searchTerm.trim()
    if (!term) return
    router.push(`/busca?q=${encodeURIComponent(term)}`)
    closeSearch()
  }, [searchTerm, router, closeSearch])

  /* ── Efeito de scroll: detecta se a página foi rolada ───────────────────── */
  // Adiciona/remove classe de fundo ao header conforme posição vertical da página
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  /* ── Fecha o menu mobile ao mudar de rota ───────────────────────────────── */
  // startTransition: marca como atualização não urgente para não bloquear navegação
  useEffect(() => {
    startTransition(() => setIsMobileOpen(false))
  }, [pathname])

  /* ── Estado de autenticação via Supabase ────────────────────────────────
     onAuthStateChange dispara imediatamente com a sessão atual na montagem,
     eliminando a necessidade de chamar getSession() separadamente.          */
  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          email: session.user.email || '',
          name:  (session.user.user_metadata?.full_name as string) || '',
        })
        getProfileRole(supabase, session.user.id).then(setRole)
      } else {
        setUser(null) // sem sessão ativa
        setRole(undefined)
      }
      setAuthReady(true) // libera renderização dos botões de auth
    })

    // Cancela a inscrição ao desmontar o componente
    return () => subscription.unsubscribe()
  }, [])

  /* ── Logout: encerra sessão e redireciona para a home ───────────────────── */
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    router.push('/')
    router.refresh() // força o servidor a limpar cache da sessão
  }

  /* ── Não renderiza o header dentro do dashboard ou admin ─────────────────── */
  // Esses layouts têm seus próprios headers (DashboardShell / AdminShell)
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) return null

  // Inicial para o avatar circular: primeiro caractere do nome ou e-mail
  const initial = user?.name?.charAt(0).toUpperCase()
    || user?.email?.charAt(0).toUpperCase()
    || '?'

  // Técnico vai direto para /admin; cliente (ou role ainda não carregada) vai para /dashboard
  const dashboardHref = role === 'technician' ? '/admin' : '/dashboard'

  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-50 transition-all duration-300',
        // Com scroll: borda + sombra suave; sem scroll: borda mais transparente
        isScrolled
          ? 'border-b border-[#E3E7F0] bg-white/95 shadow-sm backdrop-blur-md'
          : 'border-b border-[#E3E7F0]/60 bg-white/90 backdrop-blur-sm'
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between">

          {/* Logo: link para a home */}
          <Link href="/" className="group flex items-center gap-2">
            <div className="h-30 w-30 flex items-center justify-center overflow-hidden rounded-lg">
              <Image
                src="/logowhite.svg"
                alt="Logo Lobby"
                width={112}
                height={112}
                className="h-full w-full object-contain"
                priority
              />
            </div>
          </Link>

          {/* Navegação desktop — oculta em mobile (md:flex) */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              // Rota "/" usa correspondência exata; demais usam startsWith
              const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-[#005BFF]' : 'text-[#5D6475] hover:text-[#0B1020]'
                  )}
                >
                  {item.label}
                  {/* Barra animada sob o item ativo — compartilha layoutId para
                      mover suavemente entre items via Framer Motion */}
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full lobby-gradient"
                    />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* CTAs do lado direito — desktop apenas (md:flex) */}
          <div className="hidden items-center gap-2 md:flex">
            {/* Botão de busca — abre o overlay de busca global */}
            <button
              type="button"
              onClick={openSearch}
              aria-label="Buscar"
              className="flex items-center gap-1.5 rounded-lg border border-[#E3E7F0] px-3 py-2 text-sm font-medium text-[#5D6475] transition-colors hover:border-[#005BFF]/30 hover:text-[#005BFF]"
            >
              <Search size={15} aria-hidden="true" />
              <span className="hidden lg:block">Buscar</span>
            </button>

            {/* Renderiza nada enquanto authReady=false para evitar flash de UI incorreta */}
            {authReady && (
              user ? (
                /* ── Usuário logado: mostra Dashboard + Avatar + Sair ─────── */
                <>
                  <Link
                    href={dashboardHref}
                    className="flex items-center gap-2 rounded-lg border border-[#E3E7F0] px-4 py-2 text-sm font-medium text-[#5D6475] transition-colors hover:border-[#005BFF]/30 hover:text-[#005BFF]"
                  >
                    <LayoutDashboard size={15} aria-hidden="true" />
                    Dashboard
                  </Link>

                  <div className="flex items-center gap-2.5 border-l border-[#E3E7F0] pl-3">
                    {/* Avatar circular com inicial do usuário */}
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white lobby-gradient shadow-sm"
                      title={user.name || user.email}
                    >
                      {initial}
                    </div>

                    {/* Botão de logout */}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[#5D6475] transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <LogOut size={14} aria-hidden="true" />
                      Sair
                    </button>
                  </div>
                </>
              ) : (
                /* ── Usuário não logado: mostra Entrar + Começar agora ───── */
                <>
                  <Link
                    href="/login"
                    className="rounded-lg border border-[#E3E7F0] px-4 py-2 text-sm font-medium text-[#5D6475] transition-colors hover:border-[#005BFF]/30 hover:text-[#0B1020]"
                  >
                    Entrar
                  </Link>
                  <Link
                    href="/cadastro"
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white lobby-gradient transition-opacity hover:opacity-90"
                  >
                    Começar agora
                  </Link>
                </>
              )
            )}
          </div>

          {/* Mobile: ícone de busca + botão hambúrguer (ocultos em md+) */}
          <div className="flex items-center gap-1 md:hidden">
            <button type="button" onClick={openSearch} aria-label="Buscar"
              className="rounded-lg p-2 text-[#5D6475] transition-colors hover:bg-[#F7F8FC] hover:text-[#005BFF]">
              <Search size={18} aria-hidden="true" />
            </button>
            <button
              className="rounded-lg p-2 text-[#5D6475] transition-colors hover:bg-[#F7F8FC] hover:text-[#0B1020]"
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              aria-label="Menu"
            >
              {/* Alterna entre hambúrguer e X */}
              {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </Container>

      {/* ── Overlay de busca global ─────────────────────────────────────────
          AnimatePresence gerencia a animação de entrada e saída do overlay   */}
      <AnimatePresence>
        {showSearch && (
          <>
            {/* Fundo escurecido: clicar fecha o overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[60] bg-[#0B1020]/60 backdrop-blur-sm"
              onClick={closeSearch}
              aria-hidden="true"
            />

            {/* Painel de busca: desliza de cima para baixo */}
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.2 }}
              className="fixed left-0 right-0 top-0 z-[70] border-b border-[#E3E7F0] bg-white/95 px-4 py-4 shadow-[0_8px_40px_rgba(11,16,32,0.14)] backdrop-blur-md"
              role="search"
              aria-label="Busca global"
            >
              <Container>
                {/* Formulário de busca: submit redireciona para /busca?q= */}
                <form onSubmit={handleSearch} className="flex items-center gap-3">
                  <Search size={20} className="shrink-0 text-[#005BFF]" aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    id="global-search"
                    name="q"
                    type="search"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar projetos, materiais, soluções..."
                    className="flex-1 bg-transparent text-base font-medium text-[#0B1020] placeholder:text-[#5D6475]/60 outline-none"
                    onKeyDown={e => e.key === 'Escape' && closeSearch()} // ESC fecha o overlay
                  />
                  {/* Botão "Buscar" só aparece quando há texto digitado */}
                  {searchTerm && (
                    <button type="submit"
                      className="rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5">
                      Buscar
                    </button>
                  )}
                  {/* Botão X para fechar o overlay de busca */}
                  <button type="button" onClick={closeSearch} aria-label="Fechar busca"
                    className="rounded-lg p-1.5 text-[#5D6475] transition-colors hover:bg-[#F7F8FC] hover:text-[#0B1020]">
                    <X size={18} aria-hidden="true" />
                  </button>
                </form>

                {/* Sugestões rápidas: clicar preenche o campo e mantém foco */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs text-[#5D6475]">Sugestões:</span>
                  {['Software', 'Automação', 'Dados', 'Cibersegurança', 'Dashboard'].map(s => (
                    <button key={s} type="button"
                      onClick={() => { setSearchTerm(s); searchInputRef.current?.focus() }}
                      className="rounded-full border border-[#E3E7F0] bg-[#F7F8FC] px-3 py-1 text-xs font-medium text-[#5D6475] transition-colors hover:border-[#005BFF]/30 hover:text-[#005BFF]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Container>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Menu mobile: expande abaixo do header ao clicar no hambúrguer ──── */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="border-t border-[#E3E7F0] bg-white md:hidden"
          >
            <Container>
              <nav className="flex flex-col gap-1 py-4">
                {/* Links de navegação no mobile */}
                {navItems.map((item) => {
                  const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-[#005BFF]/5 text-[#005BFF]'
                          : 'text-[#5D6475] hover:bg-[#F7F8FC] hover:text-[#0B1020]'
                      )}
                    >
                      {item.label}
                    </Link>
                  )
                })}

                {/* Seção de autenticação no menu mobile */}
                <div className="mt-2 flex flex-col gap-2 border-t border-[#E3E7F0] pt-3">
                  {/* Aguarda authReady para não piscar botões incorretos */}
                  {authReady && (
                    user ? (
                      /* ── Mobile: usuário logado ── */
                      <>
                        {/* Info do usuário: avatar + nome + e-mail */}
                        <div className="flex items-center gap-3 px-4 py-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white lobby-gradient">
                            {initial}
                          </div>
                          <div>
                            {user.name && (
                              <p className="text-sm font-semibold text-[#0B1020]">{user.name}</p>
                            )}
                            <p className="text-xs text-[#5D6475]">{user.email}</p>
                          </div>
                        </div>

                        {/* Link para o dashboard — /admin se técnico, /dashboard se cliente */}
                        <Link
                          href={dashboardHref}
                          className="flex items-center gap-2 rounded-lg border border-[#E3E7F0] px-4 py-3 text-sm font-medium text-[#0B1020] transition-colors hover:border-[#005BFF]/30"
                        >
                          <LayoutDashboard size={15} aria-hidden="true" />
                          Meu dashboard
                        </Link>

                        {/* Botão de logout no mobile */}
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
                        >
                          <LogOut size={15} aria-hidden="true" />
                          Sair da conta
                        </button>
                      </>
                    ) : (
                      /* ── Mobile: usuário não logado ── */
                      <>
                        <Link
                          href="/login"
                          className="rounded-lg border border-[#E3E7F0] px-4 py-3 text-center text-sm font-medium text-[#5D6475] transition-colors hover:border-[#005BFF]/30"
                        >
                          Entrar
                        </Link>
                        <Link
                          href="/cadastro"
                          className="rounded-lg px-4 py-3 text-center text-sm font-semibold text-white lobby-gradient transition-opacity hover:opacity-90"
                        >
                          Começar agora
                        </Link>
                      </>
                    )
                  )}
                </div>
              </nav>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
