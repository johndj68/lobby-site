'use client'
// Página "Sobre a LOBBY" (rota: /sobre)
//
// Client Component — usa Framer Motion (motion.*) para animações de entrada.
// Estrutura de seções:
//  1. Hero           — headline + chips + métricas + visual orbital com cards flutuantes
//  2. Nossa essência — cards de Missão, Visão e Valores com animação whileInView
//  3. Políticas      — commitments + accordion de Privacidade/Segurança/Qualidade/Atendimento
//  4. Termos de uso  — grade de 6 cards com os termos do serviço
//  5. CTA final      — banner gradiente com link para /contato

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  Shield, TrendingUp, Target, Eye, Diamond, Lock,
  Sparkles, Code2, Settings2, BarChart3, Check,
  Rocket, Building2, Star, Layers,
  ShieldCheck, Headphones, BadgeCheck, ArrowRight, FileText,
} from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import Container from '@/components/layout/Container'
import SectionTitle from '@/components/sections/SectionTitle'

/**
 * Essence cards — tune per card:
 *   color:       icon, number, title color
 *   colorBg:     icon badge background
 *   topGrad:     top border gradient (Tailwind from-/to- classes)
 *   hoverBorder: hover border color class
 *   hoverShadow: hover shadow class
 */
const essence = [
  {
    icon: Target,
    title: 'Missão',
    description: 'Entregar soluções tecnológicas inovadoras que geram eficiência, segurança e crescimento sustentável para nossos clientes.',
    items: [
      'Resolver problemas reais com tecnologia',
      'Gerar valor mensurável para o negócio',
      'Atuar com ética, responsabilidade e excelência',
    ],
    color: '#005BFF',
    colorBg: 'rgba(0,91,255,0.10)',
    topGrad: 'from-[#005BFF] to-[#00A3FF]',
    hoverBorder: 'hover:border-[#005BFF]/25',
    hoverShadow: 'hover:shadow-[0_24px_80px_rgba(0,91,255,0.12)]',
  },
  {
    icon: Eye,
    title: 'Visão',
    description: 'Ser referência em soluções tecnológicas integradas, reconhecida pela confiança, inovação e impacto positivo.',
    items: [
      'Liderar com inovação e conhecimento',
      'Expandir impacto e transformar mercados',
      'Construir o futuro com propósito',
    ],
    color: '#7B2CFF',
    colorBg: 'rgba(123,44,255,0.10)',
    topGrad: 'from-[#7B2CFF] to-[#005BFF]',
    hoverBorder: 'hover:border-[#7B2CFF]/25',
    hoverShadow: 'hover:shadow-[0_24px_80px_rgba(123,44,255,0.12)]',
  },
  {
    icon: Diamond,
    title: 'Valores',
    description: 'Os princípios que guiam cada decisão e entrega da LOBBY.',
    items: [
      'Integridade em todas as ações',
      'Foco no cliente e em resultados',
      'Inovação com simplicidade',
      'Segurança e privacidade como prioridade',
      'Colaboração e respeito às pessoas',
    ],
    color: '#00A3FF',
    colorBg: 'rgba(0,163,255,0.10)',
    topGrad: 'from-[#00A3FF] to-[#7B2CFF]',
    hoverBorder: 'hover:border-[#00A3FF]/25',
    hoverShadow: 'hover:shadow-[0_24px_80px_rgba(0,163,255,0.12)]',
  },
]

/**
 * Hero right-side floating cards.
 * Tune: pos (Tailwind absolute classes), delay, color, icon, title, desc.
 */
const FLOATING_CARDS = [
  {
    title: 'Software',
    desc: 'Soluções inteligentes',
    icon: Code2,
    color: '#005BFF', colorBg: 'rgba(0,91,255,0.10)',
    pos: 'absolute left-2 top-8',
    delay: '0s',
  },
  {
    title: 'Automação',
    desc: 'Eficiência que escala',
    icon: Settings2,
    color: '#7B2CFF', colorBg: 'rgba(123,44,255,0.10)',
    pos: 'absolute right-2 top-8',
    delay: '2.5s',
  },
  {
    title: 'Dados',
    desc: 'Insights que geram valor',
    icon: BarChart3,
    color: '#0ea5e9', colorBg: 'rgba(14,165,233,0.10)',
    pos: 'absolute left-2 bottom-8',
    delay: '1.25s',
  },
  {
    title: 'Segurança',
    desc: 'Proteção em todas as camadas',
    icon: Shield,
    color: '#059669', colorBg: 'rgba(5,150,105,0.10)',
    pos: 'absolute right-2 bottom-8',
    delay: '3.75s',
  },
]

/**
 * Hero metrics bar.
 * Tune: value, label, color, colorBg, icon per metric.
 */
const METRICS = [
  { icon: Rocket,    value: '+120', label: 'projetos entregues',      color: '#005BFF', colorBg: 'rgba(0,91,255,0.10)'   },
  { icon: Building2, value: '+80',  label: 'empresas parceiras',      color: '#7B2CFF', colorBg: 'rgba(123,44,255,0.10)' },
  { icon: Star,      value: '98%',  label: 'satisfação dos clientes', color: '#16A34A', colorBg: 'rgba(22,163,74,0.10)'  },
  { icon: Layers,    value: '4',    label: 'áreas de atuação',        color: '#F97316', colorBg: 'rgba(249,115,22,0.10)' },
]

/**
 * Differentiator chips below the hero subtitle.
 * Tune: label, icon per chip.
 */
const CHIPS = [
  { icon: Shield,     label: 'Segurança em primeiro lugar'  },
  { icon: TrendingUp, label: 'Decisões orientadas por dados' },
  { icon: Code2,      label: 'Soluções sob medida'          },
]

/**
 * Policies (accordion items) — tune per item:
 *   description:  subtitle shown inside the trigger
 *   color/colorBg: icon and content tint
 *   hoverClass:   hover border + shadow (hardcoded so Tailwind scans them)
 *   items:        bullet points shown when accordion opens
 */
const policies = [
  {
    id: 'privacidade',
    title: 'Política de privacidade',
    description: 'Como coletamos, usamos e protegemos as informações pessoais em conformidade com a LGPD.',
    icon: Lock,
    color: '#005BFF', colorBg: 'rgba(0,91,255,0.10)',
    hoverClass: 'hover:border-[#005BFF]/25 hover:shadow-[0_20px_60px_rgba(0,91,255,0.10)]',
    items: [
      'Coleta mínima e responsável de informações.',
      'Uso transparente dos dados pessoais.',
      'Proteção contra acessos não autorizados.',
    ],
  },
  {
    id: 'seguranca',
    title: 'Política de segurança',
    description: 'Medidas técnicas e organizacionais para proteger sistemas, acessos e informações contra ameaças.',
    icon: Shield,
    color: '#7B2CFF', colorBg: 'rgba(123,44,255,0.10)',
    hoverClass: 'hover:border-[#7B2CFF]/25 hover:shadow-[0_20px_60px_rgba(123,44,255,0.10)]',
    items: [
      'Confidencialidade, integridade e disponibilidade garantidas.',
      'Avaliações periódicas de risco e vulnerabilidade.',
      'Acesso controlado e rastreado a dados críticos.',
    ],
  },
  {
    id: 'qualidade',
    title: 'Política de qualidade',
    description: 'Padrões e processos que garantem soluções eficientes, confiáveis e alinhadas às melhores práticas.',
    icon: TrendingUp,
    color: '#16A34A', colorBg: 'rgba(22,163,74,0.10)',
    hoverClass: 'hover:border-[#16A34A]/25 hover:shadow-[0_20px_60px_rgba(22,163,74,0.08)]',
    items: [
      'Processos rigorosos de validação e testes.',
      'Melhoria contínua orientada por métricas.',
      'Entregas alinhadas às expectativas do cliente.',
    ],
  },
  {
    id: 'atendimento',
    title: 'Política de atendimento',
    description: 'Compromisso com um atendimento claro, ágil e humano em todas as etapas da jornada.',
    icon: Headphones,
    color: '#F97316', colorBg: 'rgba(249,115,22,0.10)',
    hoverClass: 'hover:border-[#F97316]/25 hover:shadow-[0_20px_60px_rgba(249,115,22,0.08)]',
    items: [
      'Atendimento ético, ágil e respeitoso.',
      'Canais disponíveis para suporte e orientação.',
      'Foco total na experiência do cliente.',
    ],
  },
]

/**
 * Commitments shown in the left column of the policies section.
 * Tune: icon, title, desc, color, colorBg per commitment.
 */
const COMMITMENTS = [
  { icon: ShieldCheck, title: 'Transparência',          desc: 'Agimos com clareza em todas as nossas relações.',              color: '#005BFF', colorBg: 'rgba(0,91,255,0.10)'   },
  { icon: Lock,        title: 'Segurança de dados',     desc: 'Protegemos informações com as melhores práticas do mercado.', color: '#7B2CFF', colorBg: 'rgba(123,44,255,0.10)' },
  { icon: BadgeCheck,  title: 'Qualidade nas entregas', desc: 'Padrões elevados para gerar resultados consistentes.',         color: '#16A34A', colorBg: 'rgba(22,163,74,0.10)'  },
  { icon: Headphones,  title: 'Atendimento responsável',desc: 'Suporte ágil, humano e focado na sua experiência.',            color: '#F97316', colorBg: 'rgba(249,115,22,0.10)' },
]

export default function SobrePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────
           Background tune:
             Gradients:  rgba() in bg-[radial-gradient(...)]
             Dot grid:   opacity-[X] on the dot div
             Blobs:      bg-[COLOR]/[X] + blur-[Xpx]
             Reading mask: lg:w-[X%] + via opacity
      ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#F7F8FC] py-20 lg:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {/* Radial gradient zones */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(0,91,255,0.08),transparent_32%),radial-gradient(circle_at_85%_35%,rgba(123,44,255,0.14),transparent_38%),radial-gradient(circle_at_60%_95%,rgba(0,163,255,0.10),transparent_42%)]" />
          {/* Dot grid */}
          <div className="absolute inset-0 opacity-[0.28] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.16)_1px,transparent_0)] bg-[size:28px_28px]" />
          {/* Reading mask — keeps text side clean */}
          <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#F7F8FC] via-[#F7F8FC]/90 to-transparent lg:w-[56%]" />
          {/* Blur blobs */}
          <div className="absolute -left-40 top-20 h-[460px] w-[460px] rounded-full bg-[#00A3FF]/[0.08] blur-3xl" />
          <div className="absolute -right-40 top-10 h-[560px] w-[560px] rounded-full bg-[#7B2CFF]/[0.12] blur-3xl" />
          <div className="absolute right-20 -bottom-40 h-[500px] w-[500px] rounded-full bg-[#005BFF]/[0.08] blur-3xl" />
        </div>

        <Container className="relative z-10">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 xl:gap-20">

            {/* ── Left — text ─────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Badge */}
              <span className="inline-flex items-center gap-2 rounded-full border border-[#005BFF]/15 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#005BFF] shadow-sm backdrop-blur">
                <Sparkles size={13} aria-hidden="true" />
                Sobre a LOBBY
              </span>

              {/* H1 — tune gradient word here */}
              <h1
                className="mt-6 text-4xl font-bold leading-tight text-[#0B1020] sm:text-5xl lg:text-[52px]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Tecnologia com{' '}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  propósito
                </span>
                , estratégia e segurança.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#5D6475] md:text-lg">
                A LOBBY transforma desafios complexos em soluções inteligentes. Combinamos automação,
                dados e cibersegurança para impulsionar resultados reais, protegendo o que mais importa:
                o seu negócio.
              </p>

              {/* Differentiator chips — tune: CHIPS array above */}
              <div className="mt-8 flex flex-wrap gap-3">
                {CHIPS.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white/80 px-4 py-2 text-sm font-semibold text-[#0B1020] shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30"
                  >
                    <Icon size={15} style={{ color: '#005BFF' }} aria-hidden="true" />
                    {label}
                  </span>
                ))}
              </div>

              {/* Metrics bar — tune: METRICS array above */}
              <div className="mt-8 overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/85 shadow-[0_8px_40px_rgba(11,16,32,0.06)] backdrop-blur">
                <div className="grid grid-cols-2 md:grid-cols-4">
                  {METRICS.map(({ icon: Icon, value, label, color, colorBg }, i) => (
                    <div
                      key={label}
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
                        <p
                          className="text-base font-bold leading-none"
                          style={{ fontFamily: 'Space Grotesk, sans-serif', color }}
                        >
                          {value}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-snug" style={{ color }}>{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ── Right — orbital visual ───────────────────────── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.65, delay: 0.25, ease: 'easeOut' }}
            >
              {/* Desktop orbital visual
                   Tune: container h/w | ring sizes | central card size | FLOATING_CARDS array */}
              <div className="relative mx-auto hidden h-[520px] max-w-[520px] lg:block">
                {/* Orbital rings */}
                <div className="absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#005BFF]/[0.09]" />
                <div
                  className="absolute left-1/2 top-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#7B2CFF]/[0.20] animate-spin"
                  style={{ animationDuration: '30s' }}
                />
                {/* Inner glow */}
                <div
                  className="absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7B2CFF]/[0.07] blur-2xl animate-pulse motion-reduce:animate-none"
                  style={{ animationDuration: '7s' }}
                />

                {/* Central card — logohome.png, same pattern as HomeHero */}
                <div className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                  <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white shadow-[0_30px_80px_rgba(0,91,255,0.20)]">
                    <Image
                      src="/logohome.png"
                      alt="LOBBY"
                      width={320}
                      height={320}
                      className="h-full w-full object-contain p-3"
                      priority
                      quality={100}
                    />
                  </div>
                </div>

                {/* Floating area cards at corners
                     Animation: slow-float keyframe from globals.css + delay from FLOATING_CARDS */}
                {FLOATING_CARDS.map(({ title, desc, icon: Icon, color, colorBg, pos, delay }) => (
                  <div key={title} className={`${pos} z-10`}>
                    <div
                      className="animate-[slow-float_10s_ease-in-out_infinite] motion-reduce:animate-none"
                      style={{ animationDelay: delay }}
                    >
                      <div className="w-40 rounded-2xl border border-[#E3E7F0] bg-white/90 p-3.5 shadow-lg backdrop-blur transition-all duration-300 hover:border-[#005BFF]/20 hover:shadow-xl">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                            style={{ background: colorBg }}
                            aria-hidden="true"
                          >
                            <Icon size={14} style={{ color }} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#0B1020]">{title}</p>
                            <p className="text-[10px] leading-snug text-[#5D6475]">{desc}</p>
                          </div>
                        </div>
                        <div
                          className="mt-2.5 h-0.5 w-8 rounded-full"
                          style={{ background: `linear-gradient(to right, ${color}, transparent)` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile fallback: 2×2 grid */}
              <div className="mt-10 grid grid-cols-2 gap-4 lg:hidden">
                {FLOATING_CARDS.map(({ title, desc, icon: Icon, color, colorBg }) => (
                  <div key={title} className="rounded-2xl border border-[#E3E7F0] bg-white/90 p-4 shadow-md">
                    <div
                      className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ background: colorBg }}
                      aria-hidden="true"
                    >
                      <Icon size={16} style={{ color }} />
                    </div>
                    <p className="text-sm font-bold text-[#0B1020]">{title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-[#5D6475]">{desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </Container>
      </section>

      {/* ── Nossa Essência ────────────────────────────────────────────
           Background tune: rgba() in radial gradients + dot opacity
           Card tune:       topGrad, color, hoverBorder, hoverShadow in essence array
      ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#F7F8FC] py-20 lg:py-24">
        {/* Subtle background */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(0,91,255,0.06),transparent_40%),radial-gradient(circle_at_80%_30%,rgba(123,44,255,0.07),transparent_38%)]" />
          <div className="absolute inset-0 opacity-[0.18] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.14)_1px,transparent_0)] bg-[size:28px_28px]" />
        </div>

        <Container className="relative z-10">
          {/* Section header */}
          <SectionTitle
            eyebrow="Cultura e propósito"
            title="Nossa essência"
            subtitle="Os princípios que guiam nossa forma de pensar, construir e entregar tecnologia."
            accentLine
          />

          {/* Essence cards */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {essence.map(({ icon: Icon, title, description, items, color, colorBg, topGrad, hoverBorder, hoverShadow }, i) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.45 }}
                className={`group relative flex flex-col overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 p-7 shadow-[0_8px_40px_rgba(11,16,32,0.06)] transition-all duration-300 hover:-translate-y-2 ${hoverBorder} ${hoverShadow}`}
              >
                {/* Top gradient line */}
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${topGrad}`} />

                {/* Icon badge — tune size: h-16 w-16 */}
                <div
                  className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
                  style={{ background: colorBg }}
                  aria-hidden="true"
                >
                  <Icon size={28} style={{ color }} />
                </div>

                {/* Title */}
                <h3
                  className="text-2xl font-bold"
                  style={{ fontFamily: 'Space Grotesk, sans-serif', color }}
                >
                  {title}
                </h3>

                {/* Description */}
                <p className="mt-3 text-sm leading-relaxed text-[#5D6475]">{description}</p>

                {/* Divider */}
                <div className="my-6 h-px bg-[#E3E7F0]" />

                {/* Items with check icons */}
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[#5D6475]">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ background: colorBg }}
                        aria-hidden="true"
                      >
                        <Check size={12} style={{ color }} strokeWidth={2.5} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.article>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Políticas ─────────────────────────────────────────────────
           Background tune:
             Gradients:    rgba() in bg-[radial-gradient(...)]
             Dot grid:     opacity-[X]
             Blobs:        bg-[COLOR]/[X] + blur-[Xpx]
             Orbital rings: border-[COLOR]/[X]
           Left column: COMMITMENTS array above
           Right column: policies array above (accordion)
      ─────────────────────────────────────────────────────────────── */}
      <section id="privacidade" className="relative overflow-hidden bg-[#F7F8FC] py-20 lg:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(0,91,255,0.07),transparent_32%),radial-gradient(circle_at_85%_35%,rgba(123,44,255,0.10),transparent_38%)]" />
          <div className="absolute inset-0 opacity-[0.20] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.14)_1px,transparent_0)] bg-[size:28px_28px]" />
          <div className="absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-[#00A3FF]/[0.07] blur-3xl" />
          <div className="absolute -right-40 bottom-0 h-[500px] w-[500px] rounded-full bg-[#7B2CFF]/[0.09] blur-3xl" />
          {/* Orbital decoration — desktop only, tune sizes and border opacity */}
          <div className="absolute -right-[120px] top-20 hidden h-[520px] w-[520px] rounded-full border border-[#005BFF]/[0.07] lg:block" />
          <div className="absolute -right-[60px] top-32 hidden h-[380px] w-[380px] rounded-full border border-dashed border-[#7B2CFF]/[0.12] lg:block" />
        </div>

        <Container className="relative z-10">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.25fr] xl:gap-20">

            {/* Left — institutional content */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              {/* Badge */}
              <span className="inline-flex items-center gap-2 rounded-full border border-[#005BFF]/15 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#005BFF] shadow-sm backdrop-blur">
                <ShieldCheck size={13} aria-hidden="true" />
                Governança e confiança
              </span>

              {/* Title — tune gradient word */}
              <h2
                className="mt-6 text-3xl font-bold leading-tight text-[#0B1020] md:text-4xl"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Nossas{' '}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #005BFF, #7B2CFF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  políticas
                </span>{' '}
                e compromissos
              </h2>

              <p className="mt-4 max-w-xl text-base leading-relaxed text-[#5D6475] md:text-lg">
                Diretrizes claras para proteger dados, garantir qualidade e manter relações transparentes em cada entrega.
              </p>

              {/* Commitments list — tune: COMMITMENTS array above */}
              <div className="mt-8 space-y-5">
                {COMMITMENTS.map(({ icon: Icon, title, desc, color, colorBg }) => (
                  <div key={title} className="flex items-start gap-4">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                      style={{ background: colorBg }}
                      aria-hidden="true"
                    >
                      <Icon size={20} style={{ color }} />
                    </div>
                    <div>
                      <h3
                        className="text-base font-bold text-[#0B1020]"
                        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        {title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-[#5D6475]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* LGPD note */}
              <div className="mt-8 border-t border-[#E3E7F0] pt-5">
                <div className="flex items-start gap-3 text-sm text-[#5D6475]">
                  <Shield size={17} className="mt-0.5 shrink-0 text-[#005BFF]" aria-hidden="true" />
                  <p>Compromisso com a LGPD e as melhores práticas de segurança da informação.</p>
                </div>
              </div>
            </motion.div>

            {/* Right — premium accordions */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              {/* Accordion tune: space-y controls gap between cards */}
              <Accordion className="space-y-4">
                {policies.map(({ id, title, description, icon: Icon, color, colorBg, hoverClass, items }) => (
                  <AccordionItem
                    key={id}
                    value={id}
                    className={`overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 shadow-[0_8px_40px_rgba(11,16,32,0.06)] backdrop-blur transition-all duration-300 hover:-translate-y-1 ${hoverClass}`}
                  >
                    {/* Trigger — large icon + title + description + chevron */}
                    {/* Tune icon badge: h-14 w-14 | icon: size={24} */}
                    <AccordionTrigger className="p-6 items-start hover:no-underline [&>svg]:mt-5 [&>svg]:shrink-0 [&>svg]:text-[#5D6475]">
                      <div className="flex flex-1 items-start gap-5">
                        <div
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300"
                          style={{ background: colorBg }}
                          aria-hidden="true"
                        >
                          <Icon size={24} style={{ color }} />
                        </div>
                        <div>
                          <h3
                            className="text-base font-bold text-[#0B1020]"
                            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                          >
                            {title}
                          </h3>
                          <p className="mt-1.5 text-sm leading-relaxed text-[#5D6475]">{description}</p>
                        </div>
                      </div>
                    </AccordionTrigger>

                    {/* Content — tune background and check item styling */}
                    <AccordionContent>
                      <div className="px-6 pb-6">
                        <div
                          className="rounded-2xl border border-[#005BFF]/10 px-5 py-4"
                          style={{ background: 'rgba(0,91,255,0.04)' }}
                        >
                          <ul className="space-y-2.5">
                            {items.map((item) => (
                              <li key={item} className="flex items-start gap-2.5 text-sm text-[#5D6475]">
                                <span
                                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                                  style={{ background: colorBg }}
                                  aria-hidden="true"
                                >
                                  <Check size={10} style={{ color }} strokeWidth={2.5} />
                                </span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </div>
        </Container>
      </section>

      {/* ── Termos de uso ────────────────────────────────────────────── */}
      <section id="termos" className="relative overflow-hidden bg-white py-20 lg:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(0,91,255,0.05),transparent_35%),radial-gradient(circle_at_15%_80%,rgba(123,44,255,0.07),transparent_38%)]" />
        </div>
        <Container className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-12 max-w-2xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-[#005BFF]/15 bg-[#F0F4FF] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#005BFF]">
              <FileText size={13} aria-hidden="true" />
              Termos de uso
            </span>
            <h2
              className="mt-6 text-3xl font-bold leading-tight text-[#0B1020] md:text-4xl"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Condições de uso dos{' '}
              <span style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                serviços LOBBY
              </span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#5D6475]">
              Ao utilizar nossos serviços e plataformas, você concorda com as condições descritas abaixo. Leia com atenção.
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {([
              {
                icon: Check,
                title: 'Uso dos serviços',
                body: 'Os serviços da LOBBY são destinados a empresas e profissionais. O uso indevido, redistribuição não autorizada ou engenharia reversa dos sistemas entregues é proibido.',
                color: '#005BFF', bg: 'rgba(0,91,255,0.08)',
              },
              {
                icon: BadgeCheck,
                title: 'Propriedade intelectual',
                body: 'Todo o código, design e materiais produzidos pela LOBBY são protegidos por direitos autorais. A propriedade dos entregáveis é transferida ao cliente após a quitação integral do projeto.',
                color: '#7B2CFF', bg: 'rgba(123,44,255,0.08)',
              },
              {
                icon: Shield,
                title: 'Responsabilidade do usuário',
                body: 'O cliente é responsável pelas informações fornecidas à LOBBY, pelo uso adequado dos sistemas entregues e pela conformidade com legislações aplicáveis ao seu negócio.',
                color: '#10B981', bg: 'rgba(16,185,129,0.08)',
              },
              {
                icon: Lock,
                title: 'Confidencialidade',
                body: 'Ambas as partes se comprometem a manter em sigilo informações estratégicas, técnicas e comerciais compartilhadas durante a relação de prestação de serviços.',
                color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',
              },
              {
                icon: Settings2,
                title: 'Modificações e rescisão',
                body: 'A LOBBY pode atualizar estes termos a qualquer momento, com aviso prévio de 15 dias. A rescisão contratual segue as condições previstas no contrato de serviço assinado entre as partes.',
                color: '#00A3FF', bg: 'rgba(0,163,255,0.08)',
              },
              {
                icon: Layers,
                title: 'Foro competente',
                body: 'Eventuais litígios serão resolvidos conforme a legislação brasileira, elegendo-se o foro da comarca de sede da LOBBY como competente, salvo disposição contratual em contrário.',
                color: '#EF4444', bg: 'rgba(239,68,68,0.08)',
              },
            ] as const).map(({ icon: Icon, title, body, color, bg }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.4 }}
                className="rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC]/60 p-6 transition-all hover:border-[#005BFF]/20 hover:shadow-[0_8px_32px_rgba(0,91,255,0.07)]"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: bg }}>
                  <Icon size={20} style={{ color }} aria-hidden="true" />
                </div>
                <h3 className="mb-2 text-base font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-[#5D6475]">{body}</p>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="mt-10 text-center text-xs text-[#5D6475]"
          >
            Dúvidas sobre os termos?{' '}
            <Link href="/contato" className="font-semibold text-[#005BFF] transition-colors hover:text-[#7B2CFF]">
              Entre em contato
            </Link>
            {' '}— respondemos em até 1 dia útil. Última atualização: janeiro de 2025.
          </motion.p>
        </Container>
      </section>

      {/* ── CTA final ────────────────────────────────────────────────
           Tune:
             gradient:     style background linear-gradient colors
             dot grid:     opacity-[X] on the dot div
             blobs:        bg-white/[X] + blur-[Xpx]
             orbital rings: border-white/[X]
             button:       bg-white px-7 py-4 colors
      ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white py-16">
        <Container>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-[2rem] p-8 text-white shadow-[0_24px_80px_rgba(0,91,255,0.22)] md:p-12"
            style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
          >
            {/* White dot grid */}
            <div
              className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.9)_1px,transparent_0)] bg-[size:24px_24px]"
              aria-hidden="true"
            />
            {/* Blur blobs */}
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.08] blur-2xl" aria-hidden="true" />
            <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[#00A3FF]/[0.14] blur-2xl" aria-hidden="true" />
            {/* Orbital rings — desktop only */}
            <div className="absolute right-16 top-1/2 hidden h-64 w-64 -translate-y-1/2 rounded-full border border-white/[0.14] lg:block" aria-hidden="true" />
            <div className="absolute right-28 top-1/2 hidden h-44 w-44 -translate-y-1/2 rounded-full border border-dashed border-white/[0.18] lg:block" aria-hidden="true" />

            {/* Content */}
            <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              {/* Left */}
              <div className="flex items-start gap-5">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/[0.15] backdrop-blur">
                  <FileText size={28} className="text-white" aria-hidden="true" />
                </div>
                <div>
                  <h2
                    className="text-2xl font-bold md:text-3xl"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    Vamos construir tecnologia com propósito?
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85 md:text-base">
                    Fale com a LOBBY e descubra como transformar desafios em soluções digitais seguras,
                    eficientes e alinhadas ao seu negócio.
                  </p>
                  {/* Benefit pills */}
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {['Diagnóstico gratuito', 'Equipe especializada', 'Resultados mensuráveis'].map(b => (
                      <span
                        key={b}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.12] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <Check size={11} aria-hidden="true" />
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right — button + security note */}
              <div className="flex flex-col items-center gap-3">
                <Link
                  href="/contato"
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 text-sm font-bold text-[#005BFF] shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl whitespace-nowrap"
                >
                  Falar com especialista
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-white/75">
                  <Lock size={13} aria-hidden="true" />
                  Sua informação está 100% segura
                </p>
              </div>
            </div>
          </motion.div>
        </Container>
      </section>
    </>
  )
}
