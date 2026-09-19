'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import Container from '@/components/layout/Container'
import SectionTitle from '@/components/sections/SectionTitle'
import ProjectCard from '@/components/cards/ProjectCard'
import { Project } from '@/types'

/* Props da seção:
   - projects: array de projetos do portfólio a serem exibidos no grid.
     Tipicamente os projetos em destaque selecionados para a home. */
interface HomeProjectsProps {
  projects: Project[]
}

export default function HomeProjects({ projects }: HomeProjectsProps) {
  return (
    /**
     * Background tune:
     *   radial gradients: rgba(R,G,B, OPACITY) in the bg-[...] string
     *   dot grid:         opacity-[X] value below
     *   blobs:            bg-[COLOR]/[X] + blur-[Xpx]
     */
    /* Seção com fundo cinza claro (#F7F8FC), separada da seção anterior
       por uma borda superior. Contém gradientes radiais e blobs decorativos
       para profundidade visual. */
    <section className="relative overflow-hidden border-t border-[#E3E7F0] bg-[#F7F8FC] py-20 lg:py-24">
      {/* Radial gradient zones */}
      {/* Gradientes radiais sutis nos cantos — criam profundidade sem poluir */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_80%,rgba(0,91,255,0.07),transparent_35%),radial-gradient(circle_at_80%_18%,rgba(123,44,255,0.08),transparent_38%)]" />
      {/* Dot grid */}
      {/* Grade de pontos azuis semitransparentes — textura de fundo */}
      <div className="absolute inset-0 opacity-[0.26] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.16)_1px,transparent_0)] bg-[size:26px_26px]" />
      {/* Blur blobs */}
      {/* Blob azul no canto inferior esquerdo */}
      <div className="absolute -left-32 bottom-10 h-72 w-72 rounded-full bg-[#005BFF]/[0.07] blur-3xl" aria-hidden="true" />
      {/* Blob roxo no canto superior direito */}
      <div className="absolute -right-32 top-10 h-80 w-80 rounded-full bg-[#7B2CFF]/[0.08] blur-3xl" aria-hidden="true" />

      <Container className="relative z-10">
        {/* ── Header row ──────────────────────────────────────────── */}
        {/* Cabeçalho: título à esquerda + botão "Ver todos" à direita no desktop */}
        <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          {/* Título da seção com eyebrow "Cases reais" e linha de acento */}
          <SectionTitle
            eyebrow="Cases reais"
            title="Projetos em destaque"
            subtitle="Soluções reais que geram impacto e impulsionam resultados."
            centered={false}
            accentLine
            className="mb-0"
          />

          {/* CTA button — tune colors/padding here */}
          {/* Botão que leva para a página completa do portfólio */}
          <Link
            href="/projetos"
            className="group inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-[#005BFF]/25 bg-white px-5 py-3 text-sm font-semibold text-[#005BFF] shadow-sm transition-all hover:border-[#005BFF] hover:bg-[#005BFF] hover:text-white sm:self-auto"
          >
            Ver todos os projetos
            {/* Seta desliza para direita no hover */}
            <ArrowRight
              size={15}
              className="transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </div>

        {/* ── Project grid — tune gap and cols here ───────────────── */}
        {/* Grid de ProjectCards: 1 coluna no mobile, 3 no desktop.
            O index passado para cada card escaloniza a animação de entrada. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:gap-8">
          {projects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>
      </Container>
    </section>
  )
}
