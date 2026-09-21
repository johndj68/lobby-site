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
    <div className="space-y-6">
      <p style={{ color: colors.textMuted }} className="text-sm">
        Conte a história e o contexto do seu aplicativo. Esta seção é opcional.
      </p>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Título da apresentação
        </label>
        <input
          type="text"
          value={formData?.history_title || ''}
          onChange={(e) => onFieldChange('history_title', e.target.value)}
          placeholder="Ex: Conheça nossa história"
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        />
        <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
          Título para a seção de história do seu app.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          História e objetivo
        </label>
        <textarea
          value={formData?.history_story || ''}
          onChange={(e) => onFieldChange('history_story', e.target.value)}
          placeholder="Conte a história do seu aplicativo, como nasceu, e qual seu objetivo..."
          rows={6}
          maxLength={2000}
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        />
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs" style={{ color: colors.textMuted }}>
            Contexto e background do aplicativo.
          </p>
          <span style={{ color: colors.textMuted }} className="text-xs">
            {formData?.history_story?.length || 0}/2000
          </span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Problema que motivou a criação
        </label>
        <textarea
          value={formData?.history_problem || ''}
          onChange={(e) => onFieldChange('history_problem', e.target.value)}
          placeholder="Qual problema seu app resolve? Qual era a necessidade que motivou sua criação?"
          rows={4}
          maxLength={1000}
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        />
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs" style={{ color: colors.textMuted }}>
            O problema que seu aplicativo resolve.
          </p>
          <span style={{ color: colors.textMuted }} className="text-xs">
            {formData?.history_problem?.length || 0}/1000
          </span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: colors.text }}>
          Sobre os criadores
        </label>
        <textarea
          value={formData?.history_creators || ''}
          onChange={(e) => onFieldChange('history_creators', e.target.value)}
          placeholder="Apresentação da equipe ou empresa que criou o app..."
          rows={3}
          maxLength={1000}
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: colors.border }}
        />
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs" style={{ color: colors.textMuted }}>
            Opcional. Apresentação pública da equipe ou empresa.
          </p>
          <span style={{ color: colors.textMuted }} className="text-xs">
            {formData?.history_creators?.length || 0}/1000
          </span>
        </div>
      </div>
    </div>
  )
}
