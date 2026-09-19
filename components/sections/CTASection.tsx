'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Check, FileText } from 'lucide-react'
import Container from '@/components/layout/Container'

/**
 * CTASection — generic CTA block used across all pages.
 *
 * Bloco de chamada pra ação reutilizável, usado no final das páginas
 * para converter visitantes em leads (ex: "Solicitar diagnóstico gratuito").
 *
 * benefits?: optional pill list shown below the description.
 *   Lista opcional de benefícios exibida como pílulas abaixo da descrição.
 *   e.g. ['Diagnóstico gratuito', 'Plano de ação inicial', 'Solução sob medida']
 *
 * Tune:
 *   gradient:  bg-gradient values on the outer motion.div
 *   shadow:    shadow-[...] on the outer motion.div
 *   dots:      opacity-[X] on the dot grid div
 *   blobs:     bg-white/[X] blur-[Xpx] on each blob
 *   icon bg:   bg-white/[X] on the icon wrapper
 *   button:    hover:bg-white/X on the Link
 */

/* Props do CTASection — todos opcionais, com valores padrão sensatos:
   - title: título principal da seção
   - description: subtítulo/descrição complementar
   - buttonLabel: texto do botão de ação
   - buttonHref: destino do botão (padrão: página de contato)
   - benefits: array de strings exibidas como pílulas de benefício abaixo da descrição */
interface CTASectionProps {
  title?: string
  description?: string
  buttonLabel?: string
  buttonHref?: string
  benefits?: string[]
}

export default function CTASection({
  title       = 'Quer uma análise gratuita da sua empresa?',
  description = 'Receba um diagnóstico prático com insights e recomendações personalizadas.',
  buttonLabel = 'Solicitar diagnóstico gratuito',
  buttonHref  = '/contato',
  benefits,
}: CTASectionProps) {
  return (
    <section className="py-20">
      <Container>
        {/* Card animado com gradiente azul/roxo — entra com fade-in + slide de baixo */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-[2rem] p-10 shadow-[0_24px_80px_rgba(0,91,255,0.22)] md:p-14"
          style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}
        >
          {/* Decorative blobs — tune h/w and blur here */}
          {/* Blob decorativo no canto superior direito */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.08] blur-2xl" aria-hidden="true" />
          {/* Blob decorativo azul claro na parte inferior */}
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[#00A3FF]/[0.14] blur-2xl" aria-hidden="true" />

          {/* White dot grid — tune opacity-[X] here */}
          {/* Grade de pontos brancos semitransparentes — textura de fundo */}
          <div
            className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.9)_1px,transparent_0)] bg-[size:24px_24px]"
            aria-hidden="true"
          />

          {/* Content */}
          {/* Layout de duas colunas no desktop: conteúdo à esquerda, botão à direita */}
          <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-5">
              {/* Icon */}
              {/* Ícone decorativo em badge branco semitransparente */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.15] backdrop-blur">
                <FileText size={24} className="text-white" aria-hidden="true" />
              </div>

              <div>
                {/* Title + description */}
                {/* Título e descrição da chamada pra ação */}
                <h3
                  className="text-2xl font-bold text-white md:text-3xl"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {title}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
                  {description}
                </p>

                {/* Benefits pills — only render when prop is provided */}
                {/* Pílulas de benefício — só renderizadas quando o prop benefits é passado */}
                {benefits && benefits.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {benefits.map((b) => (
                      <span
                        key={b}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.12] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <Check size={11} aria-hidden="true" />
                        {b}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* CTA button */}
            {/* Botão principal branco — contrasta com o fundo gradiente */}
            <Link
              href={buttonHref}
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 text-sm font-bold text-[#005BFF] shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-xl whitespace-nowrap"
            >
              {buttonLabel}
              {/* Seta desliza para direita no hover */}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>
        </motion.div>
      </Container>
    </section>
  )
}
