'use client'

import { colors } from '@/lib/design-tokens'
import { Plus, Trash2 } from 'lucide-react'

interface TrustSignalsTabProps {
  formData: any
  onFieldChange: (field: string, value: any) => void
}

export default function TrustSignalsTab({
  formData,
  onFieldChange,
}: TrustSignalsTabProps) {
  const signals = formData?.trust_signals || []

  const addSignal = () => {
    onFieldChange('trust_signals', [...signals, { type: '', title: '', url: '' }])
  }

  const updateSignal = (idx: number, field: string, value: string) => {
    const updated = [...signals]
    updated[idx] = { ...updated[idx], [field]: value }
    onFieldChange('trust_signals', updated)
  }

  const removeSignal = (idx: number) => {
    onFieldChange(
      'trust_signals',
      signals.filter((_: any, i: number) => i !== idx)
    )
  }

  return (
    <div className="space-y-4">
      {signals.map((signal: any, idx: number) => (
        <div key={idx} className="p-4 border rounded-lg" style={{ borderColor: colors.border }}>
          <div className="flex justify-between mb-3">
            <span style={{ color: colors.text }} className="font-semibold text-sm">
              Sinal {idx + 1}
            </span>
            <button onClick={() => removeSignal(idx)} style={{ color: '#DC2626' }}>
              <Trash2 size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <select
              value={signal.type || ''}
              onChange={(e) => updateSignal(idx, 'type', e.target.value)}
              className="px-3 py-2 border rounded text-sm"
              style={{ borderColor: colors.border }}
            >
              <option>Tipo</option>
              <option value="docs">Documentação</option>
              <option value="support">Suporte</option>
              <option value="privacy">Privacidade</option>
            </select>

            <input
              type="text"
              placeholder="Título"
              value={signal.title || ''}
              onChange={(e) => updateSignal(idx, 'title', e.target.value)}
              className="px-3 py-2 border rounded text-sm"
              style={{ borderColor: colors.border }}
            />
          </div>

          <input
            type="url"
            placeholder="URL"
            value={signal.url || ''}
            onChange={(e) => updateSignal(idx, 'url', e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
            style={{ borderColor: colors.border }}
          />
        </div>
      ))}

      <button
        onClick={addSignal}
        className="w-full py-2 border rounded-lg font-semibold flex items-center justify-center gap-2 text-sm"
        style={{ borderColor: colors.primary, color: colors.primary }}
      >
        <Plus size={16} />
        Adicionar sinal de confiança
      </button>
    </div>
  )
}
