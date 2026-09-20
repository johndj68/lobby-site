'use client'

import { useState } from 'react'
import { User } from '@supabase/supabase-js'
import Container from '@/components/layout/Container'
import { colors } from '@/lib/design-tokens'
import StepIndicator from './StepIndicator'
import StepOne from './steps/StepOne'
import StepTwo from './steps/StepTwo'
import StepThree from './steps/StepThree'
import StepFour from './steps/StepFour'

interface AppDraft {
  id: string
  name?: string
  website_url?: string
  short_description?: string
  full_description?: string
  stage: number
  status: string
  [key: string]: any
}

interface NewAppFlowProps {
  user: User
  hasOrganization: boolean
}

const steps = [
  { number: 1, title: 'Começar' },
  { number: 2, title: 'Produto e mídia' },
  { number: 3, title: 'Oferta e planos' },
  { number: 4, title: 'Revisão' },
]

export default function NewAppFlow({
  user,
  hasOrganization,
}: NewAppFlowProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<AppDraft> | null>(null)

  const goToStep = (step: number) => {
    if (step >= 1 && step <= 4) {
      setCurrentStep(step)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepOne
            user={user}
            hasOrganization={hasOrganization}
            onDraftCreated={(id, data) => {
              setDraftId(id)
              setDraft(data)
              setCurrentStep(2)
            }}
          />
        )
      case 2:
        return (
          <StepTwo
            draftId={draftId!}
            draft={draft}
            onSaved={(updated) => {
              setDraft(updated)
            }}
            onNext={() => setCurrentStep(3)}
            onPrevious={() => setCurrentStep(1)}
          />
        )
      case 3:
        return (
          <StepThree
            draftId={draftId!}
            draft={draft}
            onSaved={(updated) => {
              setDraft(updated)
            }}
            onNext={() => setCurrentStep(4)}
            onPrevious={() => setCurrentStep(2)}
          />
        )
      case 4:
        return (
          <StepFour
            draftId={draftId!}
            draft={draft}
            onPrevious={() => setCurrentStep(3)}
          />
        )
      default:
        return null
    }
  }

  return (
    <div style={{ backgroundColor: colors.backgroundAlt, minHeight: '100vh' }}>
      {/* Header */}
      <div
        style={{ backgroundColor: colors.background, borderBottom: `1px solid ${colors.border}` }}
        className="sticky top-16 z-40"
      >
        <Container className="py-4">
          <p style={{ color: colors.textSecondary }} className="text-sm font-medium">
            Painel do parceiro / Novo aplicativo
          </p>
        </Container>
      </div>

      {/* Step Indicator */}
      <Container className="py-8">
        <StepIndicator steps={steps} currentStep={currentStep} onStepClick={goToStep} />
      </Container>

      {/* Content */}
      <Container className="pb-16">
        {renderStep()}
      </Container>
    </div>
  )
}
