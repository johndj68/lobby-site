'use client'

// cn: utilitário que mescla classes Tailwind, removendo conflitos com clsx + tailwind-merge
import { cn } from '@/lib/utils'

/* ── Tipagem das props aceitas pelo Container ─────────────────────────────── */
interface ContainerProps {
  children: React.ReactNode
  // className opcional: permite sobrescrever ou adicionar classes ao wrapper
  className?: string
}

/*
 * Container — wrapper de largura máxima centralizado horizontalmente
 *
 * Propósito: garantir que o conteúdo de qualquer página nunca ocupe
 * toda a largura do monitor em telas grandes, mantendo margens laterais
 * consistentes e uma largura máxima (max-w-screen-2xl = 1536px).
 *
 * Padding lateral responsivo:
 *   - px-4  (16px) em mobile
 *   - px-6  (24px) em sm (≥640px)
 *   - px-8  (32px) em lg (≥1024px)
 *   - px-10 (40px) em xl (≥1280px)
 *   - px-12 (48px) em 2xl (≥1536px)
 */
export default function Container({ children, className }: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12', className)}>
      {children}
    </div>
  )
}
