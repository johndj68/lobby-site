'use client'

import { colors } from '@/lib/design-tokens'
import Field from '@/components/vendor/editor/Field'
import RepeatableList from '@/components/vendor/editor/RepeatableList'
import type { DraftFormData } from '../types'

interface Props {
  formData: DraftFormData
  onChange: <K extends keyof DraftFormData>(field: K, value: DraftFormData[K]) => void
}

export default function FaqTab({ formData, onChange }: Props) {
  return (
    <div>
      <h3 className="mb-1 text-base font-bold" style={{ color: colors.text }}>Perguntas frequentes</h3>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>Opcional. Responda dúvidas comuns dos compradores antes que perguntem.</p>
      <Field label="Perguntas e respostas" help="">
        <RepeatableList
          items={formData.faq as unknown as Record<string, string>[]}
          onChange={items => onChange('faq', items as { question: string; answer: string }[])}
          fields={[
            { key: 'question', label: 'Pergunta', placeholder: 'Ex.: Preciso saber programar?' },
            { key: 'answer', label: 'Resposta', type: 'textarea', placeholder: 'Não, o app é 100% visual.' },
          ]}
          addLabel="Adicionar pergunta"
        />
      </Field>
    </div>
  )
}
