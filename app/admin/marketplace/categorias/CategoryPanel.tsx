'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MARKETPLACE_COLORS as C, formatDateTimeBR } from '@/lib/marketplace'
import { CATEGORY_ICON_NAMES, CATEGORY_ICON_MAP, DEFAULT_CATEGORY_ICON } from '@/lib/category-icons'
import { colors as LIGHT } from '@/lib/design-tokens'
import type { CategoryRow } from '@/lib/services/categories'
import { ACTION_LABEL, type CategoryEvent } from './CategoriasClient'

type Tab = 'informacoes' | 'subcategorias' | 'historico'

interface Props {
  category: CategoryRow | null
  isCreate: boolean
  createParentId: string | null
  flat: CategoryRow[]
  events: CategoryEvent[]
  onClose: () => void
}

export default function CategoryPanel({ category, isCreate, createParentId, flat, events, onClose }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('informacoes')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(category?.name ?? '')
  const [slug, setSlug] = useState(category?.slug ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '')
  const [showInNav, setShowInNav] = useState(category?.showInNav ?? true)
  const [parentId, setParentId] = useState<string>(isCreate ? (createParentId ?? '') : (category?.parentId ?? ''))
  const [showMoveParent, setShowMoveParent] = useState(false)
  const [affectedUrls, setAffectedUrls] = useState<string[] | null>(null)

  if (!isCreate && !category) return null

  const rootOptions = flat.filter(c => !c.parentId && c.id !== category?.id)
  const children = category ? flat.filter(c => c.parentId === category.id) : []
  const parentCategory = category?.parentId ? flat.find(c => c.id === category.parentId) : null
  const PreviewIcon = (icon && CATEGORY_ICON_MAP[icon]) || DEFAULT_CATEGORY_ICON
  const categoryEvents = category ? events.filter(e => e.category_id === category.id) : []

  async function handleCreate() {
    if (!name.trim()) { toast.error('Informe um nome.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || undefined, icon: icon || undefined, slug: slug || undefined, parentId: parentId || undefined, showInNav }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Não foi possível criar agora.'); return }
      toast.success('Categoria criada.')
      onClose()
      router.refresh()
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
    } finally { setBusy(false) }
  }

  async function handleSave() {
    if (!category) return
    if (!name.trim()) { toast.error('Informe um nome.'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/categories/${category.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, icon: icon || null, slug, updatedAt: category.updatedAt }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.conflict) toast.error('Esta categoria foi alterada por outro administrador — recarregue antes de salvar.')
        else toast.error(data.error || 'Não foi possível salvar agora.')
        return
      }
      if (data.affectedUrls?.length) setAffectedUrls(data.affectedUrls)
      toast.success('Categoria atualizada.')
      router.refresh()
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
    } finally { setBusy(false) }
  }

  async function handleToggleNav() {
    if (!category) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/categories/${category.id}/toggle-nav`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Não foi possível atualizar agora.'); return }
      setShowInNav(data.showInNav)
      toast.success('Visibilidade na navegação atualizada.')
      router.refresh()
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
    } finally { setBusy(false) }
  }

  async function handleMove(newParentId: string) {
    if (!category) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/categories/${category.id}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newParentId: newParentId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Não foi possível mover agora.'); return }
      toast.success('Categoria movida.')
      setShowMoveParent(false)
      router.refresh()
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
    } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={next => !next && onClose()}>
      <SheetContent
        side="right"
        className="w-full border-l bg-[#131A26] text-white sm:max-w-md [&_[data-slot=sheet-close]]:text-white/60"
        style={{ borderColor: C.border }}
      >
        <SheetHeader className="border-b" style={{ borderColor: C.border }}>
          <SheetTitle style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>
            {isCreate ? (createParentId ? 'Nova subcategoria' : 'Nova categoria') : category?.name}
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-1 border-b px-4" style={{ borderColor: C.border }}>
          <PanelTab label="Informações" active={tab === 'informacoes'} onClick={() => setTab('informacoes')} />
          {!isCreate && !category?.parentId && <PanelTab label="Subcategorias" active={tab === 'subcategorias'} onClick={() => setTab('subcategorias')} />}
          {!isCreate && <PanelTab label="Histórico" active={tab === 'historico'} onClick={() => setTab('historico')} />}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {tab === 'informacoes' && (
            <div className="space-y-4">
              <Field label="Nome *">
                <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm" style={{ borderColor: C.border, color: C.text }} />
              </Field>

              <Field label="Slug" hint="Usado na URL pública. Alterar preserva o link antigo com redirecionamento automático.">
                <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="gerado automaticamente se vazio"
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm" style={{ borderColor: C.border, color: C.text }} />
              </Field>

              <Field label="Descrição">
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={300}
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm" style={{ borderColor: C.border, color: C.text }} />
              </Field>

              <Field label="Ícone">
                <select value={icon} onChange={e => setIcon(e.target.value)} className="w-full rounded-lg border bg-[#131A26] px-3 py-2 text-sm" style={{ borderColor: C.border, color: C.text }}>
                  <option value="">Sem ícone</option>
                  {CATEGORY_ICON_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>

              {isCreate ? (
                <Field label="Categoria principal" hint="Deixe em branco para criar como categoria-raiz.">
                  <select value={parentId} onChange={e => setParentId(e.target.value)} disabled={!!createParentId}
                    className="w-full rounded-lg border bg-[#131A26] px-3 py-2 text-sm disabled:opacity-60" style={{ borderColor: C.border, color: C.text }}>
                    <option value="">Nenhuma (categoria-raiz)</option>
                    {rootOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="Categoria principal">
                  {!showMoveParent ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: C.text }}>{parentCategory ? parentCategory.name : 'Nenhuma (categoria-raiz)'}</span>
                      <button type="button" onClick={() => setShowMoveParent(true)} className="text-xs font-semibold" style={{ color: C.primary }}>Mudar</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select defaultValue={category?.parentId ?? ''} onChange={e => handleMove(e.target.value)} disabled={busy}
                        className="w-full rounded-lg border bg-[#131A26] px-3 py-2 text-sm" style={{ borderColor: C.border, color: C.text }}>
                        <option value="">Nenhuma (categoria-raiz)</option>
                        {rootOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <button type="button" onClick={() => setShowMoveParent(false)} className="text-xs" style={{ color: C.textSecondary }}>Cancelar</button>
                    </div>
                  )}
                </Field>
              )}

              {!isCreate && (
                <Field label="Exibir na navegação" hint="Independente do status — uma categoria ativa pode ficar fora do menu e continuar acessível por link/filtro.">
                  <button type="button" onClick={handleToggleNav} disabled={busy}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                    style={{ borderColor: showInNav ? C.primary : C.border, color: showInNav ? C.primary : C.textSecondary }}>
                    {showInNav ? 'Exibida no menu' : 'Oculta do menu'}
                  </button>
                </Field>
              )}

              {affectedUrls && affectedUrls.length > 0 && (
                <p className="rounded-lg border p-2 text-xs" style={{ borderColor: C.warning, color: C.warning }}>
                  Link antigo preservado com redirecionamento automático.
                </p>
              )}

              <div>
                <p className="mb-2 text-xs font-medium" style={{ color: C.textSecondary }}>Prévia no marketplace</p>
                <div className="flex flex-col items-center gap-2 rounded-2xl border p-6 text-center" style={{ background: LIGHT.background, borderColor: LIGHT.border }}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${LIGHT.primary}15` }}>
                    <PreviewIcon size={22} style={{ color: LIGHT.primary }} aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: LIGHT.text }}>{name.trim() || 'Nome da categoria'}</p>
                </div>
              </div>
            </div>
          )}

          {tab === 'subcategorias' && category && (
            <div className="space-y-2">
              {children.length === 0 ? (
                <p className="text-sm" style={{ color: C.textSecondary }}>Nenhuma subcategoria ainda.</p>
              ) : children.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-2.5" style={{ borderColor: C.border }}>
                  <span className="text-sm" style={{ color: C.text }}>{c.name}</span>
                  <span className="text-xs" style={{ color: C.textSecondary }}>{c.directPublishedCount} app(s)</span>
                </div>
              ))}
              <button type="button" onClick={() => router.push(`/admin/marketplace/categorias?categoria=novo&pai=${category.id}`)}
                className="w-full rounded-lg border py-2 text-xs font-semibold" style={{ borderColor: C.primary, color: C.primary }}>
                + Nova subcategoria
              </button>
            </div>
          )}

          {tab === 'historico' && (
            <div className="space-y-3">
              {categoryEvents.length === 0 ? (
                <p className="text-sm" style={{ color: C.textSecondary }}>Nenhuma ação administrativa registrada ainda.</p>
              ) : categoryEvents.map(e => (
                <div key={e.id} className="rounded-lg border p-2.5 text-xs" style={{ borderColor: C.border }}>
                  <p style={{ color: C.text }}>{ACTION_LABEL[e.action] ?? e.action} por {e.actorName}</p>
                  {e.reason && <p className="mt-1" style={{ color: C.textSecondary }}>Motivo: {e.reason}</p>}
                  <p className="mt-1" style={{ color: C.textSecondary }}>{formatDateTimeBR(e.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {tab === 'informacoes' && (
          <div className="flex gap-2 border-t p-4" style={{ borderColor: C.border }}>
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Cancelar</button>
            <button type="button" onClick={isCreate ? handleCreate : handleSave} disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: C.primary }}>
              {busy ? <><Loader2 size={15} className="animate-spin" />Salvando…</> : 'Salvar'}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: C.textSecondary }}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px]" style={{ color: C.textSecondary }}>{hint}</span>}
    </label>
  )
}

function PanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="px-2 py-2.5 text-xs font-medium"
      style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>
      {label}
    </button>
  )
}
