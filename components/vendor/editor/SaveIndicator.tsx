'use client'

import { colors } from '@/lib/design-tokens'
import { Check, Clock, AlertCircle } from 'lucide-react'

interface SaveIndicatorProps {
  state: 'idle' | 'saving' | 'saved' | 'error'
  error?: string
}

export default function SaveIndicator({ state, error }: SaveIndicatorProps) {
  if (state === 'idle') return null

  const getMessage = () => {
    switch (state) {
      case 'saving':
        return 'Salvando…'
      case 'saved':
        return 'Salvo'
      case 'error':
        return 'Erro ao salvar'
      default:
        return ''
    }
  }

  const getIcon = () => {
    switch (state) {
      case 'saving':
        return <Clock size={16} className="animate-spin" />
      case 'saved':
        return <Check size={16} />
      case 'error':
        return <AlertCircle size={16} />
      default:
        return null
    }
  }

  const getColor = () => {
    switch (state) {
      case 'saving':
        return colors.primary
      case 'saved':
        return '#16A34A'
      case 'error':
        return '#DC2626'
      default:
        return colors.textSecondary
    }
  }

  return (
    <div className="flex items-center gap-2" style={{ color: getColor() }}>
      {getIcon()}
      <span className="text-sm">{getMessage()}</span>
    </div>
  )
}
