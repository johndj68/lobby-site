'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Save, Send } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import type { AppDraft, Plan } from '@/types/app'
import StageIndicator from './StageIndicator'
import StageOne from './stages/StageOne'
import StageTwo from './stages/StageTwo'
import StageThree from './stages/StageThree'
import StageFour from './stages/StageFour'

interface AppEditorProps {
  initialDraft: AppDraft
  initialPlans: Plan[]
}

export default function AppEditor({ initialDraft, initialPlans }: AppEditorProps) {
  const params = useParams()
  const router = useRouter()
  const draftId = params.id as string

  const [draft, setDraft] = useState<AppDraft>(initialDraft)
  const [plans, setPlans] = useState<Plan[]>(initialPlans)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const saveDraft = useCallback(async (updates: Partial<AppDraft>) => {
    setSaving(true)
    setSaveStatus('saving')

    try {
      const res = await fetch(`/api/apps/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!res.ok) throw new Error('Failed to save')

      const updated = await res.json()
      setDraft(updated)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      console.error('Save error:', err)
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }, [draftId])

  const advanceStage = async () => {
    if (draft.stage < 4) {
      await saveDraft({ stage: draft.stage + 1 })
    }
  }

  const regressStage = async () => {
    if (draft.stage > 1) {
      await saveDraft({ stage: draft.stage - 1 })
    }
  }

  const submitForReview = async () => {
    if (!confirm('Tem certeza que deseja enviar para análise? Você não poderá fazer alterações até a revisão estar completa.')) {
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/apps/drafts/${draftId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) throw new Error('Failed to submit')

      router.push('/dashboard/meus-apps')
      router.refresh()
    } catch (err) {
      console.error('Submit error:', err)
      alert('Erro ao enviar para análise')
    } finally {
      setSaving(false)
    }
  }

  const renderStage = () => {
    switch (draft.stage) {
      case 1:
        return <StageOne draft={draft} onUpdate={setDraft} onSave={saveDraft} />
      case 2:
        return <StageTwo draft={draft} onUpdate={setDraft} onSave={saveDraft} draftId={draftId} />
      case 3:
        return <StageThree plans={plans} onPlansUpdate={setPlans} draftId={draftId} onSave={saveDraft} />
      case 4:
        return <StageFour draft={draft} plans={plans} />
      default:
        return null
    }
  }

  return (
    <div className="space-y-8">
      <StageIndicator currentStage={draft.stage} />

      {/* Stage Content */}
      <div className="bg-white rounded-2xl p-8 border" style={{ borderColor: colors.border }}>
        {renderStage()}
      </div>

      {/* Navigation & Actions */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={regressStage}
          disabled={draft.stage === 1}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border disabled:opacity-50"
          style={{ borderColor: colors.border, color: colors.text }}
        >
          <ChevronLeft size={18} />
          Anterior
        </button>

        <div className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>
          {saving && <span>Salvando...</span>}
          {saveStatus === 'saved' && <span style={{ color: colors.primary }}>✓ Salvo</span>}
          {saveStatus === 'error' && <span style={{ color: '#EF4444' }}>Erro ao salvar</span>}
        </div>

        <div className="flex items-center gap-2">
          {draft.stage < 4 && (
            <button
              onClick={advanceStage}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold"
              style={{ backgroundColor: colors.primary }}
            >
              Próximo
              <ChevronRight size={18} />
            </button>
          )}
          {draft.stage === 4 && (
            <button
              onClick={submitForReview}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg text-white font-semibold"
              style={{ backgroundColor: '#10B981' }}
            >
              <Send size={18} />
              Enviar para análise
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
