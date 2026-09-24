'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Tag, CheckCircle2, Sparkles, CalendarClock, Search, AlertTriangle, Info, X,
  Grid3x3, ExternalLink, PauseCircle, PlayCircle, Archive, PlusCircle, Download, RefreshCw, Loader2,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import Pagination from '@/components/ui/Pagination'
import { MARKETPLACE_COLORS as C, formatDateTimeBR, ORIGIN_LABEL } from '@/lib/marketplace'
import { formatOfferPrice, type OfferRow } from '@/lib/services/offers'

interface Filters {
  q: string; app: string; partner: string; origem: string; revisao: string; disponibilidade: string
  cobranca: string; moeda: string; promocao: string; periodo: string; sort: string
}

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  rows: OfferRow[]
  indicators: { cadastradas: number; disponiveis: number; promocoesAtivas: number; promocoesProgramadas: number }
  totalFiltered: number; page: number; pageSize: number; totalPages: number
  loadError: boolean
  appOptions: [string, string][]
  partnerOptions: [string, string][]
  currencyOptions: string[]
  filters: Filters
}

const NAV_TABS = [
  { label: 'Visão geral', href: '/admin/marketplace', enabled: true },
  { label: 'Aplicativos', href: '/admin/marketplace/aplicativos', enabled: true },
  { label: 'Solicitações', href: '/admin/marketplace/solicitacoes', enabled: true },
  { label: 'Ofertas', href: '/admin/marketplace/ofertas', enabled: true },
  { label: 'Destaques', href: '/admin/marketplace/destaques', enabled: true },
  { label: 'Categorias', href: '/admin/marketplace/categorias', enabled: false },
  { label: 'Parceiros', href: '/admin/marketplace/parceiros', enabled: true },
]

const BILLING_OPTIONS: [string, string][] = [['todas', 'Cobrança: todas'], ['one-time', 'Pagamento único'], ['monthly', 'Assinatura mensal'], ['yearly', 'Assinatura anual'], ['lifetime', 'Vitalício']]
const REVIEW_OPTIONS: [string, string][] = [['todas', 'Revisão: todas'], ['rascunho', 'Rascunho'], ['aguardando_analise', 'Aguardando análise'], ['ajustes_solicitados', 'Ajustes solicitados'], ['aprovado', 'Aprovado'], ['nova_versao_em_analise', 'Nova versão em análise'], ['rejeitado', 'Rejeitado']]
const AVAILABILITY_OPTIONS: [string, string][] = [['todas', 'Disponibilidade: todas'], ['disponivel', 'Disponível'], ['pausada', 'Pausada'], ['sem_estoque', 'Sem estoque'], ['bloqueada_por_pendencia', 'Bloqueada por pendência'], ['nao_publicado', 'Fora do catálogo'], ['arquivada', 'Arquivada']]

type PendingAction = { planId: string; offerLabel: string; kind: 'pause' | 'resume' | 'archive' }

export default function OfertasClient({ user, profile, rows, indicators, totalFiltered, page, pageSize, totalPages, loadError, appOptions, partnerOptions, currencyOptions, filters }: Props) {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(filters.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  function pushFilters(next: Partial<Filters & { page: number }>) {
    const merged = { ...filters, page: 1, ...next }
    const params = new URLSearchParams()
    if (merged.q) params.set('q', merged.q)
    if (merged.app !== 'todos') params.set('app', merged.app)
    if (merged.partner !== 'todos') params.set('partner', merged.partner)
    if (merged.origem !== 'todas') params.set('origem', merged.origem)
    if (merged.revisao !== 'todas') params.set('revisao', merged.revisao)
    if (merged.disponibilidade !== 'todas') params.set('disponibilidade', merged.disponibilidade)
    if (merged.cobranca !== 'todas') params.set('cobranca', merged.cobranca)
    if (merged.moeda !== 'todas') params.set('moeda', merged.moeda)
    if (merged.promocao !== 'todas') params.set('promocao', merged.promocao)
    if (merged.periodo !== 'todos') params.set('periodo', merged.periodo)
    if (merged.sort !== 'atualizado_recente') params.set('sort', merged.sort)
    if ('page' in next && next.page && next.page > 1) params.set('page', String(next.page))
    router.push(`/admin/marketplace/ofertas${params.toString() ? `?${params}` : ''}`)
  }

  function onSearchChange(v: string) {
    setSearchInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushFilters({ q: v }), 400)
  }

  function clearAll() {
    setSearchInput('')
    router.push('/admin/marketplace/ofertas')
  }

  const activeFilterCount = [
    filters.app !== 'todos', filters.partner !== 'todos', filters.origem !== 'todas', filters.revisao !== 'todas',
    filters.disponibilidade !== 'todas', filters.cobranca !== 'todas', filters.moeda !== 'todas',
    filters.promocao !== 'todas', filters.periodo !== 'todos',
  ].filter(Boolean).length

  async function runAction(url: string, body: Record<string, unknown> | undefined, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return false }
      toast.success(successMsg)
      router.refresh()
      return true
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
      return false
    } finally { setBusy(false) }
  }

  function openAction(row: OfferRow, kind: PendingAction['kind']) {
    setReason('')
    setPending({ planId: row.id, offerLabel: `${row.appName} · ${row.planName}`, kind })
  }

  async function confirmAction() {
    if (!pending) return
    if (pending.kind === 'pause' && !reason.trim()) { toast.error('Informe o motivo da pausa.'); return }
    const url = `/api/admin/offers/${pending.planId}/${pending.kind}`
    const body = pending.kind === 'archive' ? { reason: reason.trim() || undefined } : pending.kind === 'pause' ? { reason: reason.trim() } : undefined
    const label = pending.kind === 'pause' ? 'pausada' : pending.kind === 'resume' ? 'retomada' : 'arquivada'
    const ok = await runAction(url, body, `Oferta ${label}.`)
    if (ok) setPending(null)
  }

  function exportUrl() {
    const params = new URLSearchParams()
    if (filters.q) params.set('q', filters.q)
    if (filters.origem !== 'todas') params.set('origem', filters.origem)
    if (filters.disponibilidade !== 'todas') params.set('disponibilidade', filters.disponibilidade)
    return `/api/admin/offers/export${params.toString() ? `?${params}` : ''}`
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Ofertas
        </p>

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Ofertas</h1>
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Gerencie planos, preços e promoções dos aplicativos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setRefreshing(true); router.refresh(); setTimeout(() => setRefreshing(false), 500) }}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" /> Atualizar
            </button>
            {profile?.is_leader && (
              <a href={exportUrl()} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
                <Download size={14} aria-hidden="true" /> Exportar
              </a>
            )}
            <Link href="/admin/marketplace/ofertas/nova" className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
              <PlusCircle size={15} aria-hidden="true" /> Nova oferta
            </Link>
          </div>
        </div>

        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => {
            const active = tab.href === '/admin/marketplace/ofertas'
            if (!tab.enabled) return <span key={tab.href} title="Esta área ainda não foi implementada." aria-disabled="true" className="cursor-not-allowed px-3 py-2.5 text-sm font-medium opacity-40" style={{ color: C.textSecondary }}>{tab.label}</span>
            return <Link key={tab.href} href={tab.href} className="px-3 py-2.5 text-sm font-medium" style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>{tab.label}</Link>
          })}
        </nav>

        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            Não foi possível carregar as ofertas agora. Recarregue a página para tentar de novo.
          </div>
        )}

        <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <IndicatorCard icon={Tag} label="Ofertas cadastradas" value={indicators.cadastradas} onClick={() => pushFilters({ disponibilidade: 'todas', promocao: 'todas' })} />
          <IndicatorCard icon={CheckCircle2} label="Disponíveis para venda" value={indicators.disponiveis} color={C.success} active={filters.disponibilidade === 'disponivel'} onClick={() => pushFilters({ disponibilidade: 'disponivel' })} />
          <IndicatorCard icon={Sparkles} label="Promoções ativas" value={indicators.promocoesAtivas} color={C.success} active={filters.promocao === 'ativa'} onClick={() => pushFilters({ promocao: 'ativa' })} />
          <IndicatorCard icon={CalendarClock} label="Promoções programadas" value={indicators.promocoesProgramadas} color={C.primary} active={filters.promocao === 'programada'} onClick={() => pushFilters({ promocao: 'programada' })} />
        </div>
        <p className="mb-4 flex items-start gap-1.5 text-[11px]" style={{ color: C.textSecondary }}>
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          Cadastro, disponibilidade e promoção são dimensões independentes — uma promoção ativa não garante oferta disponível (pode estar sem estoque ou pausada), e os cards não somam entre si. Calculados sobre os {totalFiltered} resultado{totalFiltered === 1 ? '' : 's'} filtrado{totalFiltered === 1 ? '' : 's'}.
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <ShortcutChip label="Todas" active={activeFilterCount === 0} onClick={clearAll} />
          <ShortcutChip label="Em promoção" active={filters.promocao === 'ativa'} onClick={() => pushFilters({ promocao: 'ativa' })} />
          <ShortcutChip label="Programadas" active={filters.promocao === 'programada'} onClick={() => pushFilters({ promocao: 'programada' })} />
          <ShortcutChip label="Com pendências" active={filters.disponibilidade === 'bloqueada_por_pendencia'} onClick={() => pushFilters({ disponibilidade: 'bloqueada_por_pendencia' })} />
          <ShortcutChip label="Arquivadas" active={filters.disponibilidade === 'arquivada'} onClick={() => pushFilters({ disponibilidade: 'arquivada' })} />
        </div>

        <div className="mb-4 flex flex-col gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
            <label htmlFor="offer-search" className="sr-only">Buscar aplicativo, oferta, parceiro ou ID</label>
            <input id="offer-search" value={searchInput} onChange={e => onSearchChange(e.target.value)}
              placeholder="Buscar aplicativo, plano, parceiro ou ID da oferta"
              className="w-full rounded-xl border py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2"
              style={{ background: C.card, borderColor: C.border, color: C.text }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={filters.app} onChange={v => pushFilters({ app: v })} options={[['todos', 'Aplicativo: todos'], ...appOptions]} />
            <Select value={filters.partner} onChange={v => pushFilters({ partner: v })} options={[['todos', 'Parceiro: todos'], ...partnerOptions]} />
            <Select value={filters.origem} onChange={v => pushFilters({ origem: v })} options={[['todas', 'Origem: todas'], ['lobby', ORIGIN_LABEL.lobby], ['partner', ORIGIN_LABEL.partner]]} />
            <Select value={filters.revisao} onChange={v => pushFilters({ revisao: v })} options={REVIEW_OPTIONS} />
            <Select value={filters.disponibilidade} onChange={v => pushFilters({ disponibilidade: v })} options={AVAILABILITY_OPTIONS} />
            <Select value={filters.cobranca} onChange={v => pushFilters({ cobranca: v })} options={BILLING_OPTIONS} />
            <Select value={filters.moeda} onChange={v => pushFilters({ moeda: v })} options={[['todas', 'Moeda: todas'], ...currencyOptions.map(c => [c, c] as [string, string])]} />
            <Select value={filters.periodo} onChange={v => pushFilters({ periodo: v })} options={[['todos', 'Atualização: qualquer período'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['90d', 'Últimos 90 dias']]} />
            <Select value={filters.sort} onChange={v => pushFilters({ sort: v })} options={[['atualizado_recente', 'Atualizados recentemente'], ['nome', 'Nome'], ['preco_asc', 'Menor preço'], ['preco_desc', 'Maior preço']]} />
            {(activeFilterCount > 0 || filters.q) && (
              <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.primary }}>
                <X size={12} aria-hidden="true" /> Limpar filtros
              </button>
            )}
          </div>
        </div>

        <section className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>
              {filters.q || activeFilterCount > 0 ? 'Nenhuma oferta encontrada para esses filtros.' : 'Nenhuma oferta cadastrada ainda.'}
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide" style={{ color: C.textSecondary }}>
                      <th className="pb-2 font-medium">Aplicativo</th>
                      <th className="pb-2 font-medium">Plano/oferta</th>
                      <th className="pb-2 font-medium">Parceiro</th>
                      <th className="pb-2 font-medium">Preço vigente</th>
                      <th className="pb-2 font-medium">Promoção</th>
                      <th className="pb-2 font-medium">Disponibilidade</th>
                      <th className="pb-2 font-medium">Atualizado</th>
                      <th className="pb-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => <OfferTableRow key={r.id} row={r} onAction={openAction} />)}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {rows.map(r => <OfferMobileCard key={r.id} row={r} onAction={openAction} />)}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs" style={{ color: C.textSecondary }}>Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalFiltered)} de {totalFiltered} ofertas</p>
                <Pagination page={page - 1} totalPages={totalPages} variant="dark" onPageChange={p => pushFilters({ page: p + 1 })} />
              </div>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!pending} onOpenChange={next => !busy && setPending(next ? pending : null)}
        icon={pending?.kind === 'pause' ? PauseCircle : pending?.kind === 'resume' ? PlayCircle : Archive}
        variant={pending?.kind === 'resume' ? 'neutral' : 'destructive'}
        title={pending?.kind === 'pause' ? 'Pausar novas vendas?' : pending?.kind === 'resume' ? 'Retomar novas vendas?' : 'Arquivar oferta?'}
        description={
          <div className="space-y-3">
            <p>
              <strong style={{ color: C.text }}>{pending?.offerLabel}</strong>
              {pending?.kind === 'pause' && ' deixa de aceitar novas compras imediatamente. Assinaturas e pedidos anteriores não são afetados.'}
              {pending?.kind === 'resume' && ' tem os requisitos de publicação revalidados antes de voltar a aceitar novas compras.'}
              {pending?.kind === 'archive' && ' sai de comercialização. Pedidos, códigos e histórico anteriores são preservados — nada é apagado.'}
            </p>
            {(pending?.kind === 'pause' || pending?.kind === 'archive') && (
              <label className="block text-xs font-medium" style={{ color: C.text }}>
                Motivo{pending?.kind === 'pause' ? '' : ' (opcional)'}
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm text-white outline-none" style={{ borderColor: C.border }} />
              </label>
            )}
          </div>
        }
        confirmLabel={pending?.kind === 'pause' ? 'Pausar' : pending?.kind === 'resume' ? 'Retomar' : 'Arquivar'}
        confirmingLabel={<><Loader2 size={15} className="animate-spin" />Aplicando…</>}
        busy={busy}
        onConfirm={confirmAction}
      />
    </AdminShell>
  )
}

function OfferTableRow({ row: r, onAction }: { row: OfferRow; onAction: (r: OfferRow, k: PendingAction['kind']) => void }) {
  return (
    <tr className="border-t align-top" style={{ borderColor: C.border }}>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2">
          {r.appLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.appLogoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: C.header }}>
              <Grid3x3 size={14} style={{ color: C.textSecondary }} aria-hidden="true" />
            </div>
          )}
          <div>
            <p className="font-medium" style={{ color: C.text }}>{r.appName}</p>
            <p className="text-[11px]" style={{ color: C.textSecondary }}>{r.origin === 'lobby' ? ORIGIN_LABEL.lobby : ORIGIN_LABEL.partner}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-3">
        <p style={{ color: C.text }}>{r.planName}</p>
        <p className="text-[11px]" style={{ color: C.textSecondary }}>ID {r.id.slice(0, 8)}…</p>
      </td>
      <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }}>{r.partnerName}</td>
      <td className="py-3 pr-3" style={{ color: C.text }}>{formatOfferPrice(r.price, r.currency, r.billingPeriod)}</td>
      <td className="py-3 pr-3"><PromotionCell row={r} /></td>
      <td className="py-3 pr-3"><Badge color={r.availability.color} label={r.availability.label} title={r.availability.reasons.join(' ')} /></td>
      <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(r.updatedAt)}</td>
      <td className="py-3"><RowActions row={r} onAction={onAction} /></td>
    </tr>
  )
}

function OfferMobileCard({ row: r, onAction }: { row: OfferRow; onAction: (r: OfferRow, k: PendingAction['kind']) => void }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.header }}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-medium" style={{ color: C.text }}>{r.appName} · {r.planName}</p>
          <p className="text-xs" style={{ color: C.textSecondary }}>{r.partnerName}</p>
        </div>
        <Badge color={r.availability.color} label={r.availability.label} title={r.availability.reasons.join(' ')} />
      </div>
      <p className="mb-1 text-sm" style={{ color: C.text }}>{formatOfferPrice(r.price, r.currency, r.billingPeriod)}</p>
      <div className="mb-2"><PromotionCell row={r} /></div>
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: C.textSecondary }}>Atualizado {formatDateTimeBR(r.updatedAt)}</span>
        <RowActions row={r} onAction={onAction} compact />
      </div>
    </div>
  )
}

function PromotionCell({ row: r }: { row: OfferRow }) {
  if (!r.promotion) return <span className="text-xs" style={{ color: C.textSecondary }}>Nenhuma</span>
  const p = r.promotion
  return (
    <div className="text-xs">
      <Badge color={p.status.color} label={p.status.label} />
      <p className="mt-1" style={{ color: C.text }}>
        {formatOfferPrice(p.promoPrice, r.currency, r.billingPeriod)}
        {p.discountPercent != null && <span style={{ color: C.success }}> · -{p.discountPercent}%</span>}
      </p>
      <p style={{ color: C.textSecondary }}>até {formatDateTimeBR(p.endsAt)}</p>
    </div>
  )
}

function RowActions({ row: r, onAction, compact }: { row: OfferRow; onAction: (r: OfferRow, k: PendingAction['kind']) => void; compact?: boolean }) {
  const canPause = r.status === 'active'
  const canResume = r.status === 'paused'
  const canArchive = r.status !== 'archived'
  const canView = r.publication.key === 'publicado' && !!r.applicationSlug
  const promoActive = r.promotion?.status.key === 'ativa' || r.promotion?.status.key === 'programada'

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? '' : ''}`}>
      <Link href={`/admin/marketplace/ofertas/${r.id}`} className="rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: C.primary, color: C.primary }}>
        Gerenciar
      </Link>
      {canView ? (
        <a href={`/app/${r.applicationSlug}`} target="_blank" rel="noreferrer" title="Visualizar no marketplace" className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.textSecondary }}>
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      ) : (
        <span title="Só disponível quando o aplicativo está publicado" className="rounded-lg border p-1.5 opacity-30" style={{ borderColor: C.border, color: C.textSecondary }}>
          <ExternalLink size={13} aria-hidden="true" />
        </span>
      )}
      <Link href={`/admin/marketplace/ofertas/${r.id}?tab=promocoes`} title={promoActive ? 'Ver promoção vigente' : 'Criar promoção'} className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.textSecondary }}>
        <Sparkles size={13} aria-hidden="true" />
      </Link>
      {canPause && (
        <button type="button" onClick={() => onAction(r, 'pause')} title="Pausar novas vendas" className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.warning }}>
          <PauseCircle size={13} aria-hidden="true" />
        </button>
      )}
      {canResume && (
        <button type="button" onClick={() => onAction(r, 'resume')} title="Retomar novas vendas" className="rounded-lg border p-1.5" style={{ borderColor: C.primary, color: C.primary }}>
          <PlayCircle size={13} aria-hidden="true" />
        </button>
      )}
      {canArchive && (
        <button type="button" onClick={() => onAction(r, 'archive')} title="Arquivar oferta" className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.error }}>
          <Archive size={13} aria-hidden="true" />
        </button>
      )}
    </div>
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
function ShortcutChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border px-3 py-1 text-xs font-semibold"
      style={active ? { background: C.primary, borderColor: C.primary, color: 'white' } : { borderColor: C.border, color: C.textSecondary }}>
      {label}
    </button>
  )
}
function Badge({ color, label, title }: { color: string; label: string; title?: string }) {
  return <span title={title} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}22`, color }}>{label}</span>
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <select value={value} onChange={e => onChange(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
}
