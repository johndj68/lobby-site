'use client'

import { colors } from '@/lib/design-tokens'

interface StepFourProps {
  draftId: string
  draft: any
  onPrevious: () => void
}

export default function StepFour({
  draftId,
  draft,
  onPrevious,
}: StepFourProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2" style={{ color: colors.text }}>
          Revisão
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Prévia de como seu aplicativo será exibido.
        </p>
      </div>

      <div
        className="p-12 rounded-2xl border text-center"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}
      >
        <p style={{ color: colors.textSecondary }} className="mb-4">
          Esta etapa será implementada em breve.
        </p>
        <button
          onClick={onPrevious}
          className="px-6 py-2 rounded-full font-semibold border"
          style={{ borderColor: colors.primary, color: colors.primary }}
        >
          ← Voltar
        </button>
      </div>
    </div>
  )
}
