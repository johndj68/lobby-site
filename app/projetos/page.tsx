'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight, Rocket, Building2, Star, Clock,
  Grid2X2, Code2, Bot, BarChart3, Shield,
} from 'lucide-react'
import Container from '@/components/layout/Container'
import CTASection from '@/components/sections/CTASection'
import ProjectCard from '@/components/cards/ProjectCard'
import Pagination from '@/components/ui/Pagination'
import { projects as staticProjects, metrics } from '@/lib/data'
import { createClient } from '@/lib/supabase'
import type { Category } from '@/types'

const PROJECTS_PER_PAGE = 9

/**
 * Icon map for metric cards — keys match the `icon` string field in lib/data.ts metrics.
 * Tune: add/change icons by updating this map.
 */
const METRIC_ICONS: Record<string, React.ElementType> = {
  Rocket, Building2, Star, Clock,
}

/**
 * Per-metric color: hex (icon + number + label) + colorBg (icon badge background).
 * Keys match the `icon` string field in lib/data.ts metrics.
 * Tune: change hex/colorBg values here.
 *   Projetos entregues  → blue   #005BFF
 *   Empresas atendidas  → purple #7B2CFF
 *   Satisfação          → green  #16A34A
 *   Tempo médio         → orange #F97316
 */
const METRIC_COLORS: Record<string, { hex: string; bg: string }> = {
  Rocket:    { hex: '#005BFF', bg: 'rgba(0,91,255,0.10)'   },
  Building2: { hex: '#7B2CFF', bg: 'rgba(123,44,255,0.10)' },
  Star:      { hex: '#16A34A', bg: 'rgba(22,163,74,0.10)'  },
  Clock:     { hex: '#F97316', bg: 'rgba(249,115,22,0.10)' },
}
const DEFAULT_METRIC_COLOR = { hex: '#005BFF', bg: 'rgba(0,91,255,0.10)' }

/**
 * Filter tabs config.
 * Tune: change icon per category by updating `icon` here.
 */
const FILTERS: { cat: Category; icon: React.ElementType }[] = [
  { cat: 'Todos',          icon: Grid2X2  },
  { cat: 'Software',       icon: Code2    },
  { cat: 'Automação',      icon: Bot      },
  { cat: 'Dados',          icon: BarChart3 },
  { cat: 'Cibersegurança', icon: Shield   },
]

export default function ProjetosPage() {
  const [active, setActive] = useState<Category>('Todos')
  const [page,   setPage]   = useState(0)
  // Inicia com os projetos estáticos já carregados
  const [extraProjects, setExtraProjects] = useState<typeof staticProjects>([])

  /* ── Fetch projects from Supabase ────────────────────────────
     Merge: DB sobrescreve estáticos por slug (edições do técnico,
     incluindo marcar como pago), e projetos novos (slug inédito) são
     adicionados ao final. Antes isso só filtrava os do banco que NÃO
     batiam com slug estático — na prática nenhuma edição feita no painel
     em um projeto originado de lib/data.ts aparecia aqui. */
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('lobby_projects')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data || data.length === 0) return
        const dbMapped = data.map(row => ({
          id:          row.id,
          title:       row.title,
          description: row.description,
          category:    row.category as Category,
          imageUrl:    row.image_url ?? '',
          slug:        row.slug,
          impact:      row.impact,
          tags:        row.tags ?? [],
          isPaid:      row.is_paid ?? false,
          price:       row.price ?? null,
        }))
        setExtraProjects(dbMapped)
      })
  }, [])

  // Merge final: banco sobrescreve estático por slug, novos são anexados
  const allProjects = useMemo(() => {
    const dbSlugs = new Set(extraProjects.map(p => p.slug))
    return [...staticProjects.filter(p => !dbSlugs.has(p.slug)), ...extraProjects]
  }, [extraProjects])

  const filtered = useMemo(
    () => active === 'Todos' ? allProjects : allProjects.filter(p => p.category === active),
    [active, allProjects]
  )

  const countFor = useMemo(
    () => (cat: Category): number =>
      cat === 'Todos' ? allProjects.length : allProjects.filter(p => p.category === cat).length,
    [allProjects]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PROJECTS_PER_PAGE))
  const paginated  = filtered.slice(page * PROJECTS_PER_PAGE, (page + 1) * PROJECTS_PER_PAGE)

  // Reset page ao mudar filtro
  const handleFilter = (cat: Category) => { setActive(cat); setPage(0) }

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────
           Background tune:
             Gradients:  rgba() values in bg-[radial-gradient(...)]
             Dot grid:   opacity-[X] on the dot div
             Blobs:      bg-[COLOR]/[X] + blur-[Xpx]
      ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#F7F8FC] py-20 lg:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {/* Radial gradient zones */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,91,255,0.08),transparent_32%),radial-gradient(circle_at_85%_30%,rgba(123,44,255,0.14),transparent_36%),radial-gradient(circle_at_55%_95%,rgba(0,163,255,0.10),transparent_42%)]" />
          {/* Dot grid */}
          <div className="absolute inset-0 opacity-[0.28] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.16)_1px,transparent_0)] bg-[size:28px_28px]" />
          {/* Blur blobs */}
          <div className="absolute -left-40 top-20 h-[480px] w-[480px] rounded-full bg-[#00A3FF]/[0.08] blur-3xl" />
          <div className="absolute -right-40 top-10 h-[560px] w-[560px] rounded-full bg-[#7B2CFF]/[0.12] blur-3xl" />
          <div className="absolute right-0 -bottom-40 h-[420px] w-[700px] rounded-full bg-[#005BFF]/[0.07] blur-3xl" />
        </div>

        <Container className="relative z-10">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">

            {/* Left — text */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Badge — tune: text, icon, colors */}
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#005BFF]/15 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#005BFF] shadow-sm backdrop-blur">
                <Rocket size={13} aria-hidden="true" />
                Projetos que geram impacto
              </span>

              {/* H1 — tune gradient word (currently "tecnologia") */}
              <h1
                className="text-4xl font-bold leading-tight text-[#0B1020] sm:text-5xl lg:text-[52px]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Projetos que mostram o que a{' '}
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
                pode fazer.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#5D6475] md:text-lg">
                Conheça exemplos de soluções digitais desenvolvidas pela LOBBY para diferentes necessidades de negócio. Cada projeto entregue com foco em resultado, eficiência e segurança.
              </p>

              {/* CTAs — tune: gradient from/to, hover shadows */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/contato"
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-7 py-4 text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(123,44,255,0.28)]"
                >
                  Quero algo parecido
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
                <Link
                  href="/contato"
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white/85 px-7 py-4 text-sm font-bold text-[#0B1020] shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:text-[#005BFF]"
                >
                  Falar com especialista
                </Link>
              </div>
            </motion.div>

            {/* Right — metric cards (desktop only)
                 Tune: card shadow, icon bg, hover shadow, gradient             */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="hidden lg:grid grid-cols-2 gap-4"
            >
              {metrics.map((m, i) => {
                const Icon  = METRIC_ICONS[m.icon ?? ''] ?? Rocket
                const mc    = METRIC_COLORS[m.icon ?? ''] ?? DEFAULT_METRIC_COLOR
                return (
                  <motion.article
                    key={m.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.32 + i * 0.09 }}
                    className="group rounded-3xl border border-[#E3E7F0] bg-white/85 p-6 shadow-[0_8px_40px_rgba(11,16,32,0.06)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/25 hover:shadow-[0_20px_60px_rgba(0,91,255,0.12)]"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105"
                        style={{ background: mc.bg }}
                        aria-hidden="true"
                      >
                        <Icon size={20} style={{ color: mc.hex }} />
                      </div>
                      <div>
                        <p
                          className="text-3xl font-bold leading-none"
                          style={{ fontFamily: 'Space Grotesk, sans-serif', color: mc.hex }}
                        >
                          {m.value}
                        </p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: mc.hex }}>
                          {m.label}
                        </p>
                      </div>
                    </div>
                  </motion.article>
                )
              })}
            </motion.div>
          </div>
        </Container>
      </section>

      {/* ── Filters + Grid ────────────────────────────────────────────
           Filter bar:  rounded-3xl card with icon+counter per filter
           Grid:        1-col mobile → 2-col tablet → 3-col desktop
           Tune grid gap: gap-6 | xl:gap-8
      ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#F7F8FC] pb-20 pt-10">
        {/* Subtle background */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(123,44,255,0.05),transparent_40%),radial-gradient(circle_at_20%_80%,rgba(0,91,255,0.05),transparent_40%)]" />
          <div className="absolute inset-0 opacity-[0.16] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.14)_1px,transparent_0)] bg-[size:28px_28px]" />
        </div>

        <Container className="relative z-10">
          {/* Premium filter bar
               Tune: card shadow, active gradient, active shadow, counter bg   */}
          <div className="mb-10 overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 p-4 shadow-[0_20px_70px_rgba(11,16,32,0.08)] backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <p className="shrink-0 text-sm font-medium text-[#5D6475]">
                Explore nossos principais cases por categoria.
              </p>

              <div className="flex flex-wrap gap-2">
                {FILTERS.map(({ cat, icon: Icon }) => {
                  const isActive = active === cat
                  const count   = countFor(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleFilter(cat)}
                      className={
                        isActive
                          ? 'inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-transparent bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-sm font-bold text-white shadow-[0_6px_20px_rgba(0,91,255,0.22)] transition-all duration-300'
                          : 'group inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#E3E7F0] bg-white px-4 py-2 text-sm font-medium text-[#5D6475] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:bg-[#005BFF]/[0.04] hover:text-[#005BFF]'
                      }
                    >
                      <Icon size={14} aria-hidden="true" />
                      {cat}
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

          {/* Project grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:gap-8">
            {paginated.map((project, i) => (
              <ProjectCard key={project.id} project={project} index={i} />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            className="mt-10"
          />

          {/* ── Inline CTA card ──────────────────────────────────────
               Tune: gradient from/to on the button, shadow values     */}
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
                    Gostou do que viu?
                  </h3>
                  <p className="text-sm text-[#5D6475]">
                    Vamos criar uma solução sob medida para sua operação.
                  </p>
                </div>
              </div>
              <Link
                href="/contato"
                className="group inline-flex shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-6 py-3.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,91,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(123,44,255,0.28)]"
              >
                Fale com um especialista
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          </motion.div>
        </Container>
      </section>

      <CTASection
        title="Pronto para transformar sua ideia em solução?"
        description="Fale com um especialista e descubra como a LOBBY pode impulsionar seu negócio."
        buttonLabel="Solicitar diagnóstico gratuito"
        benefits={['Diagnóstico gratuito', 'Plano de ação inicial', 'Resultado mensurável']}
      />
    </>
  )
}
