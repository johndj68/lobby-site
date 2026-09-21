import { colors } from '@/lib/design-tokens'

interface StageIndicatorProps {
  currentStage: number
}

const stages = [
  { number: 1, label: 'Começar' },
  { number: 2, label: 'Produto e mídia' },
  { number: 3, label: 'Oferta e planos' },
  { number: 4, label: 'Revisão' },
]

export default function StageIndicator({ currentStage }: StageIndicatorProps) {
  return (
    <div className="flex items-center justify-between gap-2 md:gap-4">
      {stages.map((stage, idx) => (
        <div key={stage.number} className="flex items-center flex-1">
          {/* Circle */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-sm"
            style={{
              backgroundColor: stage.number <= currentStage ? colors.primary : '#E5E7EB',
              color: stage.number <= currentStage ? 'white' : colors.textSecondary,
            }}
          >
            {stage.number}
          </div>

          {/* Line */}
          {idx < stages.length - 1 && (
            <div
              className="hidden md:block h-1 flex-1 mx-2"
              style={{
                backgroundColor: stage.number < currentStage ? colors.primary : '#E5E7EB',
              }}
            />
          )}

          {/* Label */}
          <span
            className="hidden md:inline text-sm font-medium"
            style={{
              color: stage.number <= currentStage ? colors.text : colors.textSecondary,
            }}
          >
            {stage.label}
          </span>
        </div>
      ))}
    </div>
  )
}
