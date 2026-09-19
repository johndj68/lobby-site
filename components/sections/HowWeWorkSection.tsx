'use client'

import { motion } from 'framer-motion'
import { Search, Lightbulb, Code2, Rocket } from 'lucide-react'
import Container from '@/components/layout/Container'
import SectionTitle from '@/components/sections/SectionTitle'
import type { Step } from '@/types'

/**
 * Icon mapped by step index (0-based). Add/change icons here.
 * Ícones dos 4 passos do processo, indexados por posição:
 * 0-Diagnóstico, 1-Estratégia, 2-Execução, 3-Entrega
 * Tune colors in ICON_GRADIENT below.
 */
const STEP_ICONS = [Search, Lightbulb, Code2, Rocket]

/**
 * Gradient used for number circles and icon badge backgrounds.
 * Gradiente azul→roxo usado nos círculos de número e nos badges de ícone.
 * Tune here to change accent colors across all steps.
 */
const NUMBER_GRADIENT = 'linear-gradient(135deg, #005BFF, #7B2CFF)'
// Fundo semitransparente dos badges de ícone — combina com NUMBER_GRADIENT
const ICON_BG        = 'linear-gradient(135deg, rgba(0,91,255,0.10), rgba(123,44,255,0.10))'

/* Props da seção:
   - steps: array de objetos Step com number, title e description.
     Os dados vêm do CMS/banco e definem os 4 passos do processo. */
interface HowWeWorkSectionProps {
  steps: Step[]
}

export default function HowWeWorkSection({ steps }: HowWeWorkSectionProps) {
  return (
    /**
     * Background tune:
     *   radial gradients: rgba(R,G,B, OPACITY) inside the bg-[...] string
     *   dot grid:         opacity-[X] on the dot div
     */
    /* Seção com fundo branco + gradientes radiais sutis nas extremidades
       e grade de pontos semitransparente para textura */
    <section className="relative overflow-hidden bg-white py-20 lg:py-24">
      {/* Background layers */}
      {/* Gradientes radiais decorativos nos cantos da seção */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(0,91,255,0.06),transparent_32%),radial-gradient(circle_at_82%_62%,rgba(123,44,255,0.07),transparent_35%)]" />
      {/* Grade de pontos azuis semitransparentes — textura de fundo */}
      <div className="absolute inset-0 opacity-[0.20] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.14)_1px,transparent_0)] bg-[size:26px_26px]" />

      <Container className="relative z-10">
        {/* Cabeçalho da seção: eyebrow "Nosso processo", título e subtítulo */}
        <SectionTitle
          eyebrow="Nosso processo"
          title="Como trabalhamos"
          subtitle="Um processo claro, colaborativo e focado em resultados."
          accentLine
        />

        {/*
         * Layout: number circle (outside card) + card below.
         * Connection line: top-6 = center of h-12 circle (48px / 2 = 24px = top-6).
         * Line left/right: 12.5% = center of first/last column in 4-col grid.
         * Dots at 25%, 50%, 75% = midpoints between column centers.
         * All hidden below xl (4-col) to avoid visual glitches in 2-col layout.
         *
         * Linha de conexão entre os passos: só visível em xl (4 colunas).
         * Os círculos numerados ficam acima (z-10) da linha.
         */}
        <div className="relative">
          {/* ── Connection line ──────────────────────────────────── */}
          {/* Tune opacity via rgba values; length via left/right */}
          {/* Linha horizontal que conecta os 4 passos visualmente — oculta abaixo de xl */}
          <div
            className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-px xl:block"
            style={{
              background:
                'linear-gradient(to right, transparent 0%, rgba(0,91,255,0.50) 25%, rgba(123,44,255,0.60) 75%, transparent 100%)',
            }}
            aria-hidden="true"
          />

          {/* ── Glow dots between steps — tune size/color/blur here ── */}
          {/* Pontos luminosos nos pontos de junção entre passos (25%, 50%, 75%) */}
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="absolute top-6 hidden h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#005BFF]/45 shadow-[0_0_8px_rgba(0,91,255,0.55)] xl:block"
              style={{ left: `${pct}%` }}
              aria-hidden="true"
            />
          ))}

          {/* ── Steps grid ────────────────────────────────────────── */}
          {/* Grid responsivo: 1 coluna no mobile, 2 no tablet, 4 no desktop */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, i) => {
              // Seleciona o ícone pelo índice; cai em Rocket se houver mais de 4 passos
              const Icon = STEP_ICONS[i] ?? Rocket

              return (
                // Card animado: entrada com fade + slide escalonado por índice
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.45, delay: i * 0.1 }}
                  className="group flex flex-col items-center text-center"
                >
                  {/* Number circle — above the card, z-10 so it sits above the line */}
                  {/* Tune size: h-12 w-12 | shadow: shadow-[#005BFF]/X */}
                  {/* Círculo numerado: fica acima da linha de conexão (z-10).
                      Intensifica o glow/shadow no hover do card. */}
                  <div
                    className="relative z-10 mb-5 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg shadow-[#005BFF]/22 transition-shadow duration-300 group-hover:shadow-[0_0_20px_rgba(0,91,255,0.45)]"
                    style={{ background: NUMBER_GRADIENT, fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    {step.number}
                  </div>

                  {/* Card body */}
                  {/* Tune: border, shadow, hover-shadow, hover-border here */}
                  {/* Card branco com bordas arredondadas: sobe 2px e intensifica sombra no hover */}
                  <div className="w-full rounded-3xl border border-[#E3E7F0] bg-white/90 p-6 shadow-[0_8px_40px_rgba(11,16,32,0.06)] transition-all duration-300 hover:-translate-y-2 hover:border-[#005BFF]/20 hover:shadow-[0_20px_60px_rgba(0,91,255,0.10)]">
                    {/* Icon badge — tune size: h-12 w-12, icon size: size={22} */}
                    {/* Badge de ícone: escala 110% no hover do card (via group-hover) */}
                    <div
                      className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
                      style={{ background: ICON_BG }}
                      aria-hidden="true"
                    >
                      <Icon size={22} style={{ color: '#005BFF' }} />
                    </div>

                    {/* Título do passo */}
                    <h3
                      className="mb-2 text-base font-bold text-[#0B1020]"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                    >
                      {step.title}
                    </h3>
                    {/* Descrição do que acontece neste passo do processo */}
                    <p className="text-sm leading-relaxed text-[#5D6475]">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </Container>
    </section>
  )
}
