'use client'

import { motion } from 'framer-motion'
import { FileText, Clock, Signal } from 'lucide-react'
import { Resource } from '@/types'
import { CATEGORY_STYLE, DEFAULT_CATEGORY_STYLE } from '@/lib/categories'
import ResourceCover from './ResourceCover'
import EbookAccessBadge from './EbookAccessBadge'
import EbookDownloadButton from './EbookDownloadButton'
import { colors, shadows, borderRadius } from '@/lib/design-tokens'

// Estilo padrão de categoria para quando o recurso não tem categoria mapeada
const DEFAULT_CAT_STYLE = DEFAULT_CATEGORY_STYLE

/**
 * Level pill styles — tune bg/text/border per level.
 * Cores das pílulas de nível de dificuldade do recurso:
 * - Iniciante: verde
 * - Intermediário: âmbar
 * - Avançado: vermelho
 */
const LEVEL_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  'Iniciante':     { bg: 'rgba(22,163,74,0.08)',  text: '#16A34A', border: 'rgba(22,163,74,0.22)'  },
  'Intermediário': { bg: 'rgba(217,119,6,0.08)',  text: '#D97706', border: 'rgba(217,119,6,0.22)'  },
  'Avançado':      { bg: 'rgba(220,38,38,0.08)',  text: '#DC2626', border: 'rgba(220,38,38,0.22)'  },
}

/* Props do ResourceCard:
   - resource: objeto completo do recurso (título, categoria, nível, formato, preço etc.)
   - onDownload: callback chamado ao baixar recurso gratuito (para registrar download)
   - onBuyClick: callback chamado ao clicar em "Comprar" — abre modal de pagamento
   - isLoggedIn: se o usuário está autenticado (controla CTA de login vs compra)
   - isPurchased: se o usuário já comprou este recurso (libera o botão de download)
   - creditBalance: saldo de créditos do usuário (null = não carregado/deslogado)
   - onRedeemedWithCredits: callback chamado após resgate bem-sucedido com créditos
   - index: posição no grid — usada para escalonar a animação de entrada */
interface ResourceCardProps {
  resource:       Resource
  onDownload:     (resource: Resource) => void
  onBuyClick:     (resource: Resource) => void
  isLoggedIn:     boolean
  isPurchased:    boolean
  creditBalance:  number | null
  onRedeemedWithCredits: (resource: Resource) => void
  index?: number
}

export default function ResourceCard({ resource, onDownload, onBuyClick, isLoggedIn, isPurchased, creditBalance, onRedeemedWithCredits, index = 0 }: ResourceCardProps) {
  // Categoria do recurso como string para usar nos mapeamentos de estilo
  const cat        = resource.category as string
  // Estilo de cor da categoria (badge colorido no topo do card)
  const catStyle   = CATEGORY_STYLE[cat] ?? DEFAULT_CAT_STYLE
  // Estilo de cor do nível de dificuldade; cai em "Iniciante" se o nível não for reconhecido
  const levelStyle = resource.level ? (LEVEL_STYLE[resource.level] ?? LEVEL_STYLE['Iniciante']) : null

  return (
    // Card animado com layout horizontal no desktop (sm:flex-row) e vertical no mobile.
    // Delay escalonado via index para efeito cascata no grid.
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay: index * 0.09 }}
      className="group flex flex-col overflow-hidden bg-white/90 transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/25 hover:shadow-[0_20px_60px_rgba(0,91,255,0.12)] sm:flex-row"
      style={{
        borderRadius: borderRadius['3xl'],
        border: `1px solid ${colors.border}`,
        boxShadow: shadows.card,
      }}
    >
      {/* Cover — tune h-44 (mobile height) + sm:w-36 (desktop width) here */}
      {/* Capa visual do recurso: gerada automaticamente com base na categoria */}
      <div className="relative h-44 w-full shrink-0 overflow-hidden transition-transform duration-500 group-hover:scale-[1.02] sm:h-auto sm:w-36">
        <ResourceCover category={cat} />
      </div>

      {/* Content */}
      {/* Área de conteúdo: badges, título, descrição, metadados e botão de ação */}
      <div className="flex flex-1 flex-col p-5">
        {/* Category + acesso badges */}
        {/* Badge de categoria (cor dinâmica) + badge de acesso (gratuito/pago/em breve) */}
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          {/* Badge da categoria do recurso — cor vem do mapeamento CATEGORY_STYLE */}
          <span
            className="inline-flex self-start rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: catStyle.bg, color: catStyle.text, borderColor: catStyle.border }}
          >
            {cat}
          </span>
          {/* Badge que indica o tipo de acesso ao recurso (grátis, pago, em breve) */}
          <EbookAccessBadge resource={resource} />
        </div>

        {/* Título do recurso/ebook */}
        <h3
          className="mb-1.5 text-sm font-bold leading-snug"
          style={{ fontFamily: 'Space Grotesk, sans-serif', color: colors.text }}
        >
          {resource.title}
        </h3>

        {/* Descrição resumida do recurso */}
        <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
          {resource.description}
        </p>

        {/* Espaçador flexível — empurra metadados e botão para o rodapé */}
        <div className="flex-1" />

        {/* Tags: format, readTime, level — tune classes here */}
        {/* Pílulas de metadados: formato do arquivo, tempo de leitura e nível de dificuldade */}
        {(resource.format || resource.readTime || resource.level) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {/* Formato do arquivo (ex: "PDF", "EPUB") */}
            {resource.format && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt, color: colors.textSecondary }}>
                <FileText size={9} aria-hidden="true" />
                {resource.format}
              </span>
            )}
            {/* Tempo estimado de leitura (ex: "15 min") */}
            {resource.readTime && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt, color: colors.textSecondary }}>
                <Clock size={9} aria-hidden="true" />
                {resource.readTime}
              </span>
            )}
            {/* Nível de dificuldade — cor vem do mapeamento LEVEL_STYLE */}
            {resource.level && levelStyle && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: levelStyle.bg, color: levelStyle.text, borderColor: levelStyle.border }}
              >
                <Signal size={9} aria-hidden="true" />
                {resource.level}
              </span>
            )}
          </div>
        )}

        {/* CTA — gratuito, comprar, ou baixar (se já comprado) */}
        {/* Botão inteligente que muda de estado conforme autenticação e posse do recurso */}
        <EbookDownloadButton
          resource={resource}
          isLoggedIn={isLoggedIn}
          isPurchased={isPurchased}
          creditBalance={creditBalance}
          onFreeDownload={onDownload}
          onBuyClick={onBuyClick}
          onRedeemedWithCredits={onRedeemedWithCredits}
        />
      </div>
    </motion.article>
  )
}
