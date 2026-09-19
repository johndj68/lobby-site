'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowRight, TrendingUp, DollarSign } from 'lucide-react'
import { Project } from '@/types'
import { formatCurrencyBRL } from '@/lib/finance'
import { CATEGORY_STYLE, DEFAULT_CATEGORY_STYLE } from '@/lib/categories'
import ProjectMockup from './ProjectMockup'
import { colors, shadows, borderRadius } from '@/lib/design-tokens'

// Estilo padrão usado quando a categoria do projeto não tem mapeamento em CATEGORY_STYLE
const DEFAULT_STYLE = DEFAULT_CATEGORY_STYLE

/* Props do componente:
   - project: objeto completo do projeto (título, categoria, imagem, tags, impacto, preço etc.)
   - index: posição do card no grid — usada para escalonar o delay da animação de entrada */
interface ProjectCardProps {
  project: Project
  index?: number
}

export default function ProjectCard({ project, index = 0 }: ProjectCardProps) {
  // Extrai a categoria como string para usar como chave nos mapeamentos de estilo
  const cat   = project.category as string
  // Busca o estilo (cores) da categoria; cai no padrão se não encontrar
  const style = CATEGORY_STYLE[cat] ?? DEFAULT_STYLE

  return (
    // Card animado: entra deslizando de baixo para cima com fade-in.
    // delay escalonado via index para criar efeito cascata no grid.
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay: index * 0.1 }}
      className="group flex flex-col overflow-hidden bg-white/90 transition-all duration-300 hover:-translate-y-2 hover:border-[#005BFF]/25 hover:shadow-[0_24px_80px_rgba(0,91,255,0.12)]"
      style={{
        borderRadius: borderRadius['3xl'],
        border: `1px solid ${colors.border}`,
        boxShadow: shadows.card,
      }}
    >
      {/* ── Visual area: real image if available, otherwise generated mockup ── */}
      {/* Área visual: exibe imagem real (URL externa) ou mockup gerado com base no slug/categoria */}
      <div className="relative h-56 overflow-hidden transition-transform duration-500 group-hover:scale-[1.02]">
        {project.imageUrl?.startsWith('http') ? (
          // Imagem real hospedada externamente
          <Image
            src={project.imageUrl}
            alt={project.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          // Mockup gerado automaticamente quando não há imagem real
          <ProjectMockup slug={project.slug} category={cat} />
        )}
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col p-6">
        {/* Category + tipo badges */}
        {/* Badge de categoria com cores dinâmicas; badge de preço aparece apenas em projetos pagos */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {/* Badge da categoria — cor de fundo e texto vêm do mapeamento CATEGORY_STYLE */}
          <span
            className="inline-flex self-start rounded-full border px-3 py-1 text-xs font-semibold"
            style={{ background: style.bg, color: style.text, borderColor: style.border }}
          >
            {cat}
          </span>
          {/* Badge de projeto pago — mostra preço formatado em BRL ou texto genérico */}
          {project.isPaid && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#D97706]/25 bg-[#D97706]/8 px-2.5 py-1 text-xs font-bold text-[#D97706]">
              <DollarSign size={11} aria-hidden="true" />
              {project.price != null ? formatCurrencyBRL(project.price) : 'Projeto pago'}
            </span>
          )}
        </div>

        {/* Título do projeto */}
        <h3
          className="mb-2 text-base font-bold leading-snug"
          style={{ fontFamily: 'Space Grotesk, sans-serif', color: colors.text }}
        >
          {project.title}
        </h3>

        {/* Descrição resumida do projeto */}
        <p className="mb-5 text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
          {project.description}
        </p>

        {/* Espaçador flexível — empurra o rodapé (impacto, tags, CTA) para baixo */}
        <div className="flex-1" />

        {/* Impact pill — tune bg/color/border here */}
        {/* Pílula de impacto: exibe o resultado de negócio do projeto (ex: "30% de redução de custo") */}
        {project.impact && (
          <div className="mb-4 inline-flex items-center gap-1.5 self-start rounded-full border border-[#005BFF]/15 bg-[#005BFF]/[0.07] px-3 py-1.5 text-xs font-semibold text-[#005BFF]">
            <TrendingUp size={11} aria-hidden="true" />
            {project.impact}
          </div>
        )}

        {/* Tags */}
        {/* Lista de tecnologias/tópicos usados no projeto — exibidas como pílulas cinzas */}
        {project.tags && project.tags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border px-2.5 py-1 text-xs font-medium"
                style={{
                  borderColor: colors.border,
                  backgroundColor: colors.backgroundAlt,
                  color: colors.textSecondary,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* CTA — link para a página de detalhes do projeto */}
        <Link
          href={`/projetos/${project.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-all hover:text-[#7B2CFF]"
          style={{ color: colors.primary }}
        >
          Ver projeto
          {/* Seta que desliza para direita no hover do card (group-hover) */}
          <ArrowRight
            size={14}
            className="transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </div>
    </motion.article>
  )
}
