'use client'

// Componente Client: gerencia filtros, paginação, auth e modais de download/compra
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Download, Gift, BookOpen, ShieldCheck,
  Grid2X2, Bot, BarChart3, Code2, Shield,
  Rocket, ArrowRight, Library,
} from 'lucide-react'
import Container from '@/components/layout/Container'
import CTASection from '@/components/sections/CTASection'
import dynamic from 'next/dynamic'
import ResourceCard from '@/components/cards/ResourceCard'
import Pagination from '@/components/ui/Pagination'

// Quantos recursos exibir por página na grade filtrada
const RESOURCES_PER_PAGE = 6

// Lazy load — modal só é mostrado após clique, não precisa estar no bundle inicial
// ssr: false porque dependem de APIs do browser (Supabase client-side, eventos)
const DownloadLeadForm    = dynamic(() => import('@/components/forms/DownloadLeadForm'), { ssr: false })
const EbookPurchaseModal  = dynamic(() => import('@/components/forms/EbookPurchaseModal'), { ssr: false })

import { resources as staticResources } from '@/lib/data'
import { createClient } from '@/lib/supabase'
import type { Resource } from '@/types'

/**
 * Quick benefits shown below the CTA buttons.
 * Tune: icon, title, desc
 */
// Benefícios exibidos abaixo dos CTAs do hero para reforçar a proposta de valor
const HERO_BENEFITS = [
  { icon: ShieldCheck, title: '100% gratuito',      desc: 'Sem custo, sem pegadinhas'   },
  { icon: Download,    title: 'Download imediato',   desc: 'Acesso rápido e fácil'        },
  { icon: BookOpen,    title: 'Conteúdo prático',    desc: 'Aplicável no seu dia a dia'   },
]

/**
 * Metrics bar below the hero visual.
 * Tune: value, label, color, colorBg, icon
 */
// Métricas de social proof exibidas abaixo do visual do hero (desktop)
const HERO_METRICS = [
  { icon: Library,  value: '6+',   label: 'Materiais', color: '#005BFF', colorBg: 'rgba(0,91,255,0.10)'   },
  { icon: Gift,     value: '100%', label: 'Gratuitos',  color: '#7B2CFF', colorBg: 'rgba(123,44,255,0.10)' },
  { icon: Download, value: '+1k',  label: 'Downloads',  color: '#16A34A', colorBg: 'rgba(22,163,74,0.10)'  },
]

/**
 * Floating material cards in the hero visual (desktop).
 * Tune: pos (Tailwind absolute classes), delay, color, icon, title, label
 */
// Mini cards flutuantes exibidos no visual do hero (apenas desktop)
// Cada um representa um material disponível na biblioteca
const FLOATING_MATERIALS = [
  {
    label: 'Checklist', title: 'Cibersegurança',
    color: '#059669', colorBg: 'rgba(5,150,105,0.10)', icon: Shield,
    pos: 'absolute left-4 top-10', delay: '0s',
  },
  {
    label: 'Guia', title: 'Automação PMEs',
    color: '#7B2CFF', colorBg: 'rgba(123,44,255,0.10)', icon: Bot,
    pos: 'absolute right-4 top-14', delay: '2.5s', // delay escalonado para animação não-simultânea
  },
  {
    label: 'Introdução', title: 'Análise de Dados',
    color: '#0ea5e9', colorBg: 'rgba(14,165,233,0.10)', icon: BarChart3,
    pos: 'absolute left-1/2 bottom-8 -translate-x-1/2', delay: '1.25s',
  },
]

/**
 * Filter config with icons per category.
 * Tune: add/change icons by updating `icon` field.
 */
// Configuração dos botões de filtro por categoria
// 'Todos' é sempre o primeiro e não filtra — exibe todos os recursos
const FILTERS: { cat: string; icon: React.ElementType }[] = [
  { cat: 'Todos',          icon: Grid2X2  },
  { cat: 'Automação',      icon: Bot      },
  { cat: 'Dados',          icon: BarChart3 },
  { cat: 'Software',       icon: Code2    },
  { cat: 'Cibersegurança', icon: Shield   },
]

export default function RecursosPage() {
  // Categoria de filtro ativa — 'Todos' exibe todos os recursos
  const [active, setActive]                   = useState<string>('Todos')
  // Página atual da paginação (índice zero-based)
  const [page,   setPage]                     = useState(0)
  // Recurso gratuito selecionado para download — abre DownloadLeadForm
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  // Recurso pago selecionado para compra — abre EbookPurchaseModal
  const [purchaseResource, setPurchaseResource] = useState<Resource | null>(null)
  // Recursos carregados do Supabase (tabela resource_metadata)
  const [dbResources, setDbResources]           = useState<Resource[]>([])
  // ID do usuário autenticado — null quando não logado
  const [userId, setUserId]                     = useState<string | null>(null)
  // IDs dos e-books pagos já comprados (status 'paid') — controla o gate de download
  const [purchasedIds, setPurchasedIds]         = useState<Set<string>>(new Set())
  // Saldo de créditos do usuário — null quando não logado ou sem carteira
  const [creditBalance, setCreditBalance]       = useState<number | null>(null)

  /* ── Escuta mudanças de autenticação — mesmo padrão do Header.tsx.
     onAuthStateChange dispara imediatamente com a sessão atual no mount,
     dispensando uma chamada extra a getSession(). ── */
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
      // Limpa dados do usuário ao fazer logout
      if (!session?.user) { setPurchasedIds(new Set()); setCreditBalance(null) }
    })
    // Cancela a assinatura ao desmontar o componente (evita memory leak)
    return () => subscription.unsubscribe()
  }, [])

  /* ── Busca compras pagas do usuário — controla o gate de download.
     Só executa quando userId muda (login/logout). ── */
  useEffect(() => {
    if (!userId) return
    createClient()
      .from('ebook_purchases')
      .select('ebook_id')
      .eq('user_id', userId)
      .eq('status', 'paid') // apenas compras confirmadas liberam download
      .then(({ data }) => setPurchasedIds(new Set((data ?? []).map(r => r.ebook_id as string))))
  }, [userId])

  /* ── Busca saldo de créditos — controla o botão "Comprar com créditos".
     Carteira só existe após a primeira compra confirmada; sem linha = saldo 0. ── */
  useEffect(() => {
    if (!userId) return
    createClient()
      .from('client_credit_wallets')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle() // null em vez de erro quando não existe carteira
      .then(({ data }) => setCreditBalance(data?.balance ?? 0))
  }, [userId])

  /* Callback chamado pelo ResourceCard após resgate com créditos bem-sucedido.
   * Atualiza o estado local sem nova requisição ao banco — UX mais rápida. */
  const handleRedeemedWithCredits = (resource: Resource) => {
    // Adiciona o ID do recurso resgatado ao conjunto de compras
    setPurchasedIds(prev => new Set(prev).add(resource.id))
    // Desconta o preço em créditos do saldo atual
    setCreditBalance(prev => prev != null && resource.creditPrice != null ? prev - resource.creditPrice : prev)
  }

  /* ── Busca recursos do Supabase (carregados pelos técnicos via admin).
     Faz fallback para lib/data.ts se a tabela estiver vazia. ── */
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('resource_metadata')
      // Colunas explícitas: página pública/anônima — evita expor
      // created_by/updated_by/payment_product_id (internos, sem uso aqui).
      .select('id, title, description, category, file_name, format, read_time, level, is_paid, price, sale_description, sale_status, delivery_type, protected_file_path, credit_price, created_at')
      .order('created_at', { ascending: false }) // mais recentes primeiro
      .then(({ data }) => {
        if (!data || data.length === 0) return // mantém os dados estáticos como fallback
        const mapped: Resource[] = data
          // E-book pago 'inativo' some da vitrine pública (leader pode
          // despublicar sem excluir o arquivo); gratuitos nunca são afetados.
          .filter(row => !row.is_paid || row.sale_status !== 'inactive')
          .map(row => ({
            id:          row.id,
            title:       row.title,
            description: row.description || '',
            category:    row.category as Resource['category'],
            // Gera URL pública do arquivo no Supabase Storage
            fileUrl:     supabase.storage.from('materials').getPublicUrl(row.file_name).data.publicUrl,
            coverUrl:    '',
            format:      row.format,
            readTime:    row.read_time,
            level:       row.level,
            isPaid:             row.is_paid ?? false,
            price:              row.price ?? null,
            saleDescription:    row.sale_description ?? null,
            saleStatus:         row.sale_status ?? 'active',
            deliveryType:       row.delivery_type ?? 'automatic',
            protectedFilePath:  row.protected_file_path ?? null,
            creditPrice:        row.credit_price ?? null,
          }))
        setDbResources(mapped)
      })
  }, [])

  // Fonte de dados: prefere registros do banco; fallback para array estático
  const resources = dbResources.length > 0 ? dbResources : staticResources

  // useMemo — evita recalcular filtros a cada re-render não relacionado
  const filtered = useMemo(
    () => active === 'Todos' ? resources : resources.filter(r => r.category === active),
    [active, resources]
  )
  // Conta recursos por categoria — usado no badge numérico dos filtros
  const countFor = useMemo(
    () => (cat: string): number =>
      cat === 'Todos' ? resources.length : resources.filter(r => r.category === cat).length,
    [resources]
  )

  // Calcula total de páginas e fatia o array para exibir só a página atual
  const totalPages = Math.max(1, Math.ceil(filtered.length / RESOURCES_PER_PAGE))
  const paginated  = filtered.slice(page * RESOURCES_PER_PAGE, (page + 1) * RESOURCES_PER_PAGE)

  // Muda filtro ativo e reseta paginação para página 0
  const handleFilter = (cat: string) => { setActive(cat); setPage(0) }

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────────
           Background tune:
             Gradients:  rgba() values in bg-[radial-gradient(...)]
             Dot grid:   opacity-[X] on the dot div
             Blobs:      bg-[COLOR]/[X] + blur-[Xpx]
      ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#F7F8FC] py-20 lg:py-28">
        {/* Decoração de fundo: gradientes + grid de pontos + blobs desfocados */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,91,255,0.08),transparent_32%),radial-gradient(circle_at_85%_30%,rgba(123,44,255,0.14),transparent_36%),radial-gradient(circle_at_55%_95%,rgba(0,163,255,0.10),transparent_42%)]" />
          <div className="absolute inset-0 opacity-[0.28] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.16)_1px,transparent_0)] bg-[size:28px_28px]" />
          <div className="absolute -left-40 top-20 h-[480px] w-[480px] rounded-full bg-[#00A3FF]/[0.08] blur-3xl" />
          <div className="absolute -right-40 top-10 h-[560px] w-[560px] rounded-full bg-[#7B2CFF]/[0.12] blur-3xl" />
          <div className="absolute right-0 -bottom-40 h-[420px] w-[700px] rounded-full bg-[#005BFF]/[0.07] blur-3xl" />
        </div>

        <Container className="relative z-10">
          {/* Grade: texto à esquerda + visual à direita (em desktop) */}
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">

            {/* ── COLUNA ESQUERDA: texto e CTAs ──────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Badge — tune: text, icon, colors */}
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#005BFF]/15 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#005BFF] shadow-sm backdrop-blur">
                <Gift size={13} aria-hidden="true" />
                Recursos gratuitos
              </span>

              {/* H1 com palavras em gradiente — tune gradient words here */}
              <h1
                className="text-4xl font-bold leading-tight text-[#0B1020] sm:text-5xl lg:text-[52px]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Aprenda{' '}
                {/* Palavra "tecnologia" em gradiente azul→roxo */}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  tecnologia
                </span>{' '}
                aplicada aos{' '}
                {/* Palavra "negócios" em gradiente roxo→azul (invertido) */}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #7B2CFF, #005BFF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  negócios
                </span>.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#5D6475] md:text-lg">
                Baixe materiais práticos sobre automação, dados, software e cibersegurança
                para aplicar na sua empresa com mais estratégia e eficiência.
              </p>

              {/* CTAs: âncora para a seção de recursos abaixo */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {/* CTA primário: scroll suave até a grade de recursos */}
                <Link
                  href="#resources-section"
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-7 py-4 text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(123,44,255,0.28)]"
                >
                  <Download size={16} aria-hidden="true" />
                  Todos os materiais são gratuitos
                </Link>
                {/* CTA secundário: mesmo destino, estilo outline */}
                <Link
                  href="#resources-section"
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white/85 px-7 py-4 text-sm font-bold text-[#0B1020] shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:text-[#005BFF]"
                >
                  Ver todos os materiais
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </div>

              {/* Benefícios rápidos — tune: sm:border-l shows dividers on sm+ */}
              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {HERO_BENEFITS.map(({ icon: Icon, title, desc }, i) => (
                  <div
                    key={title}
                    // Adiciona separador vertical entre itens a partir do segundo (sm+)
                    className={`flex items-start gap-3${i > 0 ? ' sm:border-l sm:border-[#E3E7F0] sm:pl-4' : ''}`}
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.10), rgba(123,44,255,0.10))' }}
                      aria-hidden="true"
                    >
                      <Icon size={16} style={{ color: '#005BFF' }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0B1020]">{title}</p>
                      <p className="text-xs leading-snug text-[#5D6475]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── COLUNA DIREITA: visual com cards flutuantes ─────── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.65, delay: 0.25, ease: 'easeOut' }}
            >
              {/* ─ Desktop: anéis orbitais + card principal + cards flutuantes ─
                   Tune container: h-[440px] max-w-[500px]
                   Tune main card: h-[220px] w-[160px] + rotation
                   Tune orbital rings: h/w values
                   Tune FLOATING_MATERIALS array above for content         */}
              <div className="relative mx-auto hidden h-[440px] max-w-[500px] lg:block">
                {/* Anel orbital externo — estático */}
                <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#005BFF]/[0.09]" />
                {/* Anel orbital interno — rotação lenta (28s) para efeito de movimento */}
                <div
                  className="absolute left-1/2 top-1/2 h-[310px] w-[310px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#7B2CFF]/[0.18] animate-spin"
                  style={{ animationDuration: '28s' }}
                />
                {/* Brilho central pulsante para dar profundidade */}
                <div
                  className="absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#005BFF]/[0.06] blur-2xl animate-pulse motion-reduce:animate-none"
                  style={{ animationDuration: '6s' }}
                />

                {/* Card principal ao centro — representa a biblioteca de recursos */}
                <div
                  className="absolute left-1/2 top-1/2 z-20 flex h-[220px] w-[160px] -translate-x-1/2 -translate-y-1/2 rotate-3 flex-col justify-between rounded-[2rem] p-5 text-white shadow-[0_30px_90px_rgba(0,91,255,0.35)]"
                  style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
                >
                  <div>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                      <BookOpen size={18} aria-hidden="true" />
                    </div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">Biblioteca</p>
                    <p className="mt-1 text-sm font-bold leading-snug">Recursos Gratuitos</p>
                  </div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/40">LOBBY</p>
                </div>

                {/* Badge "+6 materiais" no canto superior do visual */}
                <div className="absolute right-14 top-6 z-30 flex h-14 w-14 flex-col items-center justify-center rounded-full border border-[#E3E7F0] bg-white shadow-xl">
                  <p
                    className="text-base font-bold leading-none"
                    style={{
                      background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    6+
                  </p>
                  <p className="text-[8px] text-[#5D6475]">materiais</p>
                </div>

                {/* Cards flutuantes ao redor do card central — animação float com delay */}
                {FLOATING_MATERIALS.map(({ label, title, color, colorBg, icon: Icon, pos, delay }) => (
                  <div key={title} className={`${pos} z-10`}>
                    {/* Animação CSS customizada slow-float (definida no globals.css) */}
                    <div
                      className="animate-[slow-float_10s_ease-in-out_infinite] motion-reduce:animate-none"
                      style={{ animationDelay: delay }}
                    >
                      <div className="w-44 rounded-2xl border border-[#E3E7F0] bg-white/90 p-3 shadow-lg backdrop-blur transition-all duration-300 hover:border-[#005BFF]/20 hover:shadow-xl">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                            style={{ background: colorBg }}
                            aria-hidden="true"
                          >
                            <Icon size={14} style={{ color }} />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>{label}</p>
                            <p className="text-xs font-semibold leading-tight text-[#0B1020]">{title}</p>
                          </div>
                        </div>
                        {/* Barra decorativa na cor da categoria do material */}
                        <div
                          className="mt-2 h-0.5 w-8 rounded-full"
                          style={{ background: `linear-gradient(to right, ${color}, transparent)` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Barra de métricas — exibida abaixo do visual em desktop e como substituta em mobile */}
              <div className="mt-6 overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/85 shadow-[0_8px_40px_rgba(11,16,32,0.06)] backdrop-blur lg:mt-8">
                <div className="grid grid-cols-3">
                  {HERO_METRICS.map(({ icon: Icon, value, label, color, colorBg }, i) => (
                    <div
                      key={label}
                      // Separador vertical entre métricas (exceto a primeira)
                      className={`flex items-center gap-3 p-4${i > 0 ? ' border-l border-[#E3E7F0]' : ''}`}
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: colorBg }}
                        aria-hidden="true"
                      >
                        <Icon size={16} style={{ color }} />
                      </div>
                      <div>
                        <p className="text-base font-bold leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif', color }}>
                          {value}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-snug" style={{ color }}>{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile: cards simples substituem o visual orbital (lg:hidden) */}
              <div className="mt-8 grid grid-cols-2 gap-3 lg:hidden">
                {FLOATING_MATERIALS.map(({ label, title, color, colorBg, icon: Icon }) => (
                  <div key={title} className="rounded-2xl border border-[#E3E7F0] bg-white/90 p-4 shadow-md">
                    <div
                      className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ background: colorBg }}
                      aria-hidden="true"
                    >
                      <Icon size={16} style={{ color }} />
                    </div>
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>{label}</p>
                    <p className="mt-0.5 text-sm font-semibold text-[#0B1020]">{title}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </Container>
      </section>

      {/* ── FILTROS + GRADE DE RECURSOS ──────────────────────────────
           Filter bar tune:  card shadow | active gradient | counter bg
           Grid tune:        gap-6 xl:grid-cols-2 2xl:grid-cols-3
      ─────────────────────────────────────────────────────────────── */}
      {/* id="resources-section" é o alvo dos âncoras dos CTAs do hero */}
      <section
        id="resources-section"
        className="relative overflow-hidden bg-[#F7F8FC] pb-20 pt-10"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(123,44,255,0.05),transparent_40%),radial-gradient(circle_at_20%_80%,rgba(0,91,255,0.05),transparent_40%)]" />
          <div className="absolute inset-0 opacity-[0.16] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.14)_1px,transparent_0)] bg-[size:28px_28px]" />
        </div>

        <Container className="relative z-10">
          {/* Barra de filtros por categoria */}
          <div className="mb-10 overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 p-4 shadow-[0_20px_70px_rgba(11,16,32,0.08)] backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <p className="shrink-0 text-sm font-medium text-[#5D6475]">
                Explore por categoria e encontre o material ideal.
              </p>

              <div className="flex flex-wrap gap-2">
                {FILTERS.map(({ cat, icon: Icon }) => {
                  const isActive = active === cat
                  // Contagem de recursos nesta categoria para o badge numérico
                  const count   = countFor(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleFilter(cat)}
                      className={
                        isActive
                          // Botão ativo: gradiente + sombra
                          ? 'inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-transparent bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-sm font-bold text-white shadow-[0_6px_20px_rgba(0,91,255,0.22)] transition-all duration-300'
                          // Botão inativo: borda cinza, hover azul
                          : 'group inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white px-4 py-2 text-sm font-medium text-[#5D6475] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:bg-[#005BFF]/[0.04] hover:text-[#005BFF]'
                      }
                    >
                      <Icon size={14} aria-hidden="true" />
                      {cat}
                      {/* Badge com contagem de recursos na categoria */}
                      <span
                        className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-[#F7F8FC] text-[#5D6475]'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Grade de cards de recurso — exibe apenas a página atual */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 2xl:grid-cols-3">
            {paginated.map((resource, i) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onDownload={setSelectedResource}      // abre modal de download (gratuito)
                onBuyClick={setPurchaseResource}      // abre modal de compra (pago)
                isLoggedIn={!!userId}                 // controla exibição de login gate
                isPurchased={purchasedIds.has(resource.id)} // libera download se já comprado
                creditBalance={creditBalance}         // para exibir/desabilitar "comprar com créditos"
                onRedeemedWithCredits={handleRedeemedWithCredits}
                index={i}                             // índice para animação escalonada
              />
            ))}
          </div>

          {/* Paginação — navega entre as páginas de recursos filtrados */}
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            className="mt-10"
          />

          {/* CTA inline entre a grade e o rodapé */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mt-12 overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_20px_70px_rgba(11,16,32,0.08)] backdrop-blur"
          >
            <div className="flex flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.10), rgba(123,44,255,0.10))' }}
                  aria-hidden="true"
                >
                  <Rocket size={20} style={{ color: '#005BFF' }} />
                </div>
                <div>
                  <h3
                    className="text-lg font-bold text-[#0B1020]"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    Quer aplicar isso na sua empresa?
                  </h3>
                  <p className="text-sm text-[#5D6475]">
                    Fale com um especialista e descubra como levar essas soluções para o seu negócio.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                <Link
                  href="/contato"
                  className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-6 py-3.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(123,44,255,0.28)]"
                >
                  Falar com especialista
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
                <Link
                  href="#"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white px-6 py-3.5 text-sm font-bold text-[#0B1020] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:text-[#005BFF]"
                >
                  Ver todos os materiais
                </Link>
              </div>
            </div>
          </motion.div>
        </Container>
      </section>

      {/* CTA final de rodapé — incentiva avançar além dos materiais gratuitos */}
      <CTASection
        title="Quer dar o próximo passo?"
        description="Além dos materiais gratuitos, nossa equipe pode ajudar você a implementar essas estratégias com soluções personalizadas."
        buttonLabel="Falar com especialista"
        buttonHref="/contato"
        benefits={['Diagnóstico gratuito', 'Soluções personalizadas', 'Suporte especializado']}
      />

      {/* Modal de download (recursos gratuitos) — montado via AnimatePresence para animação de saída */}
      <AnimatePresence>
        {selectedResource && (
          <DownloadLeadForm
            resource={selectedResource}
            onClose={() => setSelectedResource(null)}
          />
        )}
      </AnimatePresence>

      {/* Modal de compra (e-books pagos) — só abre se o usuário estiver autenticado */}
      <AnimatePresence>
        {purchaseResource && userId && (
          <EbookPurchaseModal
            resource={purchaseResource}
            userId={userId}
            onClose={() => setPurchaseResource(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
