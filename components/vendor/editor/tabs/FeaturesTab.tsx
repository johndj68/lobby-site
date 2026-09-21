'use client'

import { colors } from '@/lib/design-tokens'
import { Plus, Trash2 } from 'lucide-react'

interface FeaturesTabProps {
  formData: any
  onFieldChange: (field: string, value: any) => void
}

export default function FeaturesTab({
  formData,
  onFieldChange,
}: FeaturesTabProps) {
  const features = formData?.features || []

  const addFeature = () => {
    onFieldChange('features', [...features, { title: '', description: '' }])
  }

  const updateFeature = (idx: number, field: string, value: string) => {
    const updated = [...features]
    updated[idx] = { ...updated[idx], [field]: value }
    onFieldChange('features', updated)
  }

  const removeFeature = (idx: number) => {
    onFieldChange(
      'features',
      features.filter((_: any, i: number) => i !== idx)
    )
  }

  return (
    <div className="space-y-4">
      {features.map((feature: any, idx: number) => (
        <div
          key={idx}
          className="p-4 border rounded-lg"
          style={{ borderColor: colors.border }}
        >
          <div className="flex justify-between mb-3">
            <h4 style={{ color: colors.text }} className="font-semibold">
              Funcionalidade {idx + 1}
            </h4>
            <button
              onClick={() => removeFeature(idx)}
              className="p-2 hover:opacity-70"
              style={{ color: '#DC2626' }}
            >
              <Trash2 size={16} />
            </button>
          </div>

          <input
            type="text"
            placeholder="Título"
            value={feature.title || ''}
            onChange={(e) => updateFeature(idx, 'title', e.target.value)}
            className="w-full px-3 py-2 border rounded mb-2 text-sm"
            style={{ borderColor: colors.border }}
          />

          <textarea
            placeholder="Descrição"
            value={feature.description || ''}
            onChange={(e) => updateFeature(idx, 'description', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded text-sm"
            style={{ borderColor: colors.border }}
          />
        </div>
      ))}

      <button
        onClick={addFeature}
        className="w-full py-2 border rounded-lg font-semibold flex items-center justify-center gap-2"
        style={{ borderColor: colors.primary, color: colors.primary }}
      >
        <Plus size={16} />
        Adicionar funcionalidade
      </button>

      {features.length < 2 && (
        <p style={{ color: '#DC2626' }} className="text-sm">
          Mínimo de 2 funcionalidades necessárias.
        </p>
      )}
    </div>
  )
}
