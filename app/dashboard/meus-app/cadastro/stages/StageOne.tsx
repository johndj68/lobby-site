'use client'

import { useState } from 'react'
import { colors } from '@/lib/design-tokens'

interface StageOneProps {
  draft: any
  onUpdate: (draft: any) => void
  onSave: (updates: any) => Promise<void>
}

export default function StageOne({ draft, onUpdate, onSave }: StageOneProps) {
  const [formData, setFormData] = useState({
    name: draft.name || '',
    website_url: draft.website_url || '',
    short_description: draft.short_description || '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    onUpdate({ ...draft, [name]: value })
  }

  const handleBlur = async () => {
    await onSave(formData)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: colors.text }}>
          Começar
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Informações básicas do seu aplicativo
        </p>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Nome do aplicativo *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Ex: Assistente IA Inteligente"
          className="w-full px-4 py-3 rounded-lg border"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Website URL */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          URL do website
        </label>
        <input
          type="url"
          name="website_url"
          value={formData.website_url}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="https://seuapp.com"
          className="w-full px-4 py-3 rounded-lg border"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Short Description */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Descrição curta (100 caracteres) *
        </label>
        <textarea
          name="short_description"
          value={formData.short_description}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Descreva brevemente o que seu app faz"
          maxLength={100}
          rows={2}
          className="w-full px-4 py-3 rounded-lg border resize-none"
          style={{ borderColor: colors.border, color: colors.text }}
        />
        <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
          {formData.short_description.length}/100
        </p>
      </div>

      {/* Info Box */}
      <div className="p-4 rounded-lg" style={{ backgroundColor: '#F0F9FF', borderColor: colors.primary, border: '1px solid' }}>
        <p className="text-sm" style={{ color: colors.text }}>
          <strong>💡 Dica:</strong> Preencha os campos básicos e avance para as próximas etapas onde você adicionará mídia, funcionalidades e preços.
        </p>
      </div>
    </div>
  )
}
