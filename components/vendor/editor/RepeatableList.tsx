'use client'

import { Plus, X } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

export interface RepeatableFieldConfig { key: string; label: string; type?: 'text' | 'textarea'; placeholder?: string; maxLength?: number }

interface Props {
  items: Record<string, string>[]
  onChange: (items: Record<string, string>[]) => void
  fields: RepeatableFieldConfig[]
  addLabel: string
  removableBelow?: number // não permite remover abaixo dessa quantidade de linhas (ex.: 2 benefícios mínimos)
}

/** Lista de itens repetíveis (funcionalidades, história, sinais de
 *  confiança, FAQ, benefícios) — mesmo padrão de adicionar/remover linha
 *  reaproveitado nas quatro abas opcionais do editor. */
export default function RepeatableList({ items, onChange, fields, addLabel, removableBelow = 0 }: Props) {
  function updateItem(idx: number, key: string, value: string) {
    const next = items.map((it, i) => (i === idx ? { ...it, [key]: value } : it))
    onChange(next)
  }
  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }
  function addItem() {
    onChange([...items, Object.fromEntries(fields.map(f => [f.key, '']))])
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => {
        const canRemove = items.length > removableBelow
        return (
          <div key={idx} className="flex gap-2 rounded-xl border p-3" style={{ borderColor: colors.border }}>
            <div className="flex-1 space-y-2">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="sr-only">{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea value={item[f.key] || ''} onChange={e => updateItem(idx, f.key, e.target.value)}
                      placeholder={f.placeholder} rows={2} maxLength={f.maxLength}
                      className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                  ) : (
                    <input type="text" value={item[f.key] || ''} onChange={e => updateItem(idx, f.key, e.target.value)}
                      placeholder={f.placeholder} maxLength={f.maxLength}
                      className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                  )}
                </div>
              ))}
            </div>
            {canRemove && (
              <button type="button" onClick={() => removeItem(idx)} aria-label="Remover item"
                className="h-fit shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
      <button type="button" onClick={addItem}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm font-semibold"
        style={{ borderColor: colors.border, color: colors.primary }}>
        <Plus size={14} aria-hidden="true" /> {addLabel}
      </button>
    </div>
  )
}
