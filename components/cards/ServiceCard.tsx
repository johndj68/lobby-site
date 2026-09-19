'use client'

import Link from 'next/link'
import { ArrowRight, Check, Rocket, Code2, Settings2, BarChart3, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { colors, borderRadius, serviceAccents } from '@/lib/design-tokens'

/* Mapa de ícones: chave string (vinda do CMS/dados) → componente Lucide.
   Permite passar o nome do ícone como string e resolver o componente aqui. */
const iconMap: Record<string, React.ElementType> = {
  Code2,
  Settings2,
  BarChart3,
  Shield,
}

// Tipo que define as variações de cor disponíveis para o card
type Accent = keyof typeof serviceAccents

/* Props do ServiceCard:
   - icon: nome string do ícone (chave em iconMap)
   - title / description: conteúdo textual principal do serviço
   - items: lista de entregáveis/funcionalidades exibida com ícones de check
   - cta / ctaHref: texto e destino do link de ação principal
   - result: texto da pílula de resultado esperado (ex: "Aumento de 40% na conversão")
   - accent: variante de cor do card (blue | purple | cyan | mixed)
   - slug: se informado, exibe link secundário "Saiba mais" para /solucoes/<slug>
   - className: classes extras para personalização externa */
interface ServiceCardProps {
  icon: string
  title: string
  description: string
  items?: string[]
  cta?: string
  ctaHref?: string
  result?: string
  accent?: Accent
  slug?: string
  className?: string
}

export default function ServiceCard({
  icon,
  title,
  description,
  items,
  cta,
  ctaHref = '/contato',
  result,
  accent = 'blue',
  slug,
  className,
}: ServiceCardProps) {
  // Resolve o componente de ícone pelo nome; cai em Code2 se não encontrado
  const Icon = iconMap[icon] || Code2
  // Alias curto para o objeto de cores do acento escolhido
  const a = serviceAccents[accent]

  return (
    <article
      className={cn(
        `group relative flex flex-col overflow-hidden border bg-white/90 p-7`,
        `shadow-[0_8px_40px_rgba(11,16,32,0.06)]`,
        `transition-all duration-300`,
        `hover:-translate-y-2`,
        a.hoverBorder,
        a.hoverShadow,
        className
      )}
      style={{
        borderColor: colors.border,
        borderRadius: borderRadius['3xl'],
      }}
    >
      {/* Top gradient accent line — tune width/height here */}
      {/* Linha colorida no topo do card: indica visualmente a variante de acento */}
      <div className={cn('absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r', a.topGrad)} />

      {/* Corner glow — tune size/opacity here */}
      {/* Brilho decorativo no canto superior direito — intensifica no hover */}
      <div
        className="absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl transition-opacity duration-300 opacity-60 group-hover:opacity-100"
        style={{ background: a.glowColor }}
        aria-hidden="true"
      />

      {/* Icon badge — tune size here (w-14 h-14) */}
      {/* Badge com o ícone do serviço — escala levemente no hover */}
      <div
        className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-110 shrink-0"
        style={{
          background: a.iconBg,
          borderColor: `${a.iconColor}22`,
        }}
        aria-hidden="true"
      >
        <Icon size={24} style={{ color: a.iconColor }} />
      </div>

      {/* Title + description */}
      {/* Título e descrição resumida do serviço */}
      <h3
        className="text-lg font-bold mb-2 leading-snug"
        style={{ fontFamily: 'Space Grotesk, sans-serif', color: colors.text }}
      >
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
        {description}
      </p>

      {/* Items list with check icons */}
      {/* Lista de entregáveis/funcionalidades — cada item tem um check colorido pelo acento */}
      {items && items.length > 0 && (
        <ul className="mt-6 space-y-2.5">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm" style={{ color: colors.textSecondary }}>
              {/* Círculo de check com cor do acento */}
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full shrink-0"
                style={{ background: a.checkBg }}
                aria-hidden="true"
              >
                <Check size={11} style={{ color: a.checkColor }} strokeWidth={2.5} />
              </span>
              {item}
            </li>
          ))}
        </ul>
      )}

      {/* Spacer — empurra pílula de resultado e CTAs para o rodapé do card */}
      <div className="flex-1" />

      {/* Result pill */}
      {/* Pílula de resultado esperado — destaca o valor gerado pelo serviço */}
      {result && (
        <div
          className="mt-6 inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-semibold"
          style={{
            background: a.pillBg,
            color: a.pillText,
            borderColor: a.pillBorder,
          }}
        >
          <Rocket size={12} aria-hidden="true" />
          {result}
        </div>
      )}

      {/* CTA links */}
      {/* Área de links de ação: CTA principal (ex: "Falar com especialista") e link secundário "Saiba mais" */}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {/* CTA principal — leva para página de contato ou URL personalizada */}
        {cta && (
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold transition-all"
            style={{ color: a.ctaColor }}
          >
            {cta}
            {/* Seta desliza para direita no hover do card */}
            <ArrowRight
              size={14}
              className="transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        )}
        {/* Link secundário para a página de detalhes da solução — só exibido se slug for informado */}
        {slug && (
          <Link
            href={`/solucoes/${slug}`}
            className="text-xs font-medium text-[#94A3B8] transition-colors hover:text-[#5D6475]"
          >
            Saiba mais →
          </Link>
        )}
      </div>
    </article>
  )
}
