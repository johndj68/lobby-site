'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import CategoryPicker from '@/components/vendor/CategoryPicker'
import Field from '@/components/vendor/editor/Field'
import RepeatableList from '@/components/vendor/editor/RepeatableList'
import type { DraftFormData } from '../types'

interface Props {
  formData: DraftFormData
  onChange: <K extends keyof DraftFormData>(field: K, value: DraftFormData[K]) => void
  onCategoryChange: (categoryId: string | null, label?: string | null) => void
}

export default function BasicInfoTab({ formData, onChange, onCategoryChange }: Props) {
  const [integrationInput, setIntegrationInput] = useState('')

  function addIntegration() {
    const name = integrationInput.trim()
    if (!name) return
    onChange('integrations', [...formData.integrations, { name }])
    setIntegrationInput('')
  }
  function removeIntegration(idx: number) {
    onChange('integrations', formData.integrations.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <h3 className="text-base font-bold" style={{ color: colors.text }}>Identificação do aplicativo</h3>

        <Field label="Nome do aplicativo" required help="Use um nome claro e fácil de lembrar." htmlFor="f-name" counter={{ current: (formData.name || '').length, max: 80 }}>
          <input id="f-name" type="text" value={formData.name || ''} onChange={e => onChange('name', e.target.value)} maxLength={80}
            placeholder="Ex.: FlowPilot" className="w-full rounded-lg border px-4 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
        </Field>

        <Field label="Categoria" required help="Escolha a categoria e, se fizer sentido, uma subcategoria mais específica.">
          <div id="f-category" tabIndex={-1}>
            <CategoryPicker value={formData.category_id} onChange={onCategoryChange} />
          </div>
        </Field>
      </section>

      <section className="space-y-5 border-t pt-6" style={{ borderColor: colors.borderLight }}>
        <h3 className="text-base font-bold" style={{ color: colors.text }}>Apresentação e benefícios</h3>

        <Field label="Descrição curta" required help="Uma frase que aparece em destaque no anúncio." htmlFor="f-short" counter={{ current: (formData.short_description || '').length, max: 120 }}>
          <input id="f-short" type="text" value={formData.short_description || ''} onChange={e => onChange('short_description', e.target.value)} maxLength={120}
            placeholder="Automatize tarefas e conecte suas ferramentas." className="w-full rounded-lg border px-4 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
        </Field>

        <Field label="Diferencial do produto" required help="Explique o que torna seu aplicativo único." htmlFor="f-full" counter={{ current: (formData.full_description || '').length, max: 600 }}>
          <textarea id="f-full" value={formData.full_description || ''} onChange={e => onChange('full_description', e.target.value)} rows={4} maxLength={600}
            placeholder="Crie fluxos visuais para conectar ferramentas e automatizar tarefas, sem precisar programar." className="w-full rounded-lg border px-4 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
        </Field>

        <Field label="Principais benefícios" help="Bullets curtos exibidos na prévia do anúncio. Opcional, mas recomendado.">
          <RepeatableList
            items={formData.benefits}
            onChange={items => onChange('benefits', items as { title: string }[])}
            fields={[{ key: 'title', label: 'Benefício', placeholder: 'Conecte suas ferramentas em um só lugar', maxLength: 120 }]}
            addLabel="Adicionar benefício"
            removableBelow={2}
          />
        </Field>
      </section>

      <section className="space-y-5 border-t pt-6" style={{ borderColor: colors.borderLight }}>
        <h3 className="text-base font-bold" style={{ color: colors.text }}>Público e integrações</h3>

        <Field label="Ideal para" help="Qual perfil se beneficia mais com seu app." htmlFor="f-audience">
          <input id="f-audience" type="text" value={formData.target_audience || ''} onChange={e => onChange('target_audience', e.target.value)}
            placeholder="Pequenas empresas, agências de marketing…" className="w-full rounded-lg border px-4 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
        </Field>

        <Field label="Integrações" help="Ferramentas com que seu aplicativo se conecta.">
          <div className="mb-2 flex flex-wrap gap-2">
            {formData.integrations.map((it, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium" style={{ background: colors.backgroundAlt, color: colors.text }}>
                {it.name}
                <button type="button" onClick={() => removeIntegration(i)} aria-label={`Remover ${it.name}`} className="text-gray-400 hover:text-red-500">
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={integrationInput} onChange={e => setIntegrationInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIntegration() } }}
              placeholder="Slack, Notion, Gmail…" className="flex-1 rounded-lg border px-4 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
            <button type="button" onClick={addIntegration} className="rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: colors.primary, color: colors.primary }}>
              + Adicionar
            </button>
          </div>
        </Field>
      </section>

      <section className="space-y-5 border-t pt-6" style={{ borderColor: colors.borderLight }}>
        <h3 className="text-base font-bold" style={{ color: colors.text }}>Website</h3>
        <Field label="Website do produto" help="Informe o site oficial do seu produto." htmlFor="f-url">
          <input id="f-url" type="url" value={formData.website_url || ''} onChange={e => onChange('website_url', e.target.value)}
            placeholder="https://flowpilot.example" className="w-full rounded-lg border px-4 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
        </Field>
      </section>

      <p className="text-xs" style={{ color: colors.textSecondary }}>* Campos obrigatórios para enviar para análise</p>
    </div>
  )
}
