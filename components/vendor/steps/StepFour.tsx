'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { CheckCircle, Loader, AlertCircle } from 'lucide-react'

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
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const pendingFields = []
  if (!draft?.name) pendingFields.push('Nome do aplicativo')
  if (!draft?.category) pendingFields.push('Categoria')
  if (!draft?.short_description) pendingFields.push('Descrição curta')
  if (!draft?.plans || draft.plans.length === 0) pendingFields.push('Planos de precificação')

  const handleSubmit = async () => {
    if (!agreedTerms) {
      setError('Você deve aceitar os termos para continuar.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // Create submission
      const { data: submission, error: submitError } = await supabase
        .from('app_submissions')
        .insert({
          app_draft_id: draftId,
          submitted_by: (await supabase.auth.getUser()).data.user?.id,
          data: draft,
          status: 'pending',
        })
        .select()
        .single()

      if (submitError) throw submitError

      // Update draft status
      await supabase
        .from('app_drafts')
        .update({
          status: 'submitted',
          stage: 4,
        })
        .eq('id', draftId)

      setSubmitted(true)
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="space-y-8">
        <div className="text-center space-y-4">
          <CheckCircle size={48} style={{ color: '#10B981' }} className="mx-auto" />
          <h2 className="text-3xl font-bold" style={{ color: colors.text }}>
            Enviado com sucesso!
          </h2>
          <p style={{ color: colors.textSecondary }}>
            Sua submissão foi recebida. Nossa equipe analisará seu aplicativo em breve.
          </p>
          <p style={{ color: colors.textMuted }} className="text-sm">
            Você pode acompanhar o status no painel de aplicativos.
          </p>
        </div>

        <a
          href="/vendedor/aplicativos"
          className="block text-center px-6 py-3 rounded-full font-semibold text-white"
          style={{ backgroundColor: colors.primary }}
        >
          Ir para painel
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2" style={{ color: colors.text }}>
          Revisão e envio
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Verifique seus dados antes de enviar para análise.
        </p>
      </div>

      {/* Preview */}
      <div
        className="p-8 rounded-2xl border space-y-6"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}
      >
        <div>
          <h3 className="font-bold mb-4" style={{ color: colors.text }}>
            Prévia do seu aplicativo
          </h3>

          <div className="space-y-3">
            <div className="flex justify-between">
              <span style={{ color: colors.textSecondary }}>Nome:</span>
              <span className="font-semibold" style={{ color: colors.text }}>
                {draft?.name || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: colors.textSecondary }}>Categoria:</span>
              <span className="font-semibold" style={{ color: colors.text }}>
                {draft?.category || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: colors.textSecondary }}>URL:</span>
              <span className="font-semibold text-sm truncate" style={{ color: colors.text }}>
                {draft?.website_url || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: colors.textSecondary }}>Planos:</span>
              <span className="font-semibold" style={{ color: colors.text }}>
                {draft?.plans?.length || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Pending fields */}
        {pendingFields.length > 0 && (
          <div
            className="p-4 rounded-lg flex gap-3"
            style={{ backgroundColor: '#FEF3C7', borderLeft: '4px solid #FBBF24' }}
          >
            <AlertCircle size={18} style={{ color: '#B45309' }} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm" style={{ color: '#B45309' }}>
                Campos pendentes
              </p>
              <ul className="text-sm mt-1" style={{ color: '#92400E' }}>
                {pendingFields.map((field) => (
                  <li key={field}>• {field}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Terms */}
      <div
        className="p-6 rounded-2xl border space-y-4"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}
      >
        <h3 className="font-bold" style={{ color: colors.text }}>
          Confirmação antes do envio
        </h3>

        <label className="flex gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-1"
          />
          <span style={{ color: colors.text }}>
            Confirmo que tenho autorização para comercializar este produto e que as informações
            e imagens são fiéis ao produto.
          </span>
        </label>
      </div>

      {error && (
        <div
          className="p-4 rounded-lg flex gap-3"
          style={{ backgroundColor: '#FEE2E2', borderLeft: '4px solid #F87171' }}
        >
          <AlertCircle size={18} style={{ color: '#DC2626' }} className="flex-shrink-0" />
          <p style={{ color: '#991B1B' }}>{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onPrevious}
          disabled={submitting}
          className="px-6 py-3 rounded-full font-semibold border disabled:opacity-50"
          style={{ borderColor: colors.primary, color: colors.primary }}
        >
          ← Voltar
        </button>

        <button
          onClick={handleSubmit}
          disabled={submitting || !agreedTerms || pendingFields.length > 0}
          className="px-6 py-3 rounded-full font-semibold text-white flex items-center gap-2 disabled:opacity-50 ml-auto"
          style={{ backgroundColor: colors.primary }}
        >
          {submitting && <Loader size={18} className="animate-spin" />}
          Enviar para análise
        </button>
      </div>
    </div>
  )
}
