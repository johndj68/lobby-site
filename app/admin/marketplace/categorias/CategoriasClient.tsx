'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Tags, Layers, AlertTriangle, Search, PlusCircle, Download, RefreshCw, ChevronRight, ChevronDown,
  Eye, EyeOff, Pencil, Trash2, ArrowUp, ArrowDown, ListOrdered, X, Info, Loader2,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MARKETPLACE_COLORS as C } from '@/lib/marketplace'
import { CATEGORY_ICON_MAP, DEFAULT_CATEGORY_ICON } from '@/lib/category-icons'
import type { CategoryNode, CategoryRow, CategoryPendencyRow } from '@/lib/services/categories'
import CategoryPanel from './CategoryPanel'

const NAV_TABS = [
  { label: 'Visão geral', href: '/admin/marketplace', enabled: true },
  { label: 'Aplicativos', href: '/admin/marketplace/aplicativos', enabled: true },
  { label: 'Solicitações', href: '/admin/marketplace/solicitacoes', enabled: true },
  { label: 'Ofertas', href: '/admin/marketplace/ofertas', enabled: true },
  { label: 'Destaques', href: '/admin/marketplace/destaques', enabled: true },
  { label: 'Categorias', href: '/admin/marketplace/categorias', enabled: true },
  { label: 'Parceiros', href: '/admin/marketplace/parceiros', enabled: true },
]

export interface CategoryEvent {
  id: string; category_id: string | null; action: string; reason: string | null
  previous_status: string | null; new_status: string | null; actor_id: string | null
  created_at: string; actorName: string
}

interface Filters {
  tab: 'categorias' | 'pendencias'
  categoria: string | null
  q: string; status: string; pai: string; organizar: boolean
  pq: string; ptipo: string; ppartner: string; ppublicacao: string
}

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  tree: CategoryNode[]
  flat: CategoryRow[]
  loadError: boolean
  pendencyRows: CategoryPendencyRow[]
  pendencyError: boolean
  events: CategoryEvent[]
  indicators: { categoriasAtivas: number; subcategoriasAtivas: number; appsSemCategoria: number }
  searchParams: Filters
}

export const ACTION_LABEL: Record<string, string> = {
  create_category: 'Categoria criada', update_category: 'Categoria atualizada', move_category: 'Categoria movida',
  reorder_categories: 'Ordem alterada', toggle_category_status: 'Status alterado', toggle_category_nav: 'Navegação alterada',
  delete_category: 'Categoria excluída', reclassify_app: 'Aplicativo reclassificado', reclassify_apps_bulk: 'Reclassificação em lote',
}

export default function CategoriasClient({ user, profile, tree, flat, loadError, pendencyRows, pendencyError, events, indicators, searchParams: sp }: Props) {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(sp.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(flat.filter(c => !c.parentId).map(c => c.id)))
  const seenRootIds = useRef<Set<string>>(new Set(flat.filter(c => !c.parentId).map(c => c.id)))

  // Uma categoria-raiz recém-criada nasce expandida (nunca reabre uma que o
  // admin recolheu manualmente — só ids nunca vistos antes nesta sessão).
  useEffect(() => {
    const newRootIds = flat.filter(c => !c.parentId && !seenRootIds.current.has(c.id)).map(c => c.id)
    if (newRootIds.length === 0) return
    for (const id of newRootIds) seenRootIds.current.add(id)
    setExpanded(prev => new Set([...prev, ...newRootIds]))
  }, [flat])
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<CategoryRow | null>(null)
  const [pendingToggle, setPendingToggle] = useState<CategoryRow | null>(null)
  const [toggleImpact, setToggleImpact] = useState<string | null>(null)

  function pushFilters(next: Partial<Filters>) {
    const merged = { ...sp, ...next }
    const params = new URLSearchParams()
    if (merged.tab !== 'categorias') params.set('tab', merged.tab)
    if (merged.categoria) params.set('categoria', merged.categoria)
    if (merged.q) params.set('q', merged.q)
    if (merged.status !== 'todas') params.set('status', merged.status)
    if (merged.pai !== 'todas') params.set('pai', merged.pai)
    if (merged.organizar) params.set('organizar', '1')
    if (merged.pq) params.set('pq', merged.pq)
    if (merged.ptipo !== 'todos') params.set('ptipo', merged.ptipo)
    if (merged.ppartner !== 'todos') params.set('ppartner', merged.ppartner)
    if (merged.ppublicacao !== 'todas') params.set('ppublicacao', merged.ppublicacao)
    router.push(`/admin/marketplace/categorias${params.toString() ? `?${params}` : ''}`)
  }

  function onSearchChange(v: string) {
    setSearchInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushFilters({ q: v }), 350)
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const q = sp.q.trim().toLowerCase()
  const filteredTree = useMemo(() => {
    return tree
      .map(root => {
        const rootMatches = !q || root.name.toLowerCase().includes(q)
        const children = root.children.filter(c => {
          const matches = !q || c.name.toLowerCase().includes(q)
          const statusOk = sp.status === 'todas' || (sp.status === 'ativas' ? c.status === 'active' : c.status === 'inactive')
          return matches && statusOk
        })
        const statusOk = sp.status === 'todas' || (sp.status === 'ativas' ? root.status === 'active' : root.status === 'inactive')
        return { root, children, visible: (statusOk && rootMatches) || children.length > 0 }
      })
      .filter(r => r.visible)
  }, [tree, q, sp.status])

  async function runAction(url: string, body?: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return null }
      return data
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
      return null
    } finally { setBusy(false) }
  }

  async function confirmToggle() {
    if (!pendingToggle) return
    const data = await runAction(`/api/admin/categories/${pendingToggle.id}/toggle-status`)
    if (data) {
      toast.success(pendingToggle.status === 'active' ? 'Categoria desativada.' : 'Categoria ativada.')
      if (data.impactNote) setToggleImpact(data.impactNote)
      else { setPendingToggle(null); router.refresh() }
    }
  }

  async function doDelete() {
    if (!pendingDelete) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/categories/${pendingDelete.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Não foi possível excluir agora.'); return }
      toast.success('Categoria excluída.')
      setPendingDelete(null)
      router.refresh()
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
    } finally { setBusy(false) }
  }

  async function moveOrder(scope: CategoryRow[], id: string, direction: -1 | 1, parentId: string | null) {
    const ids = scope.map(c => c.id)
    const idx = ids.indexOf(id)
    const swapWith = idx + direction
    if (swapWith < 0 || swapWith >= ids.length) return
    ;[ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]]
    const data = await runAction('/api/admin/categories/reorder', { parentId, orderedIds: ids })
    if (data) { toast.success('Ordem atualizada.'); router.refresh() }
  }

  function exportUrl() {
    return '/api/admin/categories/export'
  }

  const activeCategoryOptions = flat.filter(c => c.status === 'active')
  const selectedCategory = sp.categoria && sp.categoria !== 'novo' ? flat.find(c => c.id === sp.categoria) ?? null : null
  const panelOpen = !!sp.categoria
  const createParentId = sp.categoria === 'novo' ? sp.pai !== 'todas' ? sp.pai : null : null

  function closePanel() {
    const params = new URLSearchParams()
    if (sp.tab !== 'categorias') params.set('tab', sp.tab)
    if (sp.q) params.set('q', sp.q)
    if (sp.status !== 'todas') params.set('status', sp.status)
    router.push(`/admin/marketplace/categorias${params.toString() ? `?${params}` : ''}`)
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Categorias
        </p>

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Categorias</h1>
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Organize categorias e subcategorias dos aplicativos do marketplace.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setRefreshing(true); router.refresh(); setTimeout(() => setRefreshing(false), 500) }}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" /> Atualizar
            </button>
            <button type="button" onClick={() => pushFilters({ organizar: !sp.organizar })}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: sp.organizar ? C.primary : C.border, color: sp.organizar ? C.primary : C.text }}>
              <ListOrdered size={14} aria-hidden="true" /> Organizar navegação
            </button>
            {profile?.is_leader && (
              <a href={exportUrl()} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
                <Download size={14} aria-hidden="true" /> Exportar
              </a>
            )}
            <button type="button" onClick={() => pushFilters({ categoria: 'novo', pai: 'todas' })}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
              <PlusCircle size={15} aria-hidden="true" /> Nova categoria
            </button>
          </div>
        </div>

        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => {
            const active = tab.href === '/admin/marketplace/categorias'
            if (!tab.enabled) return <span key={tab.href} title="Esta área ainda não foi implementada." aria-disabled="true" className="cursor-not-allowed px-3 py-2.5 text-sm font-medium opacity-40" style={{ color: C.textSecondary }}>{tab.label}</span>
            return <Link key={tab.href} href={tab.href} className="px-3 py-2.5 text-sm font-medium" style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>{tab.label}</Link>
          })}
        </nav>

        {(loadError || pendencyError) && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            Não foi possível carregar todos os dados agora. Recarregue a página para tentar de novo.
          </div>
        )}

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <IndicatorCard icon={Tags} label="Categorias ativas" value={indicators.categoriasAtivas} />
          <IndicatorCard icon={Layers} label="Subcategorias ativas" value={indicators.subcategoriasAtivas} />
          <IndicatorCard icon={AlertTriangle} label="Apps publicados sem categoria" value={indicators.appsSemCategoria} color={indicators.appsSemCategoria > 0 ? C.warning : undefined} active={sp.tab === 'pendencias'} onClick={() => pushFilters({ tab: 'pendencias' })} />
        </div>

        <div className="mb-5 flex gap-1 border-b" style={{ borderColor: C.border }}>
          <TabButton label="Categorias" active={sp.tab === 'categorias'} onClick={() => pushFilters({ tab: 'categorias' })} />
          <TabButton label={`Pendências${pendencyRows.length > 0 ? ` (${pendencyRows.length})` : ''}`} active={sp.tab === 'pendencias'} onClick={() => pushFilters({ tab: 'pendencias' })} />
        </div>

        {sp.tab === 'categorias' ? (
          <>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
                <label htmlFor="cat-search" className="sr-only">Buscar categoria</label>
                <input id="cat-search" value={searchInput} onChange={e => onSearchChange(e.target.value)}
                  placeholder="Buscar categoria ou subcategoria"
                  className="w-full rounded-xl border py-2 pl-8 pr-3 text-sm outline-none"
                  style={{ background: C.card, borderColor: C.border, color: C.text }} />
              </div>
              <select value={sp.status} onChange={e => pushFilters({ status: e.target.value })}
                className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>
                <option value="todas">Status: todas</option>
                <option value="ativas">Ativas</option>
                <option value="inativas">Inativas</option>
              </select>
              {(sp.q || sp.status !== 'todas') && (
                <button type="button" onClick={() => { setSearchInput(''); pushFilters({ q: '', status: 'todas' }) }} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.primary }}>
                  <X size={12} aria-hidden="true" /> Limpar
                </button>
              )}
            </div>

            <section className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
              {filteredTree.length === 0 ? (
                <p className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>Nenhuma categoria encontrada para esses filtros.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide" style={{ color: C.textSecondary }}>
                        <th className="pb-2 font-medium">Categoria</th>
                        <th className="pb-2 font-medium">Apps publicados</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTree.map(({ root, children }, rootIdx) => (
                        <CategoryRowGroup
                          key={root.id} root={root} childCategories={children}
                          expanded={expanded.has(root.id)} onToggleExpand={() => toggleExpand(root.id)}
                          organizar={sp.organizar}
                          canMoveUp={rootIdx > 0} canMoveDown={rootIdx < filteredTree.length - 1}
                          onMoveRoot={dir => moveOrder(flat.filter(c => !c.parentId), root.id, dir, null)}
                          onMoveChild={(childId, dir) => moveOrder(flat.filter(c => c.parentId === root.id), childId, dir, root.id)}
                          onEdit={id => pushFilters({ categoria: id })}
                          onAddChild={() => pushFilters({ categoria: 'novo', pai: root.id })}
                          onToggleStatus={row => setPendingToggle(row)}
                          onDelete={row => setPendingDelete(row)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <PendenciasTab rows={pendencyRows} activeCategories={activeCategoryOptions} tree={tree} busy={busy} onBusyChange={setBusy} filters={sp} pushFilters={pushFilters} />
        )}
      </div>

      {panelOpen && (
        <CategoryPanel
          key={`${sp.categoria}-${createParentId ?? ''}`}
          category={selectedCategory}
          isCreate={sp.categoria === 'novo'}
          createParentId={createParentId}
          flat={flat}
          events={events}
          onClose={closePanel}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete} onOpenChange={next => !busy && setPendingDelete(next ? pendingDelete : null)}
        icon={Trash2} variant="destructive" title="Excluir categoria?"
        description={<p><strong style={{ color: C.text }}>{pendingDelete?.name}</strong> será excluída permanentemente. Isso só é possível quando não há subcategorias, aplicativos ou rascunhos vinculados.</p>}
        confirmLabel="Excluir" confirmingLabel={<><Loader2 size={15} className="animate-spin" />Excluindo…</>}
        busy={busy} onConfirm={doDelete}
      />

      <ConfirmDialog
        open={!!pendingToggle} onOpenChange={next => { if (!busy) { setPendingToggle(next ? pendingToggle : null); setToggleImpact(null) } }}
        icon={pendingToggle?.status === 'active' ? EyeOff : Eye} variant="neutral"
        title={pendingToggle?.status === 'active' ? 'Desativar categoria?' : 'Ativar categoria?'}
        description={
          <div className="space-y-2">
            <p>
              <strong style={{ color: C.text }}>{pendingToggle?.name}</strong>
              {pendingToggle?.status === 'active' ? ' fica publicamente indisponível. Nada é apagado — os aplicativos permanecem vinculados a ela.' : ' volta a ficar disponível publicamente.'}
            </p>
            {toggleImpact && <p className="rounded-lg border p-2 text-xs" style={{ borderColor: C.warning, color: C.warning }}>{toggleImpact}</p>}
          </div>
        }
        confirmLabel={toggleImpact ? 'Entendi, continuar' : (pendingToggle?.status === 'active' ? 'Desativar' : 'Ativar')}
        confirmingLabel={<><Loader2 size={15} className="animate-spin" />Aplicando…</>}
        busy={busy}
        onConfirm={async () => {
          if (toggleImpact) { setPendingToggle(null); setToggleImpact(null); router.refresh(); return }
          await confirmToggle()
        }}
      />
    </AdminShell>
  )
}

function CategoryRowGroup({
  root, childCategories, expanded, onToggleExpand, organizar, canMoveUp, canMoveDown, onMoveRoot, onMoveChild,
  onEdit, onAddChild, onToggleStatus, onDelete,
}: {
  root: CategoryNode; childCategories: CategoryNode[]; expanded: boolean; onToggleExpand: () => void; organizar: boolean
  canMoveUp: boolean; canMoveDown: boolean; onMoveRoot: (dir: -1 | 1) => void; onMoveChild: (childId: string, dir: -1 | 1) => void
  onEdit: (id: string) => void; onAddChild: () => void; onToggleStatus: (row: CategoryRow) => void; onDelete: (row: CategoryRow) => void
}) {
  const Icon = (root.icon && CATEGORY_ICON_MAP[root.icon]) || DEFAULT_CATEGORY_ICON
  return (
    <>
      <tr className="border-t" style={{ borderColor: C.border }}>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2">
            {childCategories.length > 0 ? (
              <button type="button" onClick={onToggleExpand} className="shrink-0" style={{ color: C.textSecondary }} aria-label={expanded ? 'Recolher' : 'Expandir'}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : <span className="inline-block w-3.5" />}
            <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: `${C.primary}1A` }}>
              <Icon size={13} style={{ color: C.primary }} aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium" style={{ color: C.text }}>{root.name}</p>
              <p className="text-[11px]" style={{ color: C.textSecondary }}>{childCategories.length} subcategoria{childCategories.length === 1 ? '' : 's'}</p>
            </div>
          </div>
        </td>
        <td className="py-3 pr-3" style={{ color: C.text }}>{root.totalPublishedCount}</td>
        <td className="py-3 pr-3"><StatusBadge row={root} /></td>
        <td className="py-3">
          <RowActions organizar={organizar} canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMoveUp={() => onMoveRoot(-1)} onMoveDown={() => onMoveRoot(1)}
            onEdit={() => onEdit(root.id)} onAddChild={onAddChild} onToggleStatus={() => onToggleStatus(root)} onDelete={() => onDelete(root)} isActive={root.status === 'active'} />
        </td>
      </tr>
      {expanded && childCategories.map((child, idx) => (
        <tr key={child.id} className="border-t" style={{ borderColor: C.border }}>
          <td className="py-2.5 pr-3 pl-9">
            <p className="text-sm" style={{ color: C.text }}>{child.name}</p>
          </td>
          <td className="py-2.5 pr-3" style={{ color: C.text }}>{child.directPublishedCount}</td>
          <td className="py-2.5 pr-3"><StatusBadge row={child} /></td>
          <td className="py-2.5">
            <RowActions organizar={organizar} canMoveUp={idx > 0} canMoveDown={idx < childCategories.length - 1}
              onMoveUp={() => onMoveChild(child.id, -1)} onMoveDown={() => onMoveChild(child.id, 1)}
              onEdit={() => onEdit(child.id)} onToggleStatus={() => onToggleStatus(child)} onDelete={() => onDelete(child)} isActive={child.status === 'active'} />
          </td>
        </tr>
      ))}
    </>
  )
}

function RowActions({ organizar, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onEdit, onAddChild, onToggleStatus, onDelete, isActive }: {
  organizar: boolean; canMoveUp: boolean; canMoveDown: boolean; onMoveUp: () => void; onMoveDown: () => void
  onEdit: () => void; onAddChild?: () => void; onToggleStatus: () => void; onDelete: () => void; isActive: boolean
}) {
  if (organizar) {
    return (
      <div className="flex items-center gap-1">
        <button type="button" disabled={!canMoveUp} onClick={onMoveUp} title="Mover para cima" className="rounded-lg border p-1.5 disabled:opacity-30" style={{ borderColor: C.border, color: C.text }}><ArrowUp size={13} aria-hidden="true" /></button>
        <button type="button" disabled={!canMoveDown} onClick={onMoveDown} title="Mover para baixo" className="rounded-lg border p-1.5 disabled:opacity-30" style={{ borderColor: C.border, color: C.text }}><ArrowDown size={13} aria-hidden="true" /></button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={onEdit} title="Editar" className="rounded-lg border p-1.5" style={{ borderColor: C.primary, color: C.primary }}><Pencil size={13} aria-hidden="true" /></button>
      {onAddChild && <button type="button" onClick={onAddChild} title="Nova subcategoria" className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.textSecondary }}><PlusCircle size={13} aria-hidden="true" /></button>}
      <button type="button" onClick={onToggleStatus} title={isActive ? 'Desativar' : 'Ativar'} className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: isActive ? C.warning : C.success }}>{isActive ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}</button>
      <button type="button" onClick={onDelete} title="Excluir" className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.error }}><Trash2 size={13} aria-hidden="true" /></button>
    </div>
  )
}

function StatusBadge({ row }: { row: CategoryRow }) {
  const active = row.status === 'active'
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: active ? `${C.success}22` : `${C.textSecondary}22`, color: active ? C.success : C.textSecondary }}>
        {active ? 'Ativa' : 'Inativa'}
      </span>
      {!row.showInNav && <span title="Fora da navegação — só acessível por link/filtro direto" style={{ color: C.textSecondary }}><EyeOff size={12} aria-hidden="true" /></span>}
    </div>
  )
}

function IndicatorCard({ icon: Icon, label, value, color, onClick, active }: { icon: React.ElementType; label: string; value: number; color?: string; onClick?: () => void; active?: boolean }) {
  const content = (
    <>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${color ?? C.primary}1A` }}>
        <Icon size={15} style={{ color: color ?? C.primary }} aria-hidden="true" />
      </div>
      <p className="text-xs font-medium" style={{ color: C.textSecondary }}>{label}</p>
      <p className="my-0.5 text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
    </>
  )
  if (!onClick) return <div className="rounded-2xl border p-4 text-left" style={{ background: C.card, borderColor: C.border }}>{content}</div>
  return <button onClick={onClick} className="rounded-2xl border p-4 text-left transition-colors" style={{ background: C.card, borderColor: active ? C.primary : C.border }}>{content}</button>
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="px-3 py-2.5 text-sm font-medium"
      style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>
      {label}
    </button>
  )
}

function PendenciasTab({ rows, activeCategories, busy, onBusyChange, filters, pushFilters }: {
  rows: CategoryPendencyRow[]; activeCategories: CategoryRow[]; tree: CategoryNode[]; busy: boolean; onBusyChange: (b: boolean) => void
  filters: Filters; pushFilters: (next: Partial<Filters>) => void
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState('')
  const [rowCategory, setRowCategory] = useState<Record<string, string>>({})

  const partnerOptions = [...new Map(rows.map(r => [r.partnerId, r.partnerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))

  const q = filters.pq.trim().toLowerCase()
  const filtered = rows.filter(r => {
    if (q && !r.appName.toLowerCase().includes(q)) return false
    if (filters.ptipo !== 'todos' && r.pendencyType !== filters.ptipo) return false
    if (filters.ppartner !== 'todos' && r.partnerId !== filters.ppartner) return false
    if (filters.ppublicacao !== 'todas' && r.publicationStatus !== filters.ppublicacao) return false
    return true
  })

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function applyOne(row: CategoryPendencyRow) {
    const categoryId = rowCategory[row.id]
    if (!categoryId) { toast.error('Selecione uma categoria.'); return }
    onBusyChange(true)
    try {
      const res = await fetch('/api/admin/categories/reclassify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: row.target, id: row.targetId, categoryId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Não foi possível reclassificar agora.'); return }
      toast.success('Aplicativo reclassificado.')
      router.refresh()
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
    } finally { onBusyChange(false) }
  }

  async function applyBulk() {
    if (!bulkCategory) { toast.error('Selecione uma categoria.'); return }
    const items = filtered.filter(r => selected.has(r.id)).map(r => ({ target: r.target, id: r.targetId, expectedCategoryId: r.categoryId }))
    if (items.length === 0) { toast.error('Selecione ao menos um aplicativo.'); return }
    onBusyChange(true)
    try {
      const res = await fetch('/api/admin/categories/reclassify-bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, categoryId: bulkCategory }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return }
      const failed = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok)
      if (failed.length > 0) toast.error(`${failed.length} item(ns) não foram aplicados — recarregando.`)
      else toast.success('Reclassificação em lote concluída.')
      setSelected(new Set())
      router.refresh()
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
    } finally { onBusyChange(false) }
  }

  return (
    <div>
      {rows.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.warning, background: 'rgba(245,158,11,0.08)', color: C.text }}>
          <Info size={16} style={{ color: C.warning }} aria-hidden="true" />
          {rows.length} aplicativo{rows.length === 1 ? '' : 's'} precisa{rows.length === 1 ? '' : 'm'} de classificação.
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <input value={filters.pq} onChange={e => pushFilters({ pq: e.target.value })} placeholder="Buscar aplicativo"
          className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }} />
        <select value={filters.ptipo} onChange={e => pushFilters({ ptipo: e.target.value })} className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>
          <option value="todos">Tipo: todos</option>
          <option value="sem_categoria">Sem categoria</option>
          <option value="categoria_inativa">Categoria inativa</option>
        </select>
        <select value={filters.ppartner} onChange={e => pushFilters({ ppartner: e.target.value })} className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>
          <option value="todos">Parceiro: todos</option>
          {partnerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={filters.ppublicacao} onChange={e => pushFilters({ ppublicacao: e.target.value })} className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>
          <option value="todas">Publicação: todas</option>
          <option value="publicado">Publicado</option>
          <option value="suspenso">Suspenso</option>
          <option value="em_revisao">Em revisão</option>
          <option value="rascunho">Rascunho</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: C.primary, background: `${C.primary}0D` }}>
          <span className="text-sm font-semibold" style={{ color: C.text }}>{selected.size} selecionado{selected.size === 1 ? '' : 's'}</span>
          <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>
            <option value="">Selecione a categoria de destino</option>
            {activeCategories.map(c => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={applyBulk} className="rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: C.primary }}>Aplicar aos selecionados</button>
        </div>
      )}

      <section className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>Nenhuma pendência encontrada para esses filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide" style={{ color: C.textSecondary }}>
                  <th className="pb-2 font-medium"><span className="sr-only">Selecionar</span></th>
                  <th className="pb-2 font-medium">Aplicativo</th>
                  <th className="pb-2 font-medium">Parceiro</th>
                  <th className="pb-2 font-medium">Publicação</th>
                  <th className="pb-2 font-medium">Pendência</th>
                  <th className="pb-2 font-medium">Reclassificar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-t align-middle" style={{ borderColor: C.border }}>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                    </td>
                    <td className="py-2 pr-3" style={{ color: C.text }}>{r.appName}</td>
                    <td className="py-2 pr-3 text-xs" style={{ color: C.textSecondary }}>{r.partnerName}</td>
                    <td className="py-2 pr-3 text-xs" style={{ color: C.textSecondary }}>{PUBLICATION_LABEL[r.publicationStatus]}</td>
                    <td className="py-2 pr-3 text-xs" style={{ color: C.warning }}>{r.pendencyType === 'sem_categoria' ? 'Sem categoria' : 'Categoria inativa'}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        <select value={rowCategory[r.id] ?? ''} onChange={e => setRowCategory(prev => ({ ...prev, [r.id]: e.target.value }))}
                          className="rounded-lg border px-2 py-1 text-xs" style={{ background: C.header, borderColor: C.border, color: C.text }}>
                          <option value="">Selecione…</option>
                          {activeCategories.map(c => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>)}
                        </select>
                        <button type="button" disabled={busy} onClick={() => applyOne(r)} className="rounded-lg px-2 py-1 text-xs font-semibold text-white disabled:opacity-60" style={{ background: C.primary }}>Salvar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const PUBLICATION_LABEL: Record<CategoryPendencyRow['publicationStatus'], string> = {
  publicado: 'Publicado', suspenso: 'Suspenso', em_revisao: 'Em revisão', rascunho: 'Rascunho',
}
