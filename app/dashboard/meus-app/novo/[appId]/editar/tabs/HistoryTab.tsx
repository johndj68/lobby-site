'use client'

import { colors } from '@/lib/design-tokens'
import Field from '@/components/vendor/editor/Field'
import RepeatableList from '@/components/vendor/editor/RepeatableList'
import type { DraftFormData } from '../types'

interface Props {
  formData: DraftFormData
  onChange: <K extends keyof DraftFormData>(field: K, value: DraftFormData[K]) => void
}

export default function HistoryTab({ formData, onChange }: Props) {
  return (
    <div>
      <h3 className="mb-1 text-base font-bold" style={{ color: colors.text }}>História do produto</h3>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>Opcional. Conte marcos ou o contexto por trás do seu aplicativo.</p>
      <Field label="Marcos da história" help="">
        <RepeatableList
          items={formData.history as unknown as Record<string, string>[]}
          onChange={items => onChange('history', items as { title: string; description: string }[])}
          fields={[
            { key: 'title', label: 'Título', placeholder: 'Ex.: Como começamos' },
            { key: 'description', label: 'Descrição', type: 'textarea', placeholder: 'Conte esse momento.' },
          ]}
          addLabel="Adicionar marco"
        />
      </Field>
    </div>
  )
}
