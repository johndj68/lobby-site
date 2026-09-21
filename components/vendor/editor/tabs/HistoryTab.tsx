'use client'

import { colors } from '@/lib/design-tokens'

interface HistoryTabProps {
  formData: any
  onFieldChange: (field: string, value: any) => void
}

export default function HistoryTab({
  formData,
  onFieldChange,
}: HistoryTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Título da apresentação
        </label>
        <input
          type="text"
          placeholder="Ex: Conheça nossa história"
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          História e objetivo
        </label>
        <textarea
          placeholder="Conte a história do seu aplicativo..."
          rows={6}
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Problema que motivou a criação
        </label>
        <textarea
          placeholder="Qual problema seu app resolve?"
          rows={4}
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        />
      </div>
    </div>
  )
}
