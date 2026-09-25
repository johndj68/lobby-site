'use client'

import { colors } from '@/lib/design-tokens'

interface Props {
  label: string
  help?: string
  required?: boolean
  htmlFor?: string
  counter?: { current: number; max: number }
  error?: string
  children: React.ReactNode
}

/** Rótulo + texto de ajuda + contador de caracteres + erro, no mesmo
 *  padrão em todos os campos do editor — evita repetir a mesma estrutura
 *  de label/help/counter em cada input. */
export default function Field({ label, help, required, htmlFor, counter, error, children }: Props) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-sm font-semibold" style={{ color: colors.text }}>
          {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
        </label>
        {counter && (
          <span className="text-[11px]" style={{ color: counter.current > counter.max ? '#DC2626' : colors.textMuted }}>
            {counter.current}/{counter.max}
          </span>
        )}
      </div>
      {help && <p className="mb-2 text-xs" style={{ color: colors.textSecondary }}>{help}</p>}
      {children}
      {error && <p className="mt-1 text-xs font-medium" style={{ color: '#DC2626' }}>{error}</p>}
    </div>
  )
}
