'use client'

import { colors } from '@/lib/design-tokens'
import { Plus, Trash2 } from 'lucide-react'

interface FAQTabProps {
  formData: any
  onFieldChange: (field: string, value: any) => void
}

export default function FAQTab({
  formData,
  onFieldChange,
}: FAQTabProps) {
  const faqs = formData?.faqs || []

  const addFAQ = () => {
    onFieldChange('faqs', [...faqs, { question: '', answer: '' }])
  }

  const updateFAQ = (idx: number, field: string, value: string) => {
    const updated = [...faqs]
    updated[idx] = { ...updated[idx], [field]: value }
    onFieldChange('faqs', updated)
  }

  const removeFAQ = (idx: number) => {
    onFieldChange(
      'faqs',
      faqs.filter((_: any, i: number) => i !== idx)
    )
  }

  return (
    <div className="space-y-4">
      {faqs.map((faq: any, idx: number) => (
        <div key={idx} className="p-4 border rounded-lg" style={{ borderColor: colors.border }}>
          <div className="flex justify-between mb-3">
            <span style={{ color: colors.text }} className="font-semibold text-sm">
              Pergunta {idx + 1}
            </span>
            <button onClick={() => removeFAQ(idx)} style={{ color: '#DC2626' }}>
              <Trash2 size={16} />
            </button>
          </div>

          <input
            type="text"
            placeholder="Pergunta"
            value={faq.question || ''}
            onChange={(e) => updateFAQ(idx, 'question', e.target.value)}
            className="w-full px-3 py-2 border rounded mb-2 text-sm"
            style={{ borderColor: colors.border }}
          />

          <textarea
            placeholder="Resposta"
            value={faq.answer || ''}
            onChange={(e) => updateFAQ(idx, 'answer', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded text-sm"
            style={{ borderColor: colors.border }}
          />
        </div>
      ))}

      <button
        onClick={addFAQ}
        className="w-full py-2 border rounded-lg font-semibold flex items-center justify-center gap-2 text-sm"
        style={{ borderColor: colors.primary, color: colors.primary }}
      >
        <Plus size={16} />
        Adicionar pergunta
      </button>
    </div>
  )
}
