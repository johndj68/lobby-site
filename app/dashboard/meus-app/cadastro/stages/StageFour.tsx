'use client'

import { colors } from '@/lib/design-tokens'

interface StageFourProps {
  draft: any
  plans: any[]
}

export default function StageFour({ draft, plans }: StageFourProps) {
  const warnings = []
  if (!draft.name) warnings.push('Nome do aplicativo')
  if (!draft.short_description) warnings.push('Descrição curta')
  if (!draft.full_description) warnings.push('Descrição completa')
  if (!draft.category) warnings.push('Categoria')
  if (!draft.support_email) warnings.push('Email de suporte')
  if (plans.length === 0) warnings.push('Pelo menos um plano')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: colors.text }}>
          Revisão
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Verifique os dados antes de enviar para análise
        </p>
      </div>

      {/* Warning Box */}
      {warnings.length > 0 && (
        <div className="p-4 rounded-lg" style={{ backgroundColor: '#FEF3C7', borderColor: '#F59E0B', border: '1px solid' }}>
          <p className="font-semibold mb-2" style={{ color: '#92400E' }}>
            ⚠️ Campos incompletos:
          </p>
          <ul className="text-sm space-y-1" style={{ color: '#92400E' }}>
            {warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* App Preview */}
      <div className="border rounded-lg p-6" style={{ borderColor: colors.border }}>
        <div className="flex items-start gap-6">
          {draft.logo_url && (
            <img src={draft.logo_url} alt={draft.name} className="w-24 h-24 rounded-lg object-cover" />
          )}
          <div className="flex-1">
            <h3 className="text-2xl font-bold mb-1" style={{ color: colors.text }}>
              {draft.name || 'Sem nome'}
            </h3>
            <p style={{ color: colors.textSecondary }}>{draft.short_description}</p>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: colors.textSecondary }}>
            Categoria
          </p>
          <p style={{ color: colors.text }}>{draft.category || '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: colors.textSecondary }}>
            Público-alvo
          </p>
          <p style={{ color: colors.text }}>{draft.target_audience || '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: colors.textSecondary }}>
            Suporte
          </p>
          <p style={{ color: colors.text }}>{draft.support_email || '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: colors.textSecondary }}>
            Documentação
          </p>
          <p style={{ color: colors.text }}>
            {draft.documentation_url ? <a href={draft.documentation_url} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary }}>Ver docs</a> : '—'}
          </p>
        </div>
      </div>

      {/* Description */}
      <div>
        <p className="text-xs font-semibold uppercase mb-2" style={{ color: colors.textSecondary }}>
          Descrição completa
        </p>
        <p style={{ color: colors.text, whiteSpace: 'pre-line' }}>
          {draft.full_description}
        </p>
      </div>

      {/* Plans */}
      <div>
        <p className="text-xs font-semibold uppercase mb-4" style={{ color: colors.textSecondary }}>
          Planos ({plans.length})
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          {plans.map((plan, i) => (
            <div key={i} className="p-4 rounded-lg border" style={{ borderColor: colors.border }}>
              <p className="font-bold mb-2" style={{ color: colors.text }}>
                {plan.name}
              </p>
              <p className="text-2xl font-bold mb-2" style={{ color: colors.primary }}>
                {plan.currency} {plan.price?.toFixed(2)}
              </p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                {plan.billing_period}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 rounded-lg" style={{ backgroundColor: '#F0F9FF', borderColor: colors.primary, border: '1px solid' }}>
        <p className="text-sm" style={{ color: colors.text }}>
          <strong>📋 Antes de enviar:</strong> Confirme que todas as informações e imagens são fidedignas ao seu produto. Você receberá feedback via email se ajustes forem necessários.
        </p>
      </div>
    </div>
  )
}
