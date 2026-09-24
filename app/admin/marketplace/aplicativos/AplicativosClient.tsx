'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Grid3x3, CheckCircle2, MinusCircle, Ban, Search, SlidersHorizontal,
  ChevronRight, MoreHorizontal, Rocket, Copy, ExternalLink, Eye,
  PauseCircle, PlayCircle, AlertTriangle, Info, X,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import Pagination from '@/components/ui/Pagination'
import { MARKETPLACE_COLORS as C, formatDateTimeBR, type PublicationStatus, type ReviewStatus } from '@/lib/marketplace'

export interface CatalogRow {
  id: string
  name: string
  shortDescription: string | null
  logoUrl: string | null
  category: string
  updatedAt: string
  createdAt: string
  origin: 'lobby' | 'partner'
  partnerName: string
  partnerId: string
  publication: PublicationStatus
  review: ReviewStatus
  offerSummary: string
  slug: string | null
  applicationId: string | null
  canPublish: boolean
}

interface Filters {
  q: string; publicacao: string; origem: string; categoria: string; revisao: string
  parceiro: string; atualizado: string; nova_versao: boolean; sort: string
}

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  rows: CatalogRow[]
  indicators: { total: number; publicados: number; naoPublicados: number; suspensos: number }
  alerts: { aprovadosAguardando: number; novaVersaoEmAnalise: number }
  categoryOptions: string[]
  partnerOptions: { id: string; name: string }[]
  totalFiltered: number
  page: number
  pageSize: number
  totalPages: number
  loadError: boolean
  filters: Filters
}

const NAV_TABS = [
  { label: 'Visão geral', href: '/admin/marketplace', enabled: true },
  { label: 'Aplicativos', href: '/admin/marketplace/aplicativos', enabled: true },
  { label: 'Solicitações', href: '/admin/marketplace/solicitacoes', enabled: true },
  { label: 'Ofertas', href: '/admin/marketplace/ofertas', enabled: true },
  { label: 'Destaques', href: '/admin/marketplace/destaques', enabled: false },
  { label: 'Categorias', href: '/admin/marketplace/categorias', enabled: false },
  { label: 'Parceiros', href: '/admin/marketplace/parceiros', enabled: true },
]

const REVIEW_OPTIONS: { value: string; label: string }[] = [
  { value: 'todas', label: 'Revisão: todas' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'aguardando_analise', label: 'Aguardando análise' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'ajustes_solicitados', label: 'Ajustes solicitados' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
  { value: 'nova_versao_em_analise', label: 'Nova versão em análise' },
]

export default function AplicativosClient({
  user, profile, rows, indicators, alerts, categoryOptions, partnerOptions,
  totalFiltered, page, pageSize, totalPages, loadError, filters,
}: Props) {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(filters.q)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [publishTarget, setPublishTarget] = useState<CatalogRow | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<CatalogRow | null>(null)
  const [reactivateTarget, setReactivateTarget] = useState<CatalogRow | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [busy, setBusy] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function pushFilters(next: Partial<Filters & { page: number }>) {
    const merged = { ...filters, page: 1, ...next }
    const params = new URLSearchParams()
    if (merged.q) params.set('q', merged.q)
    if (merged.publicacao !== 'todas') params.set('publicacao', merged.publicacao)
    if (merged.origem !== 'todas') params.set('origem', merged.origem)
    if (merged.categoria !== 'todas') params.set('categoria', merged.categoria)
    if (merged.revisao !== 'todas') params.set('revisao', merged.revisao)
    if (merged.parceiro !== 'todos') params.set('parceiro', merged.parceiro)
    if (merged.atualizado !== 'todos') params.set('atualizado', merged.atualizado)
    if (merged.nova_versao) params.set('nova_versao', '1')
    if (merged.sort !== 'atualizado_recente') params.set('sort', merged.sort)
    if ('page' in next && next.page && next.page > 1) params.set('page', String(next.page))
    if (!('page' in next) && page > 1 && !isFilterChange(next)) params.set('page', String(page))
    if (pageSize !== 20) params.set('per_page', String(pageSize))
    router.push(`/admin/marketplace/aplicativos${params.toString() ? `?${params}` : ''}`)
  }
  function isFilterChange(next: Partial<Filters & { page: number }>) {
    return Object.keys(next).some(k => k !== 'page')
  }

  function onSearchChange(v: string) {
    setSearchInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushFilters({ q: v }), 400)
  }

  const activeFilterCount = [
    filters.publicacao !== 'todas', filters.origem !== 'todas', filters.categoria !== 'todas',
    filters.revisao !== 'todas', filters.parceiro !== 'todos', filters.atualizado !== 'todos', filters.nova_versao,
  ].filter(Boolean).length

  function clearFilters() {
    setSearchInput('')
    router.push('/admin/marketplace/aplicativos')
  }

  async function runAction(url: string, body: Record<string, unknown> | undefined, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return false }
      toast.success(successMsg)
      router.refresh()
      return true
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Aplicativos
        </p>

        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Aplicativos</h1>
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Gerencie o catálogo da LOBBY e dos seus parceiros.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" target="_blank" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: C.border, color: C.text }}>
              <ExternalLink size={14} aria-hidden="true" /> Ver marketplace
            </Link>
            <button type="button" disabled title="Cadastro de aplicativo em nome de parceiro exige um modelo de organização que o projeto ainda não tem — evitar atribuir automaticamente à conta do administrador."
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white opacity-50 cursor-not-allowed" style={{ background: C.primary }}>
              + Novo aplicativo
            </button>
          </div>
        </div>

        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => {
            const active = tab.href === '/admin/marketplace/aplicativos'
            if (!tab.enabled) {
              return <span key={tab.href} title="Esta área ainda não foi implementada." aria-disabled="true"
                className="cursor-not-allowed px-3 py-2.5 text-sm font-medium opacity-40" style={{ color: C.textSecondary }}>{tab.label}</span>
            }
            return (
              <Link key={tab.href} href={tab.href} className="px-3 py-2.5 text-sm font-medium"
                style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>
                {tab.label}
              </Link>
            )
          })}
        </nav>

        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            Não foi possível carregar o catálogo agora. Recarregue a página para tentar de novo.
          </div>
        )}

        {/* Indicadores */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <IndicatorCard icon={Grid3x3} label="Total de aplicativos" value={indicators.total} onClick={() => pushFilters({ publicacao: 'todas' })} active={filters.publicacao === 'todas'} />
          <IndicatorCard icon={CheckCircle2} label="Publicados" value={indicators.publicados} color={C.success} onClick={() => pushFilters({ publicacao: 'publicado' })} active={filters.publicacao === 'publicado'} />
          <IndicatorCard icon={MinusCircle} label="Não publicados" value={indicators.naoPublicados} color={C.textSecondary} onClick={() => pushFilters({ publicacao: 'nao_publicado' })} active={filters.publicacao === 'nao_publicado'} />
          <IndicatorCard icon={Ban} label="Suspensos" value={indicators.suspensos} color={C.error} onClick={() => pushFilters({ publicacao: 'suspenso' })} active={filters.publicacao === 'suspenso'} />
        </div>
        <p className="mb-4 text-[11px]" style={{ color: C.textSecondary }}>
          Cards mostram o resumo geral do catálogo. A tabela abaixo mostra {totalFiltered} resultado{totalFiltered === 1 ? '' : 's'} filtrado{totalFiltered === 1 ? '' : 's'}.
        </p>

        {/* Busca e filtros */}
        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
            <label htmlFor="apps-search" className="sr-only">Buscar por nome, parceiro ou ID</label>
            <input id="apps-search" value={searchInput} onChange={e => onSearchChange(e.target.value)}
              placeholder="Buscar por nome, parceiro ou ID"
              className="w-full rounded-xl border py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2"
              style={{ background: C.card, borderColor: C.border, color: C.text }} />
          </div>
          <Select label="Publicação" value={filters.publicacao} onChange={v => pushFilters({ publicacao: v })}
            options={[['todas', 'Publicação: todas'], ['publicado', 'Publicado'], ['nao_publicado', 'Não publicado'], ['suspenso', 'Suspenso']]} />
          <Select label="Origem" value={filters.origem} onChange={v => pushFilters({ origem: v })}
            options={[['todas', 'Origem: todas'], ['lobby', 'LOBBY · Produto próprio'], ['partner', 'Parceiro']]} />
          <Select label="Categoria" value={filters.categoria} onChange={v => pushFilters({ categoria: v })}
            options={[['todas', 'Categoria: todas'], ...categoryOptions.map(c => [c, c] as [string, string])]} />
          <button type="button" onClick={() => setShowMoreFilters(s => !s)}
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium"
            style={{ borderColor: C.border, color: C.text, background: showMoreFilters ? C.header : 'transparent' }}>
            <SlidersHorizontal size={14} aria-hidden="true" /> Mais filtros
            {activeFilterCount > 0 && (
              <span className="rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: C.primary }}>{activeFilterCount}</span>
            )}
          </button>
          <Select label="Ordenar" value={filters.sort} onChange={v => pushFilters({ sort: v })}
            options={[['atualizado_recente', 'Atualizados recentemente'], ['nome', 'Nome'], ['data_cadastro', 'Data de cadastro']]} />
          {(activeFilterCount > 0 || filters.q) && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.primary }}>
              <X size={12} aria-hidden="true" /> Limpar filtros
            </button>
          )}
        </div>

        {showMoreFilters && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: C.border, background: C.card }}>
            <Select label="Estado da revisão" value={filters.revisao} onChange={v => pushFilters({ revisao: v })} options={REVIEW_OPTIONS.map(o => [o.value, o.label] as [string, string])} />
            <Select label="Parceiro" value={filters.parceiro} onChange={v => pushFilters({ parceiro: v })}
              options={[['todos', 'Parceiro: todos'], ...partnerOptions.map(p => [p.id, p.name] as [string, string])]} />
            <Select label="Atualizado" value={filters.atualizado} onChange={v => pushFilters({ atualizado: v })}
              options={[['todos', 'Atualizado: qualquer período'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['90d', 'Últimos 90 dias']]} />
            <label className="flex items-center gap-2 text-sm" style={{ color: C.text }}>
              <input type="checkbox" checked={filters.nova_versao} onChange={e => pushFilters({ nova_versao: e.target.checked })} />
              Publicados com nova versão em análise
            </label>
          </div>
        )}

        {/* Tabela */}
        <section className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          <h2 className="mb-4 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Catálogo de aplicativos</h2>

          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>
              {filters.q || activeFilterCount > 0 ? 'Nenhum aplicativo encontrado para esses filtros.' : 'Nenhum aplicativo cadastrado ainda.'}
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide" style={{ color: C.textSecondary }}>
                      <th className="pb-2 font-medium">Aplicativo</th>
                      <th className="pb-2 font-medium">Origem / parceiro</th>
                      <th className="pb-2 font-medium">Categoria</th>
                      <th className="pb-2 font-medium">Publicação</th>
                      <th className="pb-2 font-medium">Revisão</th>
                      <th className="pb-2 font-medium">Atualizado em</th>
                      <th className="pb-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-t" style={{ borderColor: C.border }}>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            {r.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: C.header }}>
                                <Grid3x3 size={14} style={{ color: C.textSecondary }} aria-hidden="true" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium" style={{ color: C.text }}>{r.name}</p>
                              <p className="truncate text-xs" style={{ color: C.textSecondary }}>{r.shortDescription || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }}>
                          {r.origin === 'lobby' ? 'LOBBY · Produto próprio' : `Parceiro · ${r.partnerName}`}
                        </td>
                        <td className="py-3 pr-3" style={{ color: C.textSecondary }}>{r.category}</td>
                        <td className="py-3 pr-3">
                          <Badge color={r.publication.color} label={r.publication.label} />
                        </td>
                        <td className="py-3 pr-3">
                          <Badge color={r.review.color} label={r.review.label} />
                        </td>
                        <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }} title={formatDateTimeBR(r.updatedAt)}>
                          {formatDateTimeBR(r.updatedAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/marketplace/aplicativos/${r.id}`} className="rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: C.primary, color: C.primary }}>
                              Gerenciar
                            </Link>
                            {r.canPublish && (
                              <button onClick={() => setPublishTarget(r)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-white" style={{ background: C.primary }}>
                                <Rocket size={11} aria-hidden="true" /> Publicar
                              </button>
                            )}
                            <RowMenu row={r} onSuspend={() => { setSuspendReason(''); setSuspendTarget(r) }} onReactivate={() => setReactivateTarget(r)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {rows.map(r => (
                  <div key={r.id} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.header }}>
                    <div className="mb-2 flex items-center gap-2.5">
                      {r.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: C.card }}>
                          <Grid3x3 size={14} style={{ color: C.textSecondary }} aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" style={{ color: C.text }}>{r.name}</p>
                        <p className="truncate text-xs" style={{ color: C.textSecondary }}>{r.origin === 'lobby' ? 'LOBBY' : r.partnerName}</p>
                      </div>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <Badge color={r.publication.color} label={r.publication.label} />
                      <Badge color={r.review.color} label={r.review.label} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Link href={`/admin/marketplace/aplicativos/${r.id}`} className="rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: C.primary, color: C.primary }}>
                        Gerenciar
                      </Link>
                      <div className="flex items-center gap-2">
                        {r.canPublish && (
                          <button onClick={() => setPublishTarget(r)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-white" style={{ background: C.primary }}>
                            <Rocket size={11} aria-hidden="true" /> Publicar
                          </button>
                        )}
                        <RowMenu row={r} onSuspend={() => { setSuspendReason(''); setSuspendTarget(r) }} onReactivate={() => setReactivateTarget(r)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs" style={{ color: C.textSecondary }}>
                  Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalFiltered)} de {totalFiltered} aplicativos
                </p>
                <div className="flex items-center gap-3">
                  <Select label="Por página" value={String(pageSize)}
                    onChange={v => {
                      const params = new URLSearchParams(window.location.search)
                      params.set('per_page', v)
                      params.delete('page')
                      router.push(`/admin/marketplace/aplicativos?${params}`)
                    }}
                    options={[['10', '10 por página'], ['20', '20 por página'], ['50', '50 por página']]} />
                  <Pagination page={page - 1} totalPages={totalPages} variant="dark" onPageChange={p => pushFilters({ page: p + 1 })} />
                </div>
              </div>
            </>
          )}
        </section>

        {/* Alertas */}
        {(alerts.aprovadosAguardando > 0 || alerts.novaVersaoEmAnalise > 0) && (
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {alerts.aprovadosAguardando > 0 && (
              <AlertCard icon={CheckCircle2} color={C.success}
                text={`${alerts.aprovadosAguardando} app${alerts.aprovadosAguardando > 1 ? 's' : ''} aprovado${alerts.aprovadosAguardando > 1 ? 's' : ''} aguardando publicação`}
                href="/admin/marketplace/aplicativos?publicacao=nao_publicado&revisao=aprovado" cta="Ver aplicativos" />
            )}
            {alerts.novaVersaoEmAnalise > 0 && (
              <AlertCard icon={Info} color={C.primary}
                text={`${alerts.novaVersaoEmAnalise} app${alerts.novaVersaoEmAnalise > 1 ? 's' : ''} publicado${alerts.novaVersaoEmAnalise > 1 ? 's' : ''} com nova versão em análise`}
                href="/admin/marketplace/aplicativos?nova_versao=1" cta="Ver solicitações" />
            )}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
          <Info size={14} className="mt-0.5 shrink-0" style={{ color: C.primary }} aria-hidden="true" />
          Publicação e revisão são independentes. Uma nova versão em análise não altera a versão que já está no marketplace.
        </div>
      </div>

      <ConfirmDialog
        open={publishTarget !== null}
        onOpenChange={next => !next && setPublishTarget(null)}
        icon={Rocket}
        variant="neutral"
        title="Publicar aplicativo?"
        description={<><strong style={{ color: C.text }}>{publishTarget?.name}</strong> passa a aparecer como publicado. A versão aprovada mais recente é a que fica valendo — pedidos e direitos de compradores anteriores não são afetados.</>}
        confirmLabel="Publicar" confirmingLabel="Publicando…" busy={busy}
        onConfirm={async () => { if (!publishTarget) return; const ok = await runAction(`/api/admin/apps/${publishTarget.id}/publish`, undefined, `${publishTarget.name} publicado.`); if (ok) setPublishTarget(null) }}
      />

      <ConfirmDialog
        open={suspendTarget !== null}
        onOpenChange={next => !next && setSuspendTarget(null)}
        icon={PauseCircle}
        variant="destructive"
        title="Suspender publicação?"
        description={
          <div className="space-y-3">
            <p><strong style={{ color: C.text }}>{suspendTarget?.name}</strong> sai da vitrine pública imediatamente. Pedidos, licenças e direitos de compradores anteriores não são afetados — nenhuma assinatura é cancelada nem reembolso é feito por essa ação.</p>
            <label className="block text-xs font-medium" style={{ color: C.text }}>
              Motivo da suspensão
              <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} rows={2}
                className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm text-white outline-none"
                style={{ borderColor: C.border }} placeholder="Explique por que este aplicativo está sendo suspenso" />
            </label>
          </div>
        }
        confirmLabel="Suspender" confirmingLabel="Suspendendo…" busy={busy}
        onConfirm={async () => {
          if (!suspendTarget || !suspendReason.trim()) { toast.error('Informe o motivo da suspensão.'); return }
          const ok = await runAction(`/api/admin/apps/${suspendTarget.id}/suspend`, { reason: suspendReason }, `${suspendTarget.name} suspenso.`)
          if (ok) setSuspendTarget(null)
        }}
      />

      <ConfirmDialog
        open={reactivateTarget !== null}
        onOpenChange={next => !next && setReactivateTarget(null)}
        icon={PlayCircle}
        variant="neutral"
        title="Reativar publicação?"
        description={<>As condições de publicação de <strong style={{ color: C.text }}>{reactivateTarget?.name}</strong> serão revalidadas (versão aprovada, oferta e ativação configuradas, sem bloqueios) antes de voltar ao ar. Campanhas patrocinadas não são reativadas nem recobradas automaticamente.</>}
        confirmLabel="Reativar" confirmingLabel="Reativando…" busy={busy}
        onConfirm={async () => { if (!reactivateTarget) return; const ok = await runAction(`/api/admin/apps/${reactivateTarget.id}/reactivate`, undefined, `${reactivateTarget.name} reativado.`); if (ok) setReactivateTarget(null) }}
      />
    </AdminShell>
  )
}

function IndicatorCard({ icon: Icon, label, value, color, onClick, active }: {
  icon: React.ElementType; label: string; value: number; color?: string; onClick: () => void; active: boolean
}) {
  return (
    <button onClick={onClick} className="rounded-2xl border p-4 text-left transition-colors"
      style={{ background: C.card, borderColor: active ? C.primary : C.border }}>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${color ?? C.primary}1A` }}>
        <Icon size={15} style={{ color: color ?? C.primary }} aria-hidden="true" />
      </div>
      <p className="text-xs font-medium" style={{ color: C.textSecondary }}>{label}</p>
      <p className="my-0.5 text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
    </button>
  )
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}22`, color }}>
      {label}
    </span>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <div>
      <label className="sr-only">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

function AlertCard({ icon: Icon, color, text, href, cta }: { icon: React.ElementType; color: string; text: string; href: string; cta: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border p-4" style={{ background: C.card, borderColor: C.border }}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}22` }}>
          <Icon size={15} style={{ color }} aria-hidden="true" />
        </div>
        <p className="text-sm" style={{ color: C.text }}>{text}</p>
      </div>
      <Link href={href} className="shrink-0 text-xs font-semibold" style={{ color: C.primary }}>{cta} →</Link>
    </div>
  )
}

function RowMenu({ row, onSuspend, onReactivate }: { row: CatalogRow; onSuspend: () => void; onReactivate: () => void }) {
  const publicHref = row.slug && row.publication.key === 'publicado' ? `/app/${row.slug}` : null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <button aria-label={`Mais ações para ${row.name}`} className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.textSecondary }}>
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      } />
      <DropdownMenuContent align="end" className="border" style={{ background: C.card, borderColor: C.border, color: C.text }}>
        {publicHref ? (
          <DropdownMenuItem render={<Link href={publicHref} target="_blank" className="flex items-center gap-2"><Eye size={13} aria-hidden="true" /> Ver página pública</Link>} />
        ) : (
          <DropdownMenuItem disabled title="Só existe depois de publicado"><Eye size={13} aria-hidden="true" /> Ver página pública</DropdownMenuItem>
        )}
        <DropdownMenuItem disabled title="O editor do parceiro só é acessível pela conta do próprio parceiro hoje">
          <ExternalLink size={13} aria-hidden="true" /> Editar rascunho
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/admin/marketplace/solicitacoes" className="flex items-center gap-2"><ChevronRight size={13} aria-hidden="true" /> Ver solicitações</Link>} />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(row.id); toast.success('ID copiado.') }}>
          <Copy size={13} aria-hidden="true" /> Copiar ID
        </DropdownMenuItem>
        {row.publication.key === 'publicado' && (
          <DropdownMenuItem onClick={onSuspend} className="text-red-400"><PauseCircle size={13} aria-hidden="true" /> Suspender publicação</DropdownMenuItem>
        )}
        {row.publication.key === 'suspenso' && (
          <DropdownMenuItem onClick={onReactivate}><PlayCircle size={13} aria-hidden="true" /> Reativar publicação</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
