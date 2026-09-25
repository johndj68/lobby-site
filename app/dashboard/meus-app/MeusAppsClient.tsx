'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  LayoutGrid, CheckCircle2, Clock, AlertTriangle, Search,
  ExternalLink, MoreHorizontal, Eye, Pencil, RotateCcw, Plus,
} from 'lucide-react'
import AppLogo from '@/components/admin/AppLogo'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import Pagination from '@/components/ui/Pagination'
import { colors as C } from '@/lib/design-tokens'
import { formatDateTimeBR, type PublicationStatus, type ReviewStatus } from '@/lib/marketplace'

export interface AppRow {
  id: string
  name: string
  shortDescription: string | null
  logoUrl: string | null
  category: string
  updatedAt: string
  createdAt: string
  publication: PublicationStatus
  review: ReviewStatus
  latestSubmissionId: string | null
  latestSubmissionMessage: string | null
  isOwner: boolean
  canEdit: boolean
  ownerName: string | null
  applicationSlug: string | null
}

interface Filters { q: string; analise: string; publicacao: string; emAnalise: boolean; sort: string }

interface Props {
  rows: AppRow[]
  indicators: { total: number; publicados: number; emAnalise: number; ajustesSolicitados: number }
  totalFiltered: number
  page: number
  pageSize: number
  totalPages: number
  loadError: boolean
  filters: Filters
}

const ANALISE_OPTIONS: [string, string][] = [
  ['todas', 'Análise: todas'], ['rascunho', 'Rascunho'], ['aguardando_analise', 'Aguardando análise'],
  ['em_analise', 'Em análise'], ['ajustes_solicitados', 'Ajustes solicitados'],
  ['aprovado', 'Aprovado'], ['rejeitado', 'Rejeitado'],
]
const PUBLICACAO_OPTIONS: [string, string][] = [
  ['todas', 'Publicação: todas'], ['publicado', 'Publicado'], ['nao_publicado', 'Não publicado'], ['suspenso', 'Suspenso'],
]

export default function MeusAppsClient({
  rows, indicators, totalFiltered, page, pageSize, totalPages, loadError, filters,
}: Props) {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(filters.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function pushFilters(next: Partial<Filters & { page: number }>) {
    const merged = { ...filters, page: 1, ...next }
    const params = new URLSearchParams()
    if (merged.q) params.set('q', merged.q)
    if (merged.analise !== 'todas') params.set('analise', merged.analise)
    if (merged.publicacao !== 'todas') params.set('publicacao', merged.publicacao)
    if (merged.emAnalise) params.set('em_analise', '1')
    if (merged.sort !== 'atualizado_recente') params.set('sort', merged.sort)
    if ('page' in next && next.page && next.page > 1) params.set('page', String(next.page))
    if (!('page' in next) && page > 1 && !isFilterChange(next)) params.set('page', String(page))
    if (pageSize !== 20) params.set('per_page', String(pageSize))
    router.push(`/dashboard/meus-app${params.toString() ? `?${params}` : ''}`)
  }
  function isFilterChange(next: Partial<Filters & { page: number }>) {
    return Object.keys(next).some(k => k !== 'page')
  }
  function onSearchChange(v: string) {
    setSearchInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushFilters({ q: v }), 400)
  }
  function clearFilters() {
    setSearchInput('')
    router.push('/dashboard/meus-app')
  }

  const activeFilterCount = [
    filters.analise !== 'todas', filters.publicacao !== 'todas', filters.emAnalise,
  ].filter(Boolean).length
  const hasActiveFilters = activeFilterCount > 0 || !!filters.q

  return (
    <div className="space-y-5">
      <p className="text-xs" style={{ color: C.textSecondary }}>
        <Link href="/dashboard" className="hover:underline">Dashboard</Link> / Meus aplicativos
      </p>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Meus aplicativos</h1>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Cadastre, gerencie e acompanhe seus aplicativos no marketplace.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/" target="_blank" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: C.border, color: C.text, background: C.background }}>
            <ExternalLink size={14} aria-hidden="true" /> Ver marketplace
          </Link>
          <Link href="/dashboard/meus-app/novo" className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: C.primary }}>
            <Plus size={14} aria-hidden="true" /> Novo aplicativo
          </Link>
        </div>
      </div>

      {loadError ? (
        <ErrorState />
      ) : rows.length === 0 && !hasActiveFilters && indicators.total === 0 ? (
        <EmptyFirstApp />
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <IndicatorCard icon={LayoutGrid} label="Total de aplicativos" value={indicators.total} color={C.primary}
              onClick={() => pushFilters({ analise: 'todas', publicacao: 'todas', emAnalise: false })}
              active={filters.analise === 'todas' && filters.publicacao === 'todas' && !filters.emAnalise} />
            <IndicatorCard icon={CheckCircle2} label="Publicados" value={indicators.publicados} color="#16A34A"
              onClick={() => pushFilters({ publicacao: 'publicado' })} active={filters.publicacao === 'publicado'} />
            <IndicatorCard icon={Clock} label="Em análise" value={indicators.emAnalise} color={C.primary}
              onClick={() => pushFilters({ emAnalise: true, analise: 'todas' })} active={filters.emAnalise} />
            <IndicatorCard icon={AlertTriangle} label="Ajustes solicitados" value={indicators.ajustesSolicitados} color="#D97706"
              onClick={() => pushFilters({ analise: 'ajustes_solicitados' })} active={filters.analise === 'ajustes_solicitados'} />
          </div>
          <p className="text-[11px]" style={{ color: C.textSecondary }}>
            Cards mostram o resumo geral do seu contexto. A lista abaixo mostra {totalFiltered} resultado{totalFiltered === 1 ? '' : 's'} filtrado{totalFiltered === 1 ? '' : 's'}.
          </p>

          {/* Aviso de pendências */}
          {indicators.ajustesSolicitados > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: '#FDE68A', background: '#FFFBEB', color: '#92400E' }}>
              <span className="flex items-center gap-2">
                <AlertTriangle size={16} aria-hidden="true" />
                {indicators.ajustesSolicitados === 1
                  ? 'Um aplicativo precisa da sua atenção.'
                  : `${indicators.ajustesSolicitados} aplicativos precisam da sua atenção.`}
              </span>
              <button type="button" onClick={() => pushFilters({ analise: 'ajustes_solicitados' })} className="font-semibold underline">
                Ver ajustes →
              </button>
            </div>
          )}

          {/* Busca e filtros */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
              <label htmlFor="apps-search" className="sr-only">Buscar aplicativo</label>
              <input id="apps-search" value={searchInput} onChange={e => onSearchChange(e.target.value)}
                placeholder="Buscar aplicativo…"
                className="w-full rounded-xl border py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#005BFF]/20"
                style={{ borderColor: C.border, color: C.text, background: C.background }} />
            </div>
            <Select label="Análise" value={filters.analise} onChange={v => pushFilters({ analise: v })} options={ANALISE_OPTIONS} />
            <Select label="Publicação" value={filters.publicacao} onChange={v => pushFilters({ publicacao: v })} options={PUBLICACAO_OPTIONS} />
            <Select label="Ordenar" value={filters.sort} onChange={v => pushFilters({ sort: v })}
              options={[['atualizado_recente', 'Atualizados recentemente'], ['criados_recentemente', 'Criados recentemente'], ['nome', 'Nome de A a Z']]} />
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
                style={{ borderColor: C.border, color: C.text }}>
                <RotateCcw size={12} aria-hidden="true" /> Limpar filtros
              </button>
            )}
          </div>

          {/* Tabela */}
          <section className="rounded-2xl border p-5" style={{ background: C.background, borderColor: C.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
            <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Seus aplicativos</h2>
            <p className="mb-4 text-xs" style={{ color: C.textSecondary }}>{totalFiltered} aplicativo{totalFiltered === 1 ? '' : 's'}</p>

            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>
                {hasActiveFilters ? (
                  <>
                    Nenhum aplicativo encontrado.
                    <br />
                    <button type="button" onClick={clearFilters} className="mt-2 font-semibold underline" style={{ color: C.primary }}>Limpar filtros</button>
                  </>
                ) : 'Nenhum aplicativo cadastrado ainda.'}
              </p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide" style={{ color: C.textSecondary }}>
                        <th className="pb-2 font-medium">Aplicativo</th>
                        <th className="pb-2 font-medium">Categoria</th>
                        <th className="pb-2 font-medium">Análise</th>
                        <th className="pb-2 font-medium">Publicação</th>
                        <th className="pb-2 font-medium">Atualizado em</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} className="border-t" style={{ borderColor: C.borderLight }}>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2.5">
                              <AppLogo url={r.logoUrl} theme="light" />
                              <div className="min-w-0">
                                <p className="truncate font-medium" style={{ color: C.text }}>{r.name}</p>
                                {r.shortDescription && <p className="truncate text-xs" style={{ color: C.textSecondary }}>{r.shortDescription}</p>}
                                {r.ownerName && <p className="truncate text-[11px]" style={{ color: C.textMuted }}>Equipe · {r.ownerName}</p>}
                                {r.review.key === 'nova_versao_em_analise' && (
                                  <p className="text-[11px] font-medium" style={{ color: C.primary }}>Atualização em análise</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-3" style={{ color: C.textSecondary }}>{r.category}</td>
                          <td className="py-3 pr-3"><Badge color={r.review.color} label={r.review.label} /></td>
                          <td className="py-3 pr-3"><Badge color={r.publication.color} label={r.publication.label} /></td>
                          <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }} title={formatDateTimeBR(r.updatedAt)}>
                            {formatDateTimeBR(r.updatedAt)}
                          </td>
                          <td className="py-3">
                            <RowActions row={r} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {rows.map(r => (
                    <div key={r.id} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.backgroundAlt }}>
                      <div className="mb-2 flex items-center gap-2.5">
                        <AppLogo url={r.logoUrl} theme="light" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium" style={{ color: C.text }}>{r.name}</p>
                          <p className="truncate text-xs" style={{ color: C.textSecondary }}>
                            {r.category}{r.ownerName ? ` · Equipe · ${r.ownerName}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <Badge color={r.review.color} label={r.review.label} />
                        <Badge color={r.publication.color} label={r.publication.label} />
                        {r.review.key === 'nova_versao_em_analise' && (
                          <span className="text-[11px] font-medium" style={{ color: C.primary }}>Atualização em análise</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <PrimaryActionLink row={r} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: C.primary }} />
                        <SecondaryMenu row={r} />
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
                        router.push(`/dashboard/meus-app?${params}`)
                      }}
                      options={[['10', '10 por página'], ['20', '20 por página'], ['50', '50 por página']]} />
                    <Pagination page={page - 1} totalPages={totalPages} onPageChange={p => pushFilters({ page: p + 1 })} />
                  </div>
                </div>
              </>
            )}
          </section>

          <p className="text-xs" style={{ color: C.textMuted }}>Seus rascunhos ficam privados até a análise e publicação.</p>
        </>
      )}
    </div>
  )
}

function IndicatorCard({ icon: Icon, label, value, color, onClick, active }: {
  icon: React.ElementType; label: string; value: number; color: string; onClick: () => void; active: boolean
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border p-4 text-left transition-colors"
      style={{ background: C.background, borderColor: active ? color : C.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
        <Icon size={15} style={{ color }} aria-hidden="true" />
      </div>
      <p className="text-xs font-medium" style={{ color: C.textSecondary }}>{label}</p>
      <p className="my-0.5 text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
    </button>
  )
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}18`, color }}>
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
        className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: C.border, color: C.text, background: C.background }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

/** Ação principal por estado — prioriza pendências que exigem ação do
 *  parceiro (suspenso > ajustes > rejeitado > rascunho) antes dos estados
 *  passivos (acompanhar/gerenciar/ver detalhes). */
function primaryAction(row: AppRow): { label: string; href: string } {
  if (row.publication.key === 'suspenso') return { label: 'Ver motivo da suspensão', href: `/dashboard/meus-app/${row.id}` }
  if (row.review.key === 'ajustes_solicitados') return { label: 'Ver ajustes', href: `/dashboard/meus-app/${row.id}` }
  if (row.review.key === 'rejeitado') return { label: 'Ver motivo', href: `/dashboard/meus-app/${row.id}` }
  if (row.review.key === 'rascunho' && row.canEdit) return { label: 'Continuar cadastro', href: `/dashboard/meus-app/novo/${row.id}/editar` }
  if (row.review.key === 'aguardando_analise' || row.review.key === 'em_analise' || row.review.key === 'nova_versao_em_analise') {
    return { label: 'Acompanhar', href: `/dashboard/meus-app/${row.id}` }
  }
  if (row.publication.key === 'publicado') return { label: 'Gerenciar', href: `/dashboard/meus-app/${row.id}` }
  return { label: 'Ver detalhes', href: `/dashboard/meus-app/${row.id}` }
}

function PrimaryActionLink({ row, className, style }: { row: AppRow; className: string; style: React.CSSProperties }) {
  const action = primaryAction(row)
  return <Link href={action.href} className={className} style={style}>{action.label}</Link>
}

function RowActions({ row }: { row: AppRow }) {
  const action = primaryAction(row)
  return (
    <div className="flex items-center gap-2">
      <Link href={action.href} className="rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: C.primary, color: C.primary }}>
        {action.label}
      </Link>
      <SecondaryMenu row={row} />
    </div>
  )
}

/** Menu "..." com as ações que não viraram a ação principal da linha —
 *  usado sozinho no card mobile (a ação principal já aparece como botão
 *  próprio ali, via PrimaryActionLink) e junto do link principal na tabela
 *  desktop, via RowActions. */
function SecondaryMenu({ row }: { row: AppRow }) {
  const action = primaryAction(row)
  const detailsHref = `/dashboard/meus-app/${row.id}`
  const editHref = `/dashboard/meus-app/novo/${row.id}/editar`
  const previewHref = `/dashboard/meus-app/${row.id}/previa?v=submission&submissionId=${row.latestSubmissionId}`
  const showDetailsInMenu = action.href !== detailsHref
  const showEditInMenu = row.canEdit && action.href !== editHref
  const showPreview = !!row.latestSubmissionId
  const showMarketplace = row.publication.key === 'publicado' && !!row.applicationSlug

  if (!showDetailsInMenu && !showEditInMenu && !showPreview && !showMarketplace) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <button aria-label={`Mais ações para ${row.name}`} className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.textSecondary }}>
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      } />
      <DropdownMenuContent align="end" className="border" style={{ background: C.background, borderColor: C.border, color: C.text }}>
        {showDetailsInMenu && (
          <DropdownMenuItem render={<Link href={detailsHref} className="flex items-center gap-2"><Eye size={13} aria-hidden="true" /> Ver detalhes</Link>} />
        )}
        {showEditInMenu && (
          <DropdownMenuItem render={<Link href={editHref} className="flex items-center gap-2"><Pencil size={13} aria-hidden="true" /> Continuar edição</Link>} />
        )}
        {showPreview && (
          <DropdownMenuItem render={<Link href={previewHref} className="flex items-center gap-2"><Eye size={13} aria-hidden="true" /> Abrir prévia privada</Link>} />
        )}
        {showMarketplace && (
          <DropdownMenuItem render={<a href={`/app/${row.applicationSlug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2"><ExternalLink size={13} aria-hidden="true" /> Ver no marketplace</a>} />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border p-10 text-center" style={{ borderColor: C.border, background: C.background }}>
      <AlertTriangle size={28} style={{ color: '#DC2626' }} aria-hidden="true" />
      <p className="font-semibold" style={{ color: C.text }}>Não foi possível carregar seus aplicativos.</p>
      <button type="button" onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
        <RotateCcw size={14} aria-hidden="true" /> Tentar novamente
      </button>
    </div>
  )
}

function EmptyFirstApp() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: C.border, background: C.background }}>
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `${C.primary}12` }}>
        <LayoutGrid size={26} style={{ color: C.primary }} aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Seu primeiro aplicativo começa aqui</h2>
      <p className="max-w-sm text-sm" style={{ color: C.textSecondary }}>
        Cadastre seu produto, prepare sua oferta e acompanhe a análise da equipe LOBBY.
      </p>
      <Link href="/dashboard/meus-app/novo" className="mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ background: C.primary }}>
        <Plus size={14} aria-hidden="true" /> Cadastrar meu primeiro app
      </Link>
      <p className="mt-2 text-xs" style={{ color: C.textMuted }}>Nada será publicado automaticamente.</p>
    </div>
  )
}
