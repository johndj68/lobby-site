'use client'

import { colors } from '@/lib/design-tokens'

interface StepThreeProps {
  draftId: string
  draft: any
  onSaved: (data: any) => void
  onNext: () => void
  onPrevious: () => void
}

export default function StepThree({
  draftId,
  draft,
  onNext,
  onPrevious,
}: StepThreeProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2" style={{ color: colors.text }}>
          Oferta e planos
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Configure as modalidades de precificação.
        </p>
      </div>

      <div
        className="p-12 rounded-2xl border text-center"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}
      >
        <p style={{ color: colors.textSecondary }} className="mb-4">
          Esta etapa será implementada em breve.
        </p>
        <div className="space-x-4">
          <button
            onClick={onPrevious}
            className="px-6 py-2 rounded-full font-semibold border"
            style={{ borderColor: colors.primary, color: colors.primary }}
          >
            ← Voltar
          </button>
          <button
            onClick={onNext}
            className="px-6 py-2 rounded-full font-semibold text-white"
            style={{ backgroundColor: colors.primary }}
          >
            Próximo →
          </button>
        </div>
      </div>
    </div>
  )
}
