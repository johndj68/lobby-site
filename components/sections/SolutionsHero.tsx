'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  ArrowRight, Sparkles, Zap, Settings2, Shield,
  Code2, BarChart3, Bot, Briefcase, Users, TrendingUp, Star,
} from 'lucide-react'
import Container from '@/components/layout/Container'

/* Benefícios rápidos exibidos abaixo dos CTAs (coluna esquerda).
   Cada item: icon (ícone Lucide), title (título curto), desc (descrição). */
const QUICK_BENEFITS = [
  {
    icon: Zap,
    title: 'Diagnóstico rápido',
    desc: 'Entendimento claro do seu cenário',
  },
  {
    icon: Settings2,
    title: 'Soluções personalizadas',
    desc: 'Projetos sob medida para seu negócio',
  },
  {
    icon: Shield,
    title: 'Implantação segura',
    desc: 'Tecnologia com proteção e conformidade',
  },
]

/* Barra de métricas abaixo dos benefícios rápidos.
   color/colorBg controlam a cor do ícone e o fundo do ícone respectivamente. */
const METRICS = [
  { icon: Briefcase,  value: '+120', label: 'Projetos entregues', desc: 'com sucesso',          color: '#005BFF', colorBg: 'rgba(0,91,255,0.10)'   },
  { icon: Users,      value: '+80',  label: 'Empresas atendidas',  desc: 'em diversos segmentos', color: '#7B2CFF', colorBg: 'rgba(123,44,255,0.10)' },
  { icon: TrendingUp, value: '+35%', label: 'Ganho de eficiência', desc: 'na operação',           color: '#F97316', colorBg: 'rgba(249,115,22,0.10)'  },
  { icon: Star,       value: '98%',  label: 'Satisfação',          desc: 'dos clientes',          color: '#16A34A', colorBg: 'rgba(22,163,74,0.10)'   },
]

/* Cards flutuantes ao redor do visual central (orbital), apenas no desktop.
   posClass  — classes Tailwind para posicionamento absoluto dentro do container de 520px.
   floatDelay — delay da animação CSS slow-float (keyframe do globals.css) para efeito escalonado. */
const FLOATING_CARDS = [
  {
    title: 'Software',
    desc: 'Sistemas sob medida para seu negócio',
    icon: Code2,
    posClass: 'absolute left-2 top-1/2 -translate-y-1/2',
    floatDelay: '0s',
  },
  {
    title: 'Automação',
    desc: 'Processos inteligentes e integrações',
    icon: Bot,
    posClass: 'absolute left-1/2 top-2 -translate-x-1/2',
    floatDelay: '2.5s',
  },
  {
    title: 'Dados',
    desc: 'Decisões baseadas em informações reais',
    icon: BarChart3,
    posClass: 'absolute right-2 top-1/2 -translate-y-1/2',
    floatDelay: '5s',
  },
  {
    title: 'Segurança',
    desc: 'Proteção digital total para o negócio',
    icon: Shield,
    posClass: 'absolute left-1/2 bottom-2 -translate-x-1/2',
    floatDelay: '1.25s',
  },
]

/* Seção hero da página de Soluções.
   Layout: texto à esquerda + visual orbital animado à direita (desktop)
   ou grade 2×2 de cards em mobile. */
export default function SolutionsHero() {
  return (
    <section className="relative overflow-hidden bg-[#F7F8FC] py-20 lg:py-28">

      {/* ── Fundo decorativo ────────────────────────────────────────────
           Camadas independentes:
             Gradientes radiais: definem zonas de cor suave
             Grid de pontos: textura pontilhada semitransparente
             Máscara de leitura: mantém o lado esquerdo (texto) limpo
             Blobs desfocados: manchas de cor com blur-3xl
             SVG de ondas: curvas decorativas no canto inferior direito
             Feixe inferior: barra de luz suave na base
      ──────────────────────────────────────────────────────────────── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">

        {/* Zonas de gradiente radial */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(0,91,255,0.08),transparent_32%),radial-gradient(circle_at_86%_34%,rgba(123,44,255,0.16),transparent_38%),radial-gradient(circle_at_70%_94%,rgba(0,163,255,0.12),transparent_42%)]" />

        {/* Grid de pontos semitransparentes */}
        <div className="absolute inset-0 opacity-[0.35] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.16)_1px,transparent_0)] bg-[size:28px_28px]" />

        {/* Máscara que clareia o lado esquerdo para garantir legibilidade do texto */}
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#F7F8FC] via-[#F7F8FC]/88 to-transparent lg:w-[56%]" />

        {/* Blobs coloridos com desfoque — efeito de profundidade */}
        <div className="absolute -right-44 top-16 h-[640px] w-[640px] rounded-full bg-[#7B2CFF]/[0.17] blur-3xl" />
        <div className="absolute right-16 -bottom-40 h-[560px] w-[560px] rounded-full bg-[#005BFF]/[0.13] blur-3xl" />
        <div className="absolute -left-48 bottom-10 h-[460px] w-[460px] rounded-full bg-[#00A3FF]/[0.08] blur-3xl" />

        {/* Ondas SVG decorativas — visíveis apenas em md+ */}
        <svg
          className="absolute -right-[12%] -bottom-[16%] hidden h-[620px] w-[980px] opacity-70 md:block"
          viewBox="0 0 980 620"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="solHeroWave" x1="0" y1="0" x2="980" y2="620" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="#00A3FF" stopOpacity="0.04" />
              <stop offset="45%"  stopColor="#005BFF" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#7B2CFF" stopOpacity="0.30" />
            </linearGradient>
          </defs>
          {/* Três curvas com espessura e opacidade decrescentes */}
          <path d="M0 430 C190 290 330 530 520 370 C700 220 790 310 980 160"  stroke="url(#solHeroWave)" strokeWidth="2" />
          <path d="M0 475 C230 320 370 560 560 405 C730 265 820 350 980 220"  stroke="url(#solHeroWave)" strokeWidth="1.5" opacity="0.75" />
          <path d="M0 520 C260 370 420 590 610 455 C760 335 850 390 980 285"  stroke="url(#solHeroWave)" strokeWidth="1"   opacity="0.55" />
        </svg>

        {/* Feixe de luz suave na base da seção */}
        <div className="absolute -bottom-32 left-1/2 h-48 w-[120%] -translate-x-1/2 -rotate-[3deg] bg-gradient-to-r from-[#005BFF]/[0.09] via-[#7B2CFF]/[0.15] to-[#00A3FF]/[0.09] blur-2xl" />
      </div>

      <Container className="relative z-10">
        {/* Grid: 1 coluna em mobile, 2 colunas em lg+ */}
        <div className="grid items-center gap-12 lg:grid-cols-2 xl:gap-20">

          {/* ── Coluna esquerda: texto, CTAs e métricas ─────────────────
               Animação de entrada: y: 28 → 0 com fade em 0.55s. */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            {/* Badge de identificação da seção */}
            <span className="inline-flex items-center gap-2 rounded-full border border-[#005BFF]/20 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#005BFF] shadow-sm backdrop-blur">
              <Sparkles size={13} aria-hidden="true" />
              Soluções inteligentes
            </span>

            {/* H1 com duas palavras em gradiente (azul→roxo e roxo→azul) */}
            <h1
              className="mt-6 text-4xl font-bold leading-[1.08] text-[#0B1020] sm:text-5xl lg:text-[52px] xl:text-[58px]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Soluções para{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                automatizar, analisar
              </span>{' '}
              e{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #7B2CFF, #005BFF)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                proteger
              </span>{' '}
              sua empresa.
            </h1>

            {/* Subtítulo descritivo */}
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#5D6475] md:text-lg">
              Combinamos software sob medida, automação, dados e cibersegurança
              para reduzir gargalos, melhorar decisões e acelerar resultados.
            </p>

            {/* CTAs: principal (gradient com sombra) + secundário (borda) */}
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              {/* CTA primário — hover eleva o card (-translate-y-0.5) */}
              <Link
                href="/contato"
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-7 py-4 text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(123,44,255,0.28)]"
              >
                Falar com especialista
                {/* Seta desliza para direita no hover */}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>

              {/* CTA secundário — borda com backdrop-blur */}
              <Link
                href="/projetos"
                className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white/85 px-7 py-4 text-sm font-bold text-[#0B1020] shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:text-[#005BFF]"
              >
                Ver projetos
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>

            {/* Grade de benefícios rápidos — 1 col em mobile, 3 em sm+
                Separador vertical (border-l) entre os itens a partir do 2º. */}
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {QUICK_BENEFITS.map(({ icon: Icon, title, desc }, i) => (
                <div
                  key={title}
                  className={`flex items-start gap-3${i > 0 ? ' sm:border-l sm:border-[#E3E7F0] sm:pl-4' : ''}`}
                >
                  {/* Ícone com fundo em gradiente suave azul/roxo */}
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.10), rgba(123,44,255,0.10))' }}
                    aria-hidden="true"
                  >
                    <Icon size={16} style={{ color: '#005BFF' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      {title}
                    </p>
                    <p className="text-xs leading-snug text-[#5D6475]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Barra de métricas — card branco com grid 2×2 (mobile) ou 4 colunas (md+).
                Separador vertical entre métricas a partir da 2ª. */}
            <div className="mt-8 overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/85 shadow-[0_8px_40px_rgba(11,16,32,0.06)] backdrop-blur">
              <div className="grid grid-cols-2 md:grid-cols-4">
                {METRICS.map(({ icon: Icon, value, label, color, colorBg }, i) => (
                  <div
                    key={label}
                    className={`flex items-center gap-3 p-4${i > 0 ? ' border-l border-[#E3E7F0]' : ''}`}
                  >
                    {/* Ícone com cor e fundo dinâmicos por métrica */}
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: colorBg }}
                      aria-hidden="true"
                    >
                      <Icon size={16} style={{ color }} />
                    </div>
                    <div>
                      {/* Valor numérico em destaque com cor da métrica */}
                      <p
                        className="text-base font-bold leading-none"
                        style={{ fontFamily: 'Space Grotesk, sans-serif', color }}
                      >
                        {value}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug" style={{ color }}>
                        {label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── Coluna direita: visual orbital ───────────────────────────
               Animação de entrada: scale 0.94 → 1 com delay de 0.25s. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.25, ease: 'easeOut' }}
          >
            {/* ─ Desktop: visual orbital com cards flutuantes ─
                 Container quadrado de 520px com posicionamento absoluto interno. */}
            <div className="relative mx-auto hidden h-[520px] max-w-[520px] lg:block">

              {/* Anel orbital externo estático */}
              <div className="absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#005BFF]/[0.09]" />

              {/* Anel orbital interno tracejado girando devagar (32s) */}
              <div
                className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#005BFF]/[0.20] animate-spin"
                style={{ animationDuration: '32s' }}
              />

              {/* Brilho interno pulsante (6s de ciclo) */}
              <div
                className="absolute left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7B2CFF]/[0.09] blur-2xl animate-pulse motion-reduce:animate-none"
                style={{ animationDuration: '6s' }}
              />

              {/* Card central com logo da LOBBY */}
              <div className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white shadow-[0_30px_80px_rgba(0,91,255,0.20)]">
                  <Image
                    src="/logohome.png"
                    alt="LOBBY"
                    width={288}
                    height={288}
                    className="h-full w-full object-contain p-3"
                    priority
                    quality={100}
                  />
                </div>
              </div>

              {/* Cards flutuantes posicionados via posClass (FLOATING_CARDS).
                  A animação slow-float está definida em globals.css e é escalonada
                  pelo floatDelay de cada card para evitar sincronia. */}
              {FLOATING_CARDS.map(({ title, desc, icon: Icon, posClass, floatDelay }) => (
                <div key={title} className={posClass}>
                  {/* Wrapper de animação separado do wrapper de posicionamento
                      para evitar conflito entre transform de posição e de float. */}
                  <div
                    className="animate-[slow-float_10s_ease-in-out_infinite] motion-reduce:animate-none"
                    style={{ animationDelay: floatDelay }}
                  >
                    {/* Card com hover: muda sombra/borda sem mexer na posição */}
                    <div className="group z-10 w-36 rounded-2xl border border-[#E3E7F0] bg-white/88 p-3.5 shadow-[0_8px_30px_rgba(11,16,32,0.08)] backdrop-blur transition-all duration-300 hover:border-[#005BFF]/25 hover:shadow-[0_14px_50px_rgba(0,91,255,0.14)]">
                      {/* Ícone com escala no hover */}
                      <div
                        className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                        style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.10), rgba(123,44,255,0.10))' }}
                        aria-hidden="true"
                      >
                        <Icon size={17} style={{ color: '#005BFF' }} />
                      </div>
                      <p className="text-xs font-bold leading-snug text-[#0B1020]">{title}</p>
                      <p className="mt-1 text-[10px] leading-snug text-[#5D6475]">{desc}</p>
                      {/* Linha decorativa de separação em gradiente */}
                      <div className="mt-2.5 h-0.5 w-8 rounded-full bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ─ Mobile: grade 2×2 substituindo o visual orbital ─
                 Exibido apenas quando lg:hidden (abaixo de 1024px). */}
            <div className="mt-12 grid grid-cols-2 gap-4 lg:hidden">
              {FLOATING_CARDS.map(({ title, desc, icon: Icon }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-[#E3E7F0] bg-white/90 p-4 shadow-md"
                >
                  {/* Ícone sem animação em mobile */}
                  <div
                    className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.10), rgba(123,44,255,0.10))' }}
                    aria-hidden="true"
                  >
                    <Icon size={18} style={{ color: '#005BFF' }} />
                  </div>
                  <p
                    className="text-sm font-bold text-[#0B1020]"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-[#5D6475]">{desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  )
}
