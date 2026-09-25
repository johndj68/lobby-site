'use client'

import { colors } from '@/lib/design-tokens'
import Field from '@/components/vendor/editor/Field'
import RepeatableList from '@/components/vendor/editor/RepeatableList'
import type { DraftFormData } from '../types'

interface Props {
  formData: DraftFormData
  onChange: <K extends keyof DraftFormData>(field: K, value: DraftFormData[K]) => void
}

export default function SignalsTab({ formData, onChange }: Props) {
  return (
    <div>
      <h3 className="mb-1 text-base font-bold" style={{ color: colors.text }}>Sinais de confiança</h3>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>Opcional. Certificações, prêmios ou menções que reforcem credibilidade.</p>
      <Field label="Sinais" help="">
        <RepeatableList
          items={formData.trust_signals as unknown as Record<string, string>[]}
          onChange={items => onChange('trust_signals', items as { title: string; url?: string }[])}
          fields={[
            { key: 'title', label: 'Título', placeholder: 'Ex.: Certificado ISO 27001' },
            { key: 'url', label: 'Link', placeholder: 'https://… (opcional)' },
          ]}
          addLabel="Adicionar sinal"
        />
      </Field>
    </div>
  )
}
