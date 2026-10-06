'use client'

import { Clock, CalendarClock, Zap, CheckCircle2 } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'

export interface IndicadorCounts {
  em_analise: number
  agendadas: number
  ativas: number
  encerradas: number
}

interface Props {
  counts: IndicadorCounts
  activeBucket: keyof IndicadorCounts | null
  onToggle: (bucket: keyof IndicadorCounts) => void
}

const ITEMS: { key: keyof IndicadorCounts; label: string; icon: typeof Clock; color: string }[] = [
  { key: 'em_analise', label: 'Em análise', icon: Clock, color: colors.primary },
  { key: 'agendadas', label: 'Agendadas', icon: CalendarClock, color: '#6D28D9' },
  { key: 'ativas', label: 'Ativas', icon: Zap, color: '#10B981' },
  { key: 'encerradas', label: 'Encerradas', icon: CheckCircle2, color: colors.textSecondary },
]

export default function IndicadoresOfertas({ counts, activeBucket, onToggle }: Props) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ITEMS.map(it => {
        const active = activeBucket === it.key
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onToggle(it.key)}
            className="rounded-xl border p-3 text-left transition-colors"
            style={{
              borderColor: active ? it.color : colors.border,
              background: active ? `${it.color}0D` : colors.card,
              boxShadow: shadows.card,
            }}
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.textSecondary }}>
              <it.icon size={14} style={{ color: it.color }} aria-hidden="true" />{it.label}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: colors.text }}>{counts[it.key]}</p>
          </button>
        )
      })}
    </div>
  )
}
