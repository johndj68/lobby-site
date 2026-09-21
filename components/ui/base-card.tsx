import React from 'react'
import { cn } from '@/lib/utils'
import { colors, shadows, borderRadius, gradients } from '@/lib/design-tokens'

interface BaseCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'pillar' | 'benefit' | 'stat' | 'service'
  icon?: React.ReactNode
  label?: string
  description?: string
  title?: string
  subtitle?: string
  metric?: string
  hover?: boolean
}

/**
 * BaseCard: componente base consolidado para 45+ cards repetidos
 * Reduz duplicação de código e garante consistência visual
 */
export const BaseCard = React.forwardRef<HTMLDivElement, BaseCardProps>(
  ({
    variant = 'default',
    icon,
    label,
    description,
    title,
    subtitle,
    metric,
    hover = true,
    className,
    children,
    ...props
  }, ref) => {
    const baseClasses = cn(
      'overflow-hidden rounded-3xl border',
      'bg-white/90 transition-colors',
      hover && 'hover:bg-[#F7F8FC] cursor-default group'
    )

    const borderColor = `border-[${colors.border}]`
    const shadowClass = `shadow-[${shadows.card}]`

    const variantStyles = {
      default: 'flex flex-col items-start gap-3',
      pillar: 'flex items-center gap-4 px-6 py-5',
      benefit: 'flex flex-col items-center gap-2 px-6 py-7 text-center',
      stat: 'flex flex-col items-start gap-2 px-6 py-5',
      service: 'flex flex-col items-start gap-4 p-6',
    }

    return (
      <div
        ref={ref}
        className={cn(baseClasses, borderColor, shadowClass, variantStyles[variant], className)}
        {...props}
      >
        {icon && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
            style={{ background: gradients.blue }}
            aria-hidden="true"
          >
            {typeof icon === 'string' ? (
              <span style={{ color: colors.primary }}>{icon}</span>
            ) : (
              React.cloneElement(icon as React.ReactElement, {
                size: 20 as any,
                style: { color: colors.primary },
              } as any)
            )}
          </div>
        )}

        {variant === 'pillar' && (
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {label}
            </p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              {description}
            </p>
          </div>
        )}

        {variant === 'benefit' && (
          <>
            <p className="text-sm font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {title}
            </p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              {description}
            </p>
          </>
        )}

        {variant === 'stat' && (
          <>
            {metric && (
              <p
                className="text-2xl font-bold"
                style={{ color: colors.primary, fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {metric}
              </p>
            )}
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              {label}
            </p>
          </>
        )}

        {children}
      </div>
    )
  }
)

BaseCard.displayName = 'BaseCard'

export default BaseCard
