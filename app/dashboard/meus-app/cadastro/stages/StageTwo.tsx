'use client'

import { useState } from 'react'
import { Upload, X } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import CategoryPicker from '@/components/vendor/CategoryPicker'

interface StageTwoProps {
  draft: any
  onUpdate: (draft: any) => void
  onSave: (updates: any) => Promise<void>
  draftId: string
}

export default function StageTwo({ draft, onUpdate, onSave, draftId }: StageTwoProps) {
  const [formData, setFormData] = useState({
    full_description: draft.full_description || '',
    category_id: draft.category_id || null,
    target_audience: draft.target_audience || '',
    support_email: draft.support_email || '',
    documentation_url: draft.documentation_url || '',
    platforms: draft.platforms || [],
  })

  const [uploading, setUploading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    onUpdate({ ...draft, [name]: value })
  }

  const handleBlur = async () => {
    await onSave(formData)
  }

  const handleCategoryChange = async (categoryId: string | null) => {
    setFormData((prev) => ({ ...prev, category_id: categoryId }))
    onUpdate({ ...draft, category_id: categoryId })
    await onSave({ category_id: categoryId })
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)
      formDataUpload.append('draftId', draftId)
      formDataUpload.append('type', 'logo')

      const res = await fetch('/api/apps/upload', {
        method: 'POST',
        body: formDataUpload,
      })

      if (!res.ok) throw new Error('Upload failed')

      const { url } = await res.json()
      onUpdate({ ...draft, logo_url: url })
      await onSave({ logo_url: url })
    } catch (err) {
      console.error('Upload error:', err)
      alert('Erro ao fazer upload')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: colors.text }}>
          Produto e Mídia
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Descreva seu aplicativo e adicione imagens
        </p>
      </div>

      {/* Full Description */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Descrição completa *
        </label>
        <textarea
          name="full_description"
          value={formData.full_description}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Descreva em detalhes o que seu app faz, principais recursos e benefícios"
          rows={5}
          className="w-full px-4 py-3 rounded-lg border resize-none"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Categoria *
        </label>
        <CategoryPicker value={formData.category_id} onChange={handleCategoryChange} />
      </div>

      {/* Target Audience */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Público-alvo
        </label>
        <input
          type="text"
          name="target_audience"
          value={formData.target_audience}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Ex: Empresas, Startups, Desenvolvedores"
          className="w-full px-4 py-3 rounded-lg border"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Logo Upload */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Logo do aplicativo
        </label>
        <div className="flex items-center gap-4">
          {draft.logo_url && (
            <div className="w-20 h-20 rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
              <img src={draft.logo_url} alt="logo" className="w-full h-full object-cover" />
            </div>
          )}
          <label className="px-4 py-2 rounded-lg border cursor-pointer font-medium flex items-center gap-2" style={{ borderColor: colors.border, color: colors.primary }}>
            <Upload size={16} />
            {uploading ? 'Enviando...' : 'Fazer upload'}
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Support Email */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Email de suporte *
        </label>
        <input
          type="email"
          name="support_email"
          value={formData.support_email}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="suporte@seuapp.com"
          className="w-full px-4 py-3 rounded-lg border"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </div>

      {/* Documentation URL */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Link da documentação
        </label>
        <input
          type="url"
          name="documentation_url"
          value={formData.documentation_url}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="https://docs.seuapp.com"
          className="w-full px-4 py-3 rounded-lg border"
          style={{ borderColor: colors.border, color: colors.text }}
        />
      </div>
    </div>
  )
}
