'use client'

import { colors } from '@/lib/design-tokens'
import Field from '@/components/vendor/editor/Field'
import RepeatableList from '@/components/vendor/editor/RepeatableList'
import type { DraftFormData } from '../types'

interface Props {
  formData: DraftFormData
  onChange: <K extends keyof DraftFormData>(field: K, value: DraftFormData[K]) => void
}

export default function FeaturesTab({ formData, onChange }: Props) {
  return (
    <div>
      <h3 className="mb-1 text-base font-bold" style={{ color: colors.text }}>Funcionalidades</h3>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>Recomendado. Liste o que seu aplicativo faz — aparece na prévia e na página pública.</p>
      <Field label="Lista de funcionalidades" help="">
        <div id="f-features" tabIndex={-1} />
        <RepeatableList
          items={formData.features as unknown as Record<string, string>[]}
          onChange={items => onChange('features', items as { name: string; description?: string }[])}
          fields={[
            { key: 'name', label: 'Nome', placeholder: 'Ex.: Automação de fluxos' },
            { key: 'description', label: 'Descrição', type: 'textarea', placeholder: 'Descreva rapidamente essa funcionalidade (opcional).' },
          ]}
          addLabel="Adicionar funcionalidade"
        />
      </Field>
    </div>
  )
}
