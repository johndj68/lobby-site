'use client'

import { cn } from '@/lib/utils'

interface SectionTitleProps {
  eyebrow?: string
  title: string
  subtitle?: string
  centered?: boolean
  className?: string
  light?: boolean
  accentLine?: boolean
}

export default function SectionTitle({
  eyebrow,
  title,
  subtitle,
  centered = true,
  className,
  light = false,
  accentLine = false,
}: SectionTitleProps) {
  return (
    <div className={cn(centered && 'text-center', 'mb-12', className)}>
      {eyebrow && (
        <span
          className={cn(
            'mb-4 inline-flex rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em]',
            light
              ? 'border-white/20 bg-white/15 text-white'
              : 'border-[#0B1020]/15 bg-[#0B1020]/[0.08] text-[#0B1020]'
          )}
        >
          {eyebrow}
        </span>
      )}

      <h2
        className={cn(
          'text-3xl md:text-4xl font-bold leading-tight mb-4',
          eyebrow && 'mt-1',
          light ? 'text-white' : 'text-[#0B1020]'
        )}
        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
      >
        {title}
      </h2>

      {subtitle && (
        <p
          className={cn(
            'text-base md:text-lg leading-relaxed',
            light ? 'text-white/70' : 'text-[#5D6475]',
            centered && 'max-w-2xl mx-auto'
          )}
        >
          {subtitle}
        </p>
      )}

      {accentLine && (
        <div
          className={cn(
            'mt-5 h-1 w-20 rounded-full bg-gradient-to-r from-[#0B1020] to-[#168F9C]',
            centered && 'mx-auto'
          )}
        />
      )}
    </div>
  )
}
