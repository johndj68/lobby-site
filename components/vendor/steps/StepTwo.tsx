'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { Upload, AlertCircle, Loader } from 'lucide-react'

interface StepTwoProps {
  draftId: string
  draft: any
  onSaved: (data: any) => void
  onNext: () => void
  onPrevious: () => void
}

export default function StepTwo({
  draftId,
  draft,
  onSaved,
  onNext,
  onPrevious,
}: StepTwoProps) {
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: draft?.name || '',
    website_url: draft?.website_url || '',
    short_description: draft?.short_description || '',
    full_description: draft?.full_description || '',
    category: draft?.category || '',
    target_audience: draft?.target_audience || '',
    languages: draft?.languages?.join(',') || '',
  })
  const supabase = createClient()

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('app_drafts')
        .update({
          ...formData,
          languages: formData.languages.split(',').filter(l => l.trim()),
          stage: 2,
          last_edited_at: new Date().toISOString(),
        })
        .eq('id', draftId)
        .select()
        .single()

      if (error) throw error
      onSaved(data)
    } catch (error) {
      alert((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2" style={{ color: colors.text }}>
          Produto e mídia
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Forneça informações detalhadas sobre seu aplicativo.
        </p>
      </div>

      {/* Form */}
      <div
        className="p-8 rounded-2xl border space-y-6"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}
      >
        {/* Basic info */}
        <div className="space-y-4">
          <h3 className="font-bold" style={{ color: colors.text }}>
            Informações principais
          </h3>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
              Nome do aplicativo *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg text-sm"
              style={{ borderColor: colors.border }}
              maxLength={100}
            />
            <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
              {formData.name.length}/100 caracteres
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
              URL oficial *
            </label>
            <input
              type="url"
              value={formData.website_url}
              onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
              placeholder="https://..."
              className="w-full px-4 py-2 border rounded-lg text-sm"
              style={{ borderColor: colors.border }}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
              Descrição curta *
            </label>
            <textarea
              value={formData.short_description}
              onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg text-sm h-20"
              style={{ borderColor: colors.border }}
              maxLength={200}
            />
            <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
              {formData.short_description.length}/200 caracteres
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
              Descrição completa
            </label>
            <textarea
              value={formData.full_description}
              onChange={(e) => setFormData({ ...formData, full_description: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg text-sm h-32"
              style={{ borderColor: colors.border }}
              maxLength={2000}
            />
            <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
              {formData.full_description.length}/2000 caracteres
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
                Categoria *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg text-sm"
                style={{ borderColor: colors.border }}
              >
                <option value="">Selecionar</option>
                <option value="Inteligência artificial">IA</option>
                <option value="Automação">Automação</option>
                <option value="Marketing">Marketing</option>
                <option value="Gestão e finanças">Gestão</option>
                <option value="Dados e BI">Dados</option>
                <option value="Segurança">Segurança</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
                Público-alvo
              </label>
              <input
                type="text"
                value={formData.target_audience}
                onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                placeholder="Ex: PMEs, Desenvolvedores"
                className="w-full px-4 py-2 border rounded-lg text-sm"
                style={{ borderColor: colors.border }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
              Idiomas (separar por vírgula)
            </label>
            <input
              type="text"
              value={formData.languages}
              onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
              placeholder="pt, en, es"
              className="w-full px-4 py-2 border rounded-lg text-sm"
              style={{ borderColor: colors.border }}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onPrevious}
          className="px-6 py-3 rounded-full font-semibold border"
          style={{ borderColor: colors.primary, color: colors.primary }}
        >
          ← Voltar
        </button>

        <button
          onClick={handleSave}
          disabled={saving || !formData.name || !formData.category}
          className="px-6 py-3 rounded-full font-semibold text-white flex items-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: colors.primary }}
        >
          {saving && <Loader size={18} className="animate-spin" />}
          Salvar
        </button>

        <button
          onClick={onNext}
          disabled={!formData.name || !formData.category}
          className="px-6 py-3 rounded-full font-semibold text-white flex items-center gap-2 disabled:opacity-50 ml-auto"
          style={{ backgroundColor: colors.primary }}
        >
          Próximo →
        </button>
      </div>
    </div>
  )
}
