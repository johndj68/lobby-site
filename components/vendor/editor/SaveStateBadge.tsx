'use client'

import { Loader2, CheckCircle2, AlertTriangle, WifiOff } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline'

/** "Salvo" só aparece depois da confirmação do backend — nunca otimista. */
export default function SaveStateBadge({ state }: { state: SaveState }) {
  switch (state) {
    case 'saving':
      return <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: colors.textSecondary }}>
        <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Salvando…
      </span>
    case 'saved':
      return <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: '#16A34A' }}>
        <CheckCircle2 size={13} aria-hidden="true" /> Salvo
      </span>
    case 'error':
      return <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: '#DC2626' }}>
        <AlertTriangle size={13} aria-hidden="true" /> Erro ao salvar
      </span>
    case 'offline':
      return <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: '#DC2626' }}>
        <WifiOff size={13} aria-hidden="true" /> Sem conexão
      </span>
    case 'dirty':
      return <span className="text-xs font-medium" style={{ color: '#D97706' }}>Alterações não salvas</span>
    default:
      return null
  }
}
