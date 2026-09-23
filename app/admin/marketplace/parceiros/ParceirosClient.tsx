'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Users, CheckCircle2, Clock, Ban, Search, ChevronRight, AlertTriangle, Info, X,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import Pagination from '@/components/ui/Pagination'
import { MARKETPLACE_COLORS as C } from '@/lib/marketplace'
import type { RegistrationStatus, TermsStatus } from '@/lib/partners'

export interface PartnerRow {
  id: string; name: string; email: string | null; createdAt: string; lastActivity: string
  appsTotal: number; appsPublished: number; appsInAnalysis: number
  registration: RegistrationStatus; terms: TermsStatus
  blocked: boolean; blockedReason: string | null; pendencies: string[]
}

interface Filters { q: string; situacao: string; bloqueado: string; termos: string; publicados: string; cadastro: string; sort: string }

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  rows: PartnerRow[]
  indicators: { total: number; ativos: number; pendentes: number; bloqueados: number }
  alerts: { termosPendentes: number; semRecebimento: number }
  totalFiltered: number; page: number; pageSize: number; totalPages: number
  loadError: boolean
  filters: Filters
}

const NAV_TABS = [
  { label: 'Visão geral', href: '/admin/marketplace', enabled: true },
  { label: 'Aplicativos', href: '/admin/marketplace/aplicativos', enabled: true },
  { label: 'Solicitações', href: '/admin/marketplace/solicitacoes', enabled: true },
  { label: 'Ofertas', href: '/admin/marketplace/ofertas', enabled: false },
  { label: 'Destaques', href: '/admin/marketplace/destaques', enabled: false },
  { label: 'Categorias', href: '/admin/marketplace/categorias', enabled: false },
  { label: 'Parceiros', href: '/admin/marketplace/parceiros', enabled: true },
]

export default function ParceirosClient({ user, profile, rows, indicators, alerts, totalFiltered, page, pageSize, totalPages, loadError, filters }: Props) {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(filters.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function pushFilters(next: Partial<Filters & { page: number }>) {
    const merged = { ...filters, page: 1, ...next }
    const params = new URLSearchParams()
    if (merged.q) params.set('q', merged.q)
    if (merged.situacao !== 'todas') params.set('situacao', merged.situacao)
    if (merged.bloqueado !== 'todos') params.set('bloqueado', merged.bloqueado)
    if (merged.termos !== 'todos') params.set('termos', merged.termos)
    if (merged.publicados !== 'todos') params.set('publicados', merged.publicados)
    if (merged.cadastro !== 'todos') params.set('cadastro', merged.cadastro)
    if (merged.sort !== 'atualizado_recente') params.set('sort', merged.sort)
    if ('page' in next && next.page && next.page > 1) params.set('page', String(next.page))
    router.push(`/admin/marketplace/parceiros${params.toString() ? `?${params}` : ''}`)
  }

  function onSearchChange(v: string) {
    setSearchInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushFilters({ q: v }), 400)
  }

  const activeFilterCount = [filters.situacao !== 'todas', filters.bloqueado !== 'todos', filters.termos !== 'todos', filters.publicados !== 'todos', filters.cadastro !== 'todos'].filter(Boolean).length

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Parceiros
        </p>

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Parceiros</h1>
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Gerencie organizações, aplicativos e condições comerciais.</p>
          </div>
          <button type="button" disabled
            title='Parceiros hoje se cadastram criando conta e enviando um aplicativo (/dashboard/meus-app) — não existe fluxo administrativo de convite de organização, e o projeto não tem um modelo de "organização" separado do usuário.'
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white opacity-50 cursor-not-allowed" style={{ background: C.primary }}>
            + Cadastrar parceiro
          </button>
        </div>

        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => {
            const active = tab.href === '/admin/marketplace/parceiros'
            if (!tab.enabled) return <span key={tab.href} title="Esta área ainda não foi implementada." className="cursor-not-allowed px-3 py-2.5 text-sm font-medium opacity-40" style={{ color: C.textSecondary }}>{tab.label}</span>
            return <Link key={tab.href} href={tab.href} className="px-3 py-2.5 text-sm font-medium" style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>{tab.label}</Link>
          })}
        </nav>

        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            Não foi possível carregar os parceiros agora. Recarregue a página para tentar de novo.
          </div>
        )}

        <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <IndicatorCard icon={Users} label="Total de parceiros" value={indicators.total} onClick={() => pushFilters({ situacao: 'todas', bloqueado: 'todos' })} />
          <IndicatorCard icon={CheckCircle2} label="Ativos" value={indicators.ativos} color={C.success} onClick={() => pushFilters({ situacao: 'ativo' })} active={filters.situacao === 'ativo'} />
          <IndicatorCard icon={Clock} label="Cadastro pendente" value={indicators.pendentes} color={C.warning} onClick={() => pushFilters({ situacao: 'pendente' })} active={filters.situacao === 'pendente'} />
          <IndicatorCard icon={Ban} label="Novos cadastros bloqueados" value={indicators.bloqueados} color={C.error} onClick={() => pushFilters({ bloqueado: '1' })} active={filters.bloqueado === '1'} />
        </div>
        <p className="mb-4 flex items-start gap-1.5 text-[11px]" style={{ color: C.textSecondary }}>
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          Cadastro, bloqueio e termos são dimensões independentes — um parceiro ativo pode estar com novos cadastros bloqueados, então os cards não somam o total. A tabela mostra {totalFiltered} resultado{totalFiltered === 1 ? '' : 's'} filtrado{totalFiltered === 1 ? '' : 's'}.
        </p>

        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
            <label htmlFor="partner-search" className="sr-only">Buscar organização, responsável ou ID</label>
            <input id="partner-search" value={searchInput} onChange={e => onSearchChange(e.target.value)}
              placeholder="Buscar organização, responsável ou ID"
              className="w-full rounded-xl border py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2"
              style={{ background: C.card, borderColor: C.border, color: C.text }} />
          </div>
          <Select value={filters.situacao} onChange={v => pushFilters({ situacao: v })} options={[['todas', 'Situação: todas'], ['ativo', 'Ativo'], ['pendente', 'Cadastro pendente']]} />
          <Select value={filters.termos} onChange={v => pushFilters({ termos: v })} options={[['todos', 'Termos: todos'], ['aceitos', 'Aceitos'], ['pendentes', 'Pendentes']]} />
          <Select value={filters.publicados} onChange={v => pushFilters({ publicados: v })} options={[['todos', 'Publicados: todos'], ['1', 'Com app publicado'], ['0', 'Sem app publicado']]} />
          <Select value={filters.cadastro} onChange={v => pushFilters({ cadastro: v })} options={[['todos', 'Cadastro: qualquer período'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['90d', 'Últimos 90 dias']]} />
          <Select value={filters.sort} onChange={v => pushFilters({ sort: v })} options={[['atualizado_recente', 'Atualizados recentemente'], ['nome', 'Nome'], ['data_cadastro', 'Data de cadastro'], ['apps_publicados', 'Apps publicados']]} />
          {(activeFilterCount > 0 || filters.q) && (
            <button type="button" onClick={() => { setSearchInput(''); router.push('/admin/marketplace/parceiros') }} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.primary }}>
              <X size={12} aria-hidden="true" /> Limpar filtros
            </button>
          )}
        </div>

        <section className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>
              {filters.q || activeFilterCount > 0 ? 'Nenhum parceiro encontrado para esses filtros.' : 'Nenhum parceiro cadastrado ainda.'}
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide" style={{ color: C.textSecondary }}>
                      <th className="pb-2 font-medium">Parceiro</th>
                      <th className="pb-2 font-medium">Responsável</th>
                      <th className="pb-2 font-medium">Apps publicados</th>
                      <th className="pb-2 font-medium">Situação</th>
                      <th className="pb-2 font-medium">Pendências</th>
                      <th className="pb-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-t" style={{ borderColor: C.border }}>
                        <td className="py-3 pr-3">
                          <p className="font-medium" style={{ color: C.text }}>{r.name}</p>
                          <p className="text-xs" style={{ color: C.textSecondary }}>{r.id.slice(0, 8)}…</p>
                        </td>
                        <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }}>{r.name}{r.email ? ` · ${r.email}` : ''}</td>
                        <td className="py-3 pr-3" style={{ color: C.text }}>{r.appsPublished}</td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-1">
                            <Badge color={r.registration.color} label={r.registration.label} />
                            {r.blocked && <Badge color={C.error} label="Novos cadastros bloqueados" />}
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          {r.pendencies.length === 0 ? <span style={{ color: C.textSecondary }}>Sem pendências</span> : (
                            <span style={{ color: C.warning }}>{r.pendencies[0]}{r.pendencies.length > 1 ? ` +${r.pendencies.length - 1}` : ''}</span>
                          )}
                        </td>
                        <td className="py-3">
                          <Link href={`/admin/marketplace/parceiros/${r.id}`} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: C.primary, color: C.primary }}>
                            Gerenciar <ChevronRight size={12} aria-hidden="true" />
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
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="font-medium" style={{ color: C.text }}>{r.name}</p>
                        <p className="text-xs" style={{ color: C.textSecondary }}>{r.appsPublished} publicado{r.appsPublished === 1 ? '' : 's'}</p>
                      </div>
                      <Badge color={r.registration.color} label={r.registration.label} />
                    </div>
                    {r.blocked && <div className="mb-2"><Badge color={C.error} label="Bloqueado" /></div>}
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: C.textSecondary }}>{r.pendencies.length === 0 ? 'Sem pendências' : r.pendencies.join(', ')}</span>
                      <Link href={`/admin/marketplace/parceiros/${r.id}`} className="text-xs font-semibold" style={{ color: C.primary }}>Gerenciar →</Link>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs" style={{ color: C.textSecondary }}>Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalFiltered)} de {totalFiltered} parceiros</p>
                <Pagination page={page - 1} totalPages={totalPages} variant="dark" onPageChange={p => pushFilters({ page: p + 1 })} />
              </div>
            </>
          )}
        </section>

        {alerts.termosPendentes > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border p-4" style={{ background: C.card, borderColor: C.border }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${C.warning}22` }}>
                <AlertTriangle size={15} style={{ color: C.warning }} aria-hidden="true" />
              </div>
              <p className="text-sm" style={{ color: C.text }}>{alerts.termosPendentes} parceiro{alerts.termosPendentes > 1 ? 's' : ''} com termos pendentes</p>
            </div>
            <Link href="/admin/marketplace/parceiros?termos=pendentes" className="shrink-0 text-xs font-semibold" style={{ color: C.primary }}>Ver parceiros →</Link>
          </div>
        )}
      </div>
    </AdminShell>
  )
}

function IndicatorCard({ icon: Icon, label, value, color, onClick, active }: { icon: React.ElementType; label: string; value: number; color?: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className="rounded-2xl border p-4 text-left transition-colors" style={{ background: C.card, borderColor: active ? C.primary : C.border }}>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${color ?? C.primary}1A` }}>
        <Icon size={15} style={{ color: color ?? C.primary }} aria-hidden="true" />
      </div>
      <p className="text-xs font-medium" style={{ color: C.textSecondary }}>{label}</p>
      <p className="my-0.5 text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
    </button>
  )
}
function Badge({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}22`, color }}>{label}</span>
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <select value={value} onChange={e => onChange(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
}
