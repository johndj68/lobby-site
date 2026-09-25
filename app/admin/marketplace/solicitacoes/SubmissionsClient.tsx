'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, RotateCcw, Clock, Zap, AlertCircle, CheckCircle, XCircle,
  ExternalLink, Grid3x3, AlertTriangle,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import MarketplaceTabs from '@/components/admin/MarketplaceTabs'
import Pagination from '@/components/ui/Pagination'
import { MARKETPLACE_COLORS as C, formatDateTimeBR } from '@/lib/marketplace'

export interface SubmissionRow {
  id: string
  status: string
  submittedAt: string
  appName: string
  shortDescription: string | null
  logoUrl: string | null
  category: string
  developerName: string | null
}

interface Filters { q: string; status: string; sort: string }

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  rows: SubmissionRow[]
  indicators: { pending: number; in_review: number; changes_requested: number; approved: number; rejected: number }
  totalFiltered: number
  page: number
  pageSize: number
  totalPages: number
  loadError: boolean
  filters: Filters
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: 'Aguardando análise', icon: Clock, color: C.warning },
  in_review: { label: 'Em análise', icon: Zap, color: C.primary },
  changes_requested: { label: 'Aguardando ajustes', icon: AlertCircle, color: C.warning },
  approved: { label: 'Aprovado', icon: CheckCircle, color: C.success },
  rejected: { label: 'Rejeitado', icon: XCircle, color: C.error },
}

export default function SubmissionsClient({
  user, profile, rows, indicators, totalFiltered, page, pageSize, totalPages, loadError, filters,
}: Props) {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(filters.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function pushFilters(next: Partial<Filters & { page: number }>) {
    const merged = { ...filters, page: 1, ...next }
    const params = new URLSearchParams()
    if (merged.q) params.set('q', merged.q)
    if (merged.status !== 'todas') params.set('status', merged.status)
    if (merged.sort !== 'enviado_recente') params.set('sort', merged.sort)
    if ('page' in next && next.page && next.page > 1) params.set('page', String(next.page))
    if (!('page' in next) && page > 1 && !isFilterChange(next)) params.set('page', String(page))
    if (pageSize !== 20) params.set('per_page', String(pageSize))
    router.push(`/admin/marketplace/solicitacoes${params.toString() ? `?${params}` : ''}`)
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
    router.push('/admin/marketplace/solicitacoes')
  }

  const hasActiveFilters = filters.status !== 'todas' || !!filters.q

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Solicitações
        </p>

        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Solicitações do marketplace</h1>
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Revise os aplicativos de parceiros e acompanhe cada etapa até a publicação.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" target="_blank" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: C.border, color: C.text }}>
              <ExternalLink size={14} aria-hidden="true" /> Ver marketplace
            </Link>
          </div>
        </div>

        <MarketplaceTabs active="solicitacoes" />

        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            Não foi possível carregar as solicitações agora. Recarregue a página para tentar de novo.
          </div>
        )}

        {/* Indicadores */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <IndicatorCard icon={Clock} label="Aguardando análise" value={indicators.pending} color={C.warning}
            onClick={() => pushFilters({ status: 'pending' })} active={filters.status === 'pending'} />
          <IndicatorCard icon={Zap} label="Em análise" value={indicators.in_review} color={C.primary}
            onClick={() => pushFilters({ status: 'in_review' })} active={filters.status === 'in_review'} />
          <IndicatorCard icon={AlertCircle} label="Aguardando ajustes" value={indicators.changes_requested} color={C.warning}
            onClick={() => pushFilters({ status: 'changes_requested' })} active={filters.status === 'changes_requested'} />
          <IndicatorCard icon={CheckCircle} label="Aprovadas" value={indicators.approved} color={C.success}
            onClick={() => pushFilters({ status: 'approved' })} active={filters.status === 'approved'} />
          <IndicatorCard icon={XCircle} label="Rejeitadas" value={indicators.rejected} color={C.error}
            onClick={() => pushFilters({ status: 'rejected' })} active={filters.status === 'rejected'} />
        </div>
        <p className="mb-4 text-[11px]" style={{ color: C.textSecondary }}>
          Cards mostram o resumo geral das solicitações. A tabela abaixo mostra {totalFiltered} resultado{totalFiltered === 1 ? '' : 's'} filtrado{totalFiltered === 1 ? '' : 's'}.
        </p>

        {/* Busca e filtros */}
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
            <label htmlFor="submissions-search" className="sr-only">Buscar aplicativo ou desenvolvedor</label>
            <input id="submissions-search" value={searchInput} onChange={e => onSearchChange(e.target.value)}
              placeholder="Buscar aplicativo ou desenvolvedor"
              className="w-full rounded-xl border py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2"
              style={{ background: C.card, borderColor: C.border, color: C.text }} />
          </div>
          <Select label="Status" value={filters.status} onChange={v => pushFilters({ status: v })}
            options={[
              ['todas', 'Status: todos'], ['pending', 'Aguardando análise'], ['in_review', 'Em análise'],
              ['changes_requested', 'Aguardando ajustes'], ['approved', 'Aprovadas'], ['rejected', 'Rejeitadas'],
            ]} />
          <Select label="Ordenar" value={filters.sort} onChange={v => pushFilters({ sort: v })}
            options={[['enviado_recente', 'Enviados recentemente'], ['nome', 'Nome do aplicativo']]} />
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: C.border, color: C.text }}>
              <RotateCcw size={12} aria-hidden="true" /> Limpar
            </button>
          )}
        </div>

        {/* Tabela */}
        <section className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          <h2 className="mb-4 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Solicitações de publicação</h2>

          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>
              {hasActiveFilters ? 'Nenhuma solicitação encontrada para esses filtros.' : 'Nenhuma solicitação enviada ainda.'}
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide" style={{ color: C.textSecondary }}>
                      <th className="pb-2 font-medium">Aplicativo</th>
                      <th className="pb-2 font-medium">Desenvolvedor ou parceiro</th>
                      <th className="pb-2 font-medium">Categoria</th>
                      <th className="pb-2 font-medium">Enviado em</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-t" style={{ borderColor: C.border }}>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            <AppLogo url={r.logoUrl} />
                            <div className="min-w-0">
                              <p className="truncate font-medium" style={{ color: C.text }}>{r.appName}</p>
                              <p className="truncate text-xs" style={{ color: C.textSecondary }}>{r.shortDescription || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }}>{r.developerName || '—'}</td>
                        <td className="py-3 pr-3" style={{ color: C.textSecondary }}>{r.category}</td>
                        <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }} title={formatDateTimeBR(r.submittedAt)}>
                          {formatDateTimeBR(r.submittedAt)}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="py-3">
                          <Link href={`/admin/marketplace/solicitacoes/${r.id}`} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white" style={{ background: C.primary }}>
                            Analisar
                          </Link>
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
                      <AppLogo url={r.logoUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" style={{ color: C.text }}>{r.appName}</p>
                        <p className="truncate text-xs" style={{ color: C.textSecondary }}>{r.developerName || '—'}</p>
                      </div>
                    </div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: C.textSecondary }}>
                      <span>{r.category}</span>
                      <span>·</span>
                      <span>{formatDateTimeBR(r.submittedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <StatusBadge status={r.status} />
                      <Link href={`/admin/marketplace/solicitacoes/${r.id}`} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white" style={{ background: C.primary }}>
                        Analisar
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs" style={{ color: C.textSecondary }}>
                  Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalFiltered)} de {totalFiltered} solicitações
                </p>
                <div className="flex items-center gap-3">
                  <Select label="Por página" value={String(pageSize)}
                    onChange={v => {
                      const params = new URLSearchParams(window.location.search)
                      params.set('per_page', v)
                      params.delete('page')
                      router.push(`/admin/marketplace/solicitacoes?${params}`)
                    }}
                    options={[['10', '10 por página'], ['20', '20 por página'], ['50', '50 por página']]} />
                  <Pagination page={page - 1} totalPages={totalPages} variant="dark" onPageChange={p => pushFilters({ page: p + 1 })} />
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </AdminShell>
  )
}

function IndicatorCard({ icon: Icon, label, value, color, onClick, active }: {
  icon: React.ElementType; label: string; value: number; color: string; onClick: () => void; active: boolean
}) {
  return (
    <button onClick={onClick} className="rounded-2xl border p-4 text-left transition-colors"
      style={{ background: C.card, borderColor: active ? color : C.border }}>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${color}1A` }}>
        <Icon size={15} style={{ color }} aria-hidden="true" />
      </div>
      <p className="text-xs font-medium" style={{ color: C.textSecondary }}>{label}</p>
      <p className="my-0.5 text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return <span className="text-xs" style={{ color: C.textSecondary }}>—</span>
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${cfg.color}22`, color: cfg.color }}>
      <Icon size={11} aria-hidden="true" /> {cfg.label}
    </span>
  )
}

/** Logo do app com fallback visual: mesmo ícone genérico usado em Aplicativos
 *  quando não há logo, e também quando a URL existe mas falha ao carregar.
 *  Além do onError (falhas de rede normais), confere `complete`+`naturalWidth`
 *  no mount: uma imagem bloqueada de forma síncrona (ex.: CSP, como o logo de
 *  teste "https://via.placeholder.com/200" fora do img-src permitido) já
 *  chega com erro resolvido antes do React terminar de montar o listener de
 *  onError, então o evento nunca dispara — sem essa checagem o <img> quebrado
 *  fica na tela. Nunca inventa uma imagem no lugar. */
function AppLogo({ url }: { url: string | null }) {
  const [errored, setErrored] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth === 0) setErrored(true)
  }, [url])

  if (!url || errored) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: C.header }}>
        <Grid3x3 size={14} style={{ color: C.textSecondary }} aria-hidden="true" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={imgRef} src={url} alt="" onError={() => setErrored(true)} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
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
