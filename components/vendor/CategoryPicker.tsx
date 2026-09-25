'use client'

import { useEffect, useState } from 'react'
import { colors } from '@/lib/design-tokens'

interface ChildCategory { id: string; name: string; slug: string; icon: string | null }
interface ParentCategory extends ChildCategory { children: ChildCategory[] }

interface Props {
  /** category_id atual do app (pode ser categoria-pai ou subcategoria — um único valor). */
  value: string | null
  /** label é o nome da categoria/subcategoria escolhida — útil pra prévias que exibem o nome sem refazer a busca. */
  onChange: (categoryId: string | null, label?: string | null) => void
  disabled?: boolean
}

/**
 * Seletor de categoria em cascata (pai + subcategoria) pro editor do
 * parceiro — consome a árvore pública real via GET /api/categories/tree
 * em vez do <select> de 6 códigos fixos ou do <input>+<datalist> de texto
 * livre que existiam antes. Um app só tem um category_id: escolher a
 * subcategoria substitui o valor pela subcategoria; voltar pra "nenhuma
 * subcategoria" usa o id da categoria-pai.
 */
export default function CategoryPicker({ value, onChange, disabled }: Props) {
  const [tree, setTree] = useState<ParentCategory[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/categories/tree')
      .then(res => res.json())
      .then(data => { if (active) setTree(data.categories ?? []) })
      .catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [])

  if (loadError) {
    return <p className="text-sm" style={{ color: colors.textSecondary }}>Não foi possível carregar as categorias agora. Recarregue a página.</p>
  }
  if (!tree) {
    return <p className="text-sm" style={{ color: colors.textSecondary }}>Carregando categorias…</p>
  }
  const categories = tree

  const selectedParent = categories.find(p => p.id === value || p.children.some(c => c.id === value)) ?? null
  const selectedChildId = selectedParent && selectedParent.id !== value ? value : null

  function handleParentChange(newParentId: string) {
    if (!newParentId) { onChange(null, null); return }
    const parent = categories.find(p => p.id === newParentId)
    onChange(newParentId, parent?.name ?? null)
  }

  function handleChildChange(newChildId: string) {
    if (!selectedParent) return
    if (!newChildId) { onChange(selectedParent.id, selectedParent.name); return }
    const child = selectedParent.children.find(c => c.id === newChildId)
    onChange(newChildId, child?.name ?? selectedParent.name)
  }

  return (
    <div className="space-y-3">
      <div>
        <select
          value={selectedParent?.id ?? ''}
          onChange={e => handleParentChange(e.target.value)}
          disabled={disabled}
          className="w-full px-4 py-3 rounded-lg border"
          style={{ borderColor: colors.border, color: colors.text }}
        >
          <option value="">Selecione uma categoria</option>
          {categories.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {selectedParent && selectedParent.children.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: colors.textSecondary }}>Subcategoria (opcional)</label>
          <select
            value={selectedChildId ?? ''}
            onChange={e => handleChildChange(e.target.value)}
            disabled={disabled}
            className="w-full px-4 py-3 rounded-lg border"
            style={{ borderColor: colors.border, color: colors.text }}
          >
            <option value="">Nenhuma (categoria principal)</option>
            {selectedParent.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}
