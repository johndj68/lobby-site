'use client'

import Link from 'next/link'
import Image from 'next/image'
// motion: animações de entrada dos cards de benefícios e do painel de marca
import { motion } from 'framer-motion'
import { ShieldCheck, LayoutDashboard, FolderKanban, Headphones } from 'lucide-react'
// Componente visual da plataforma — exibido no painel esquerdo (desktop)
import LoginPlatformVisual from '@/components/sections/LoginPlatformVisual'

/* ── Ícones mapeados por posição para os cards de benefícios ─────────────── */
// BENEFIT_ICONS[i % 4] — cicla pelos 4 ícones independente do número de benefícios
const BENEFIT_ICONS = [ShieldCheck, LayoutDashboard, FolderKanban, Headphones] as const

/* ── Paleta de cores para cada card de benefício (hex + fundo translúcido) ── */
// hex: cor do ícone; bg: fundo translúcido do container do ícone
const BENEFIT_PALETTES = [
  { hex: '#005BFF', bg: 'rgba(0,91,255,0.10)'   }, // azul LOBBY
  { hex: '#7B2CFF', bg: 'rgba(123,44,255,0.10)' }, // roxo LOBBY
  { hex: '#00A3FF', bg: 'rgba(0,163,255,0.10)'  }, // azul claro
  { hex: '#059669', bg: 'rgba(5,150,105,0.10)'  }, // verde
]

/* ── Tipagem das props do layout de autenticação ─────────────────────────── */
// children: formulário de login ou cadastro (renderizado no painel direito)
// title: título exibido no painel de marca (esquerdo)
// subtitle: descrição complementar ao título
// benefits: lista de cards de benefício exibidos abaixo do título
interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
  benefits: { title: string; description: string }[]
}

/* ── Componente auxiliar: aplica gradiente azul→roxo na palavra "LOBBY" ───── */
// Divide o texto pelo termo "LOBBY" e envolve cada ocorrência em um <span> gradiente
function GradientTitle({ text }: { text: string }) {
  const parts = text.split('LOBBY')
  // Se "LOBBY" não está no texto, retorna sem alteração
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts[0]}
      {/* Span com gradiente aplicado via background-clip: text */}
      <span
        style={{
          background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          display: 'inline-block',
          paddingRight: '0.05em', // evita corte da borda direita da letra em alguns navegadores
        }}
      >
        LOBBY
      </span>
      {/* Reconstrói o restante do texto (suporta múltiplas ocorrências de "LOBBY") */}
      {parts.slice(1).join('LOBBY')}
    </>
  )
}

export default function AuthLayout({ children, title, subtitle, benefits }: AuthLayoutProps) {
  return (
    /* Tela cheia com fundo claro, centraliza o card verticalmente */
    <div className="relative min-h-screen overflow-hidden bg-[#F7F8FC] flex items-center justify-center p-4 py-10">

      {/* ── Decorações de fundo: gradientes + grid de pontos + blobs ─────────
           pointer-events-none: não interfere com cliques do usuário           */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Gradientes radiais nos cantos superior-esquerdo, superior-direito e inferior */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(0,91,255,0.08),transparent_32%),radial-gradient(circle_at_85%_30%,rgba(123,44,255,0.12),transparent_36%),radial-gradient(circle_at_50%_100%,rgba(0,163,255,0.08),transparent_42%)]" />
        {/* Grid de pontos azuis sutis via background-image CSS */}
        <div className="absolute inset-0 opacity-[0.26] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.16)_1px,transparent_0)] bg-[size:28px_28px]" />
        {/* Blobs com blur extremo — apenas efeito de cor difusa no fundo */}
        <div className="absolute -left-40 top-20 h-[480px] w-[480px] rounded-full bg-[#00A3FF]/[0.08] blur-3xl" />
        <div className="absolute -right-40 top-10 h-[560px] w-[560px] rounded-full bg-[#7B2CFF]/[0.11] blur-3xl" />
        <div className="absolute -bottom-40 left-1/2 h-[420px] w-[700px] -translate-x-1/2 rounded-full bg-[#005BFF]/[0.08] blur-3xl" />
      </div>

      {/* ── Card principal centralizado (máx. 6xl = 72rem de largura) ─────── */}
      <div className="relative z-10 w-full max-w-6xl">
        {/* Grade de 2 colunas em desktop (lg+): painel de marca | formulário */}
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-[#E3E7F0] bg-white/90 shadow-[0_30px_100px_rgba(11,16,32,0.12)] backdrop-blur grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] min-h-[620px]">

          {/* ── Painel esquerdo: marca, título e benefícios (desktop only) ── */}
          {/* hidden lg:flex: só visível em telas grandes */}
          <div
            className="relative hidden lg:flex flex-col p-10 xl:p-12 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, #EEF2FF 0%, #F0F4FF 50%, #EDF0F7 100%)' }}
          >
            {/* Círculos radiais decorativos — profundidade visual no canto superior e inferior */}
            <div
              className="absolute right-0 top-0 h-80 w-80 rounded-full opacity-25"
              style={{ background: 'radial-gradient(circle, rgba(0,91,255,0.28), transparent 70%)' }}
              aria-hidden="true"
            />
            <div
              className="absolute bottom-0 left-0 h-56 w-56 rounded-full opacity-18"
              style={{ background: 'radial-gradient(circle, rgba(123,44,255,0.28), transparent 70%)' }}
              aria-hidden="true"
            />

            {/* Logo — link para a home */}
            <Link href="/" className="relative z-10">
              <Image
                src="/logowhite.svg"
                alt="LOBBY"
                width={176}
                height={88}
                className="h-[64px] w-auto object-contain"
                priority
              />
            </Link>

            {/* Animação de entrada: sobe 20px e vai para opacidade 1 em 0.5s */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative z-10 mt-9 flex-1"
            >
              {/* Título com destaque gradiente na palavra "LOBBY" */}
              <h2
                className="text-3xl xl:text-[2.15rem] font-bold leading-tight text-[#0B1020]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                <GradientTitle text={title} />
              </h2>
              {/* Subtítulo descritivo */}
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#5D6475]">{subtitle}</p>

              {/* ── Cards de benefícios animados ──────────────────────────────
                  Cada card entra com delay incremental (0.15s + i * 0.08s)
                  e desliza da esquerda para direita                          */}
              <div className="mt-7 space-y-3">
                {benefits.map((b, i) => {
                  // Seleciona ícone e paleta ciclicamente pelo índice
                  const Icon    = BENEFIT_ICONS[i % BENEFIT_ICONS.length]
                  const palette = BENEFIT_PALETTES[i % BENEFIT_PALETTES.length]
                  return (
                    <motion.div
                      key={b.title}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
                      // Hover: sobe levemente e aumenta sombra
                      className="group flex items-start gap-3.5 rounded-2xl border border-[#E3E7F0] bg-white/75 p-3.5 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/25 hover:shadow-md"
                    >
                      {/* Container do ícone: fundo colorido translúcido da paleta */}
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                        style={{ background: palette.bg }}
                        aria-hidden="true"
                      >
                        <Icon size={17} style={{ color: palette.hex }} />
                      </div>
                      {/* Textos do card: título em negrito + descrição menor */}
                      <div>
                        <p
                          className="text-sm font-bold text-[#0B1020]"
                          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                        >
                          {b.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-[#5D6475]">{b.description}</p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>

            {/* Visual da plataforma — componente decorativo no rodapé do painel */}
            <LoginPlatformVisual />
          </div>

          {/* ── Painel direito: formulário de login ou cadastro ────────────── */}
          {/* bg-white puro para contraste com o painel esquerdo levemente colorido */}
          <div className="flex flex-col justify-center bg-white p-8 lg:p-10 xl:p-12">
            {/* Logo exibido apenas no mobile (o painel esquerdo fica oculto em mobile) */}
            <Link href="/" className="mb-7 lg:hidden">
              <Image
                src="/logowhite.svg"
                alt="LOBBY"
                width={160}
                height={80}
                className="h-[56px] w-auto object-contain"
                priority
              />
            </Link>
            {/* children: formulário de login, cadastro ou recuperação de senha */}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
