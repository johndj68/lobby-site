'use client'

import { colors } from '@/lib/design-tokens'
import { ChevronRight } from 'lucide-react'

interface Step {
  number: number
  title: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number
  onStepClick?: (step: number) => void
}

export default function StepIndicator({
  steps,
  currentStep,
  onStepClick,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-4">
      {steps.map((step, idx) => {
        const isActive = step.number === currentStep
        const isCompleted = step.number < currentStep
        const isClickable = step.number < currentStep

        return (
          <div key={step.number} className="flex items-center gap-4">
            <button
              onClick={() => isClickable && onStepClick?.(step.number)}
              disabled={!isClickable}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm transition-all ${
                isClickable ? 'cursor-pointer' : ''
              }`}
              style={{
                backgroundColor: isActive ? colors.primary : isCompleted ? `${colors.primary}20` : colors.border,
                color: isActive || isCompleted ? colors.primary : colors.textSecondary,
                opacity: !isClickable && !isActive ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 'bold',
                  backgroundColor: isActive || isCompleted ? 'currentColor' : 'transparent',
                  border: `2px solid ${isActive || isCompleted ? 'currentColor' : colors.textSecondary}`,
                  color: isActive || isCompleted ? 'white' : colors.textSecondary,
                }}
              >
                {isCompleted ? '✓' : step.number}
              </div>
              <span className="hidden sm:inline">{step.title}</span>
            </button>

            {idx < steps.length - 1 && (
              <ChevronRight
                size={20}
                style={{ color: colors.border }}
                className="hidden sm:block"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
