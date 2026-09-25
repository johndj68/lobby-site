'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Megaphone, CheckCircle2, CalendarClock, Eye, Search, AlertTriangle, Info, X,
  Grid3x3, PauseCircle, PlayCircle, StopCircle, Copy, PlusCircle, Download, RefreshCw, Loader2, Layers,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import Pagination from '@/components/ui/Pagination'
import { MARKETPLACE_COLORS as C, formatDateTimeBR, ORIGIN_LABEL } from '@/lib/marketplace'
import type { CampaignRow } from '@/lib/services/campaigns'

interface AdSpace {
  id: string; slug: string; name: string; description: string | null; is_active: boolean
  max_concurrent_campaigns: number; max_simultaneous_display: number; swap_interval_seconds: number
}
interface AdPackage {
  id: string; space_id: string; name: string; description: string | null; duration_days: number
  price: number | null; currency: string; cancellation_policy: string | null; pause_policy: string | null; status: 'draft' | 'active' | 'archived'
}
interface ReservationRow {
  id: string; campaignId: string; spaceId: string; startsAt: string; endsAt: string
  status: 'held' | 'confirmed'; expiresAt: string | null; campaignName: string
}

interface Filters {
  q: string; app: string; partner: string; origem: string; revisao: string; pagamento: string
  disponibilidade: string; espaco: string; sort: string; periodo: string
}

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  rows: CampaignRow[]
  indicators: { emExibicao: number; programadas: number; aguardandoRevisao: number; impressionsInPeriod: number }
  totalFiltered: number; page: number; pageSize: number; totalPages: number
  loadError: boolean
  appOptions: [string, string][]
  partnerOptions: [string, string][]
  spaceOptions: [string, string][]
  spaces: AdSpace[]
  packages: AdPackage[]
  reservations: ReservationRow[]
  filters: Filters
}

const NAV_TABS = [
  { label: 'Visão geral', href: '/admin/marketplace', enabled: true },
  { label: 'Aplicativos', href: '/admin/marketplace/aplicativos', enabled: true },
  { label: 'Solicitações', href: '/admin/marketplace/solicitacoes', enabled: true },
  { label: 'Ofertas', href: '/admin/marketplace/ofertas', enabled: true },
  { label: 'Destaques', href: '/admin/marketplace/destaques', enabled: true },
  { label: 'Categorias', href: '/admin/marketplace/categorias', enabled: true },
  { label: 'Parceiros', href: '/admin/marketplace/parceiros', enabled: true },
]

const INNER_TABS = ['Campanhas', 'Programação', 'Pacotes e espaços'] as const
type InnerTab = typeof INNER_TABS[number]

const REVIEW_OPTIONS: [string, string][] = [['todas', 'Revisão: todas'], ['rascunho', 'Rascunho'], ['em_revisao', 'Em revisão'], ['ajustes_solicitados', 'Ajustes solicitados'], ['aprovado', 'Aprovado'], ['rejeitado', 'Rejeitado']]
const PAYMENT_OPTIONS: [string, string][] = [['todos', 'Pagamento: todos'], ['pago', 'Pago'], ['isento', 'Isento'], ['pendente', 'Aguardando pagamento'], ['falhou', 'Falhou'], ['reembolsado', 'Reembolsado']]
const AVAILABILITY_OPTIONS: [string, string][] = [['todas', 'Disponibilidade: todas'], ['em_exibicao', 'Em exibição'], ['programada', 'Programada'], ['pausada', 'Pausada'], ['encerrada', 'Encerrada'], ['cancelada', 'Cancelada'], ['em_revisao', 'Em revisão'], ['aguardando_pagamento', 'Aguardando pagamento'], ['bloqueada_por_pendencia', 'Bloqueada por pendência']]

type PendingAction = { campaignId: string; label: string; kind: 'pause' | 'resume' | 'cancel' | 'duplicate' }

export default function DestaquesClient({ user, profile, rows, indicators, totalFiltered, page, pageSize, totalPages, loadError, appOptions, partnerOptions, spaceOptions, spaces, packages, reservations, filters }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<InnerTab>('Campanhas')
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
    if (merged.pagamento !== 'todos') params.set('pagamento', merged.pagamento)
    if (merged.disponibilidade !== 'todas') params.set('disponibilidade', merged.disponibilidade)
    if (merged.espaco !== 'todos') params.set('espaco', merged.espaco)
    if (merged.sort !== 'atualizado_recente') params.set('sort', merged.sort)
    if (merged.periodo !== '30d') params.set('periodo', merged.periodo)
    if ('page' in next && next.page && next.page > 1) params.set('page', String(next.page))
    router.push(`/admin/marketplace/destaques${params.toString() ? `?${params}` : ''}`)
  }

  function onSearchChange(v: string) {
    setSearchInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushFilters({ q: v }), 400)
  }

  function clearAll() { setSearchInput(''); router.push('/admin/marketplace/destaques') }

  const activeFilterCount = [
    filters.app !== 'todos', filters.partner !== 'todos', filters.origem !== 'todas', filters.revisao !== 'todas',
    filters.pagamento !== 'todos', filters.disponibilidade !== 'todas', filters.espaco !== 'todos',
  ].filter(Boolean).length

  async function runAction(url: string, body: Record<string, unknown> | undefined, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return false }
      if (data.warning) toast.warning(data.warning)
      else toast.success(successMsg)
      router.refresh()
      return true
    } catch { toast.error('Falha de conexão. Tente novamente.'); return false }
    finally { setBusy(false) }
  }

  function openAction(row: CampaignRow, kind: PendingAction['kind']) {
    setReason('')
    setPending({ campaignId: row.id, label: `${row.appName} · ${row.internalName ?? 'Campanha'}`, kind })
  }

  async function confirmAction() {
    if (!pending) return
    if ((pending.kind === 'pause' || pending.kind === 'cancel') && !reason.trim()) { toast.error('Informe o motivo.'); return }
    if (pending.kind === 'duplicate') {
      const res = await fetch(`/api/admin/campaigns/${pending.campaignId}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível duplicar.'); return }
      toast.success('Rascunho duplicado criado.')
      router.push(`/admin/marketplace/destaques/${data.id}`)
      setPending(null)
      return
    }
    const url = `/api/admin/campaigns/${pending.campaignId}/${pending.kind}`
    const body = pending.kind === 'resume' ? undefined : { reason: reason.trim() }
    const label = pending.kind === 'pause' ? 'pausada' : pending.kind === 'resume' ? 'retomada' : 'encerrada'
    const ok = await runAction(url, body, `Campanha ${label}.`)
    if (ok) setPending(null)
  }

  function exportUrl() {
    const params = new URLSearchParams()
    if (filters.q) params.set('q', filters.q)
    if (filters.disponibilidade !== 'todas') params.set('disponibilidade', filters.disponibilidade)
    return `/api/admin/campaigns/export${params.toString() ? `?${params}` : ''}`
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Destaques
        </p>

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Destaques patrocinados</h1>
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Gerencie campanhas e a exibição de aplicativos no carrossel da home.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={filters.periodo} onChange={e => pushFilters({ periodo: e.target.value })} className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>
              <option value="7d" style={{ color: 'black' }}>Impressões: 7 dias</option>
              <option value="30d" style={{ color: 'black' }}>Impressões: 30 dias</option>
              <option value="90d" style={{ color: 'black' }}>Impressões: 90 dias</option>
            </select>
            <button type="button" onClick={() => { setRefreshing(true); router.refresh(); setTimeout(() => setRefreshing(false), 500) }}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" /> Atualizar
            </button>
            {profile?.is_leader && (
              <a href={exportUrl()} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
                <Download size={14} aria-hidden="true" /> Exportar
              </a>
            )}
            <Link href="/admin/marketplace/destaques/nova" className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
              <PlusCircle size={15} aria-hidden="true" /> Nova campanha
            </Link>
          </div>
        </div>

        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(t => {
            const active = t.href === '/admin/marketplace/destaques'
            if (!t.enabled) return <span key={t.href} title="Esta área ainda não foi implementada." aria-disabled="true" className="cursor-not-allowed px-3 py-2.5 text-sm font-medium opacity-40" style={{ color: C.textSecondary }}>{t.label}</span>
            return <Link key={t.href} href={t.href} className="px-3 py-2.5 text-sm font-medium" style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>{t.label}</Link>
          })}
        </nav>

        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            Não foi possível carregar as campanhas agora. Recarregue a página para tentar de novo.
          </div>
        )}

        <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <IndicatorCard icon={CheckCircle2} label="Campanhas em exibição" value={indicators.emExibicao} color={C.success} active={filters.disponibilidade === 'em_exibicao'} onClick={() => pushFilters({ disponibilidade: 'em_exibicao' })} />
          <IndicatorCard icon={CalendarClock} label="Campanhas programadas" value={indicators.programadas} color={C.primary} active={filters.disponibilidade === 'programada'} onClick={() => pushFilters({ disponibilidade: 'programada' })} />
          <IndicatorCard icon={Megaphone} label="Aguardando revisão" value={indicators.aguardandoRevisao} color={C.warning} active={filters.revisao === 'em_revisao'} onClick={() => pushFilters({ revisao: 'em_revisao' })} />
          <IndicatorCard icon={Eye} label={`Impressões (${filters.periodo})`} value={indicators.impressionsInPeriod} />
        </div>
        <p className="mb-4 flex items-start gap-1.5 text-[11px]" style={{ color: C.textSecondary }}>
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          Os 3 primeiros indicadores mostram a situação agora; impressões são do período selecionado acima — dimensões diferentes, não somam entre si. &quot;Em exibição&quot; significa elegível para a rotação, não necessariamente visível neste exato instante. Calculados sobre os {totalFiltered} resultado{totalFiltered === 1 ? '' : 's'} filtrado{totalFiltered === 1 ? '' : 's'}.
        </p>

        <div className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {INNER_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-3 py-2.5 text-sm font-medium"
              style={{ color: tab === t ? C.primary : C.textSecondary, borderBottom: tab === t ? `2px solid ${C.primary}` : '2px solid transparent' }}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Campanhas' && (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <ShortcutChip label="Todas" active={activeFilterCount === 0} onClick={clearAll} />
              <ShortcutChip label="Em exibição" active={filters.disponibilidade === 'em_exibicao'} onClick={() => pushFilters({ disponibilidade: 'em_exibicao' })} />
              <ShortcutChip label="Programadas" active={filters.disponibilidade === 'programada'} onClick={() => pushFilters({ disponibilidade: 'programada' })} />
              <ShortcutChip label="Pendentes" active={filters.disponibilidade === 'bloqueada_por_pendencia'} onClick={() => pushFilters({ disponibilidade: 'bloqueada_por_pendencia' })} />
              <ShortcutChip label="Encerradas" active={filters.disponibilidade === 'encerrada'} onClick={() => pushFilters({ disponibilidade: 'encerrada' })} />
            </div>

            <div className="mb-4 flex flex-col gap-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
                <label htmlFor="campaign-search" className="sr-only">Buscar aplicativo, parceiro, campanha ou ID</label>
                <input id="campaign-search" value={searchInput} onChange={e => onSearchChange(e.target.value)}
                  placeholder="Buscar aplicativo, parceiro, nome da campanha ou ID"
                  className="w-full rounded-xl border py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2"
                  style={{ background: C.card, borderColor: C.border, color: C.text }} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={filters.app} onChange={v => pushFilters({ app: v })} options={[['todos', 'Aplicativo: todos'], ...appOptions]} />
                <Select value={filters.partner} onChange={v => pushFilters({ partner: v })} options={[['todos', 'Parceiro: todos'], ...partnerOptions]} />
                <Select value={filters.origem} onChange={v => pushFilters({ origem: v })} options={[['todas', 'Origem: todas'], ['lobby', ORIGIN_LABEL.lobby], ['partner', ORIGIN_LABEL.partner]]} />
                <Select value={filters.espaco} onChange={v => pushFilters({ espaco: v })} options={[['todos', 'Espaço: todos'], ...spaceOptions]} />
                <Select value={filters.revisao} onChange={v => pushFilters({ revisao: v })} options={REVIEW_OPTIONS} />
                <Select value={filters.pagamento} onChange={v => pushFilters({ pagamento: v })} options={PAYMENT_OPTIONS} />
                <Select value={filters.disponibilidade} onChange={v => pushFilters({ disponibilidade: v })} options={AVAILABILITY_OPTIONS} />
                <Select value={filters.sort} onChange={v => pushFilters({ sort: v })} options={[['atualizado_recente', 'Atualizados recentemente'], ['nome', 'Nome'], ['inicio', 'Início']]} />
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
                  {filters.q || activeFilterCount > 0 ? 'Nenhuma campanha encontrada para esses filtros.' : 'Nenhuma campanha cadastrada ainda.'}
                </p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide" style={{ color: C.textSecondary }}>
                          <th className="pb-2 font-medium">Aplicativo</th>
                          <th className="pb-2 font-medium">Parceiro</th>
                          <th className="pb-2 font-medium">Espaço</th>
                          <th className="pb-2 font-medium">Período</th>
                          <th className="pb-2 font-medium">Estado</th>
                          <th className="pb-2 font-medium">Pagamento</th>
                          <th className="pb-2 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => <CampaignTableRow key={r.id} row={r} onAction={openAction} />)}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-3 md:hidden">
                    {rows.map(r => <CampaignMobileCard key={r.id} row={r} onAction={openAction} />)}
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs" style={{ color: C.textSecondary }}>Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalFiltered)} de {totalFiltered} campanhas</p>
                    <Pagination page={page - 1} totalPages={totalPages} variant="dark" onPageChange={p => pushFilters({ page: p + 1 })} />
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {tab === 'Programação' && <ProgramacaoTab reservations={reservations} />}
        {tab === 'Pacotes e espaços' && <PacotesEspacosTab spaces={spaces} packages={packages} isLeader={!!profile?.is_leader} onChanged={() => router.refresh()} />}
      </div>

      <ConfirmDialog
        open={!!pending} onOpenChange={next => !busy && setPending(next ? pending : null)}
        icon={pending?.kind === 'pause' ? PauseCircle : pending?.kind === 'resume' ? PlayCircle : pending?.kind === 'duplicate' ? Copy : StopCircle}
        variant={pending?.kind === 'resume' || pending?.kind === 'duplicate' ? 'neutral' : 'destructive'}
        title={pending?.kind === 'pause' ? 'Pausar exibição?' : pending?.kind === 'resume' ? 'Retomar exibição?' : pending?.kind === 'duplicate' ? 'Duplicar como rascunho?' : 'Encerrar campanha?'}
        description={
          <div className="space-y-3">
            <p>
              <strong style={{ color: C.text }}>{pending?.label}</strong>
              {pending?.kind === 'pause' && ' deixa de participar do carrossel imediatamente. O período contratado e a reserva não são alterados automaticamente.'}
              {pending?.kind === 'resume' && ' tem os requisitos (revisão, pagamento, reserva) revalidados antes de voltar a exibir.'}
              {pending?.kind === 'cancel' && ' é encerrada. Pagamentos e histórico são preservados — nada é apagado.'}
              {pending?.kind === 'duplicate' && ' — cria um rascunho novo com o mesmo aplicativo/espaço/pacote e o texto do anúncio. Aprovação, pagamento, reserva e métricas nunca são copiados.'}
            </p>
            {(pending?.kind === 'pause' || pending?.kind === 'cancel') && (
              <label className="block text-xs font-medium" style={{ color: C.text }}>
                Motivo
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm text-white outline-none" style={{ borderColor: C.border }} />
              </label>
            )}
          </div>
        }
        confirmLabel={pending?.kind === 'pause' ? 'Pausar' : pending?.kind === 'resume' ? 'Retomar' : pending?.kind === 'duplicate' ? 'Duplicar' : 'Encerrar'}
        confirmingLabel={<><Loader2 size={15} className="animate-spin" />Aplicando…</>}
        busy={busy}
        onConfirm={confirmAction}
      />
    </AdminShell>
  )
}

function CampaignTableRow({ row: r, onAction }: { row: CampaignRow; onAction: (r: CampaignRow, k: PendingAction['kind']) => void }) {
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
            <p className="text-[11px]" style={{ color: C.textSecondary }}>{r.internalName ?? 'Sem nome interno'}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }}>{r.partnerName}</td>
      <td className="py-3 pr-3 text-xs" style={{ color: C.text }}>{r.spaceName ?? '—'}</td>
      <td className="py-3 pr-3 text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(r.startsAt)}<br />até {formatDateTimeBR(r.endsAt)}</td>
      <td className="py-3 pr-3"><Badge color={r.eligibility.color} label={r.eligibility.label} title={r.eligibility.reasons.join(' ')} /><div className="mt-1"><Badge color={r.review.color} label={r.review.label} /></div></td>
      <td className="py-3 pr-3"><Badge color={r.payment.color} label={r.payment.label} /></td>
      <td className="py-3"><RowActions row={r} onAction={onAction} /></td>
    </tr>
  )
}

function CampaignMobileCard({ row: r, onAction }: { row: CampaignRow; onAction: (r: CampaignRow, k: PendingAction['kind']) => void }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.header }}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-medium" style={{ color: C.text }}>{r.appName} · {r.internalName ?? 'Campanha'}</p>
          <p className="text-xs" style={{ color: C.textSecondary }}>{r.partnerName} · {r.spaceName ?? '—'}</p>
        </div>
        <Badge color={r.eligibility.color} label={r.eligibility.label} />
      </div>
      <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(r.startsAt)} até {formatDateTimeBR(r.endsAt)}</p>
      <div className="mb-2 flex gap-1.5"><Badge color={r.review.color} label={r.review.label} /><Badge color={r.payment.color} label={r.payment.label} /></div>
      <RowActions row={r} onAction={onAction} compact />
    </div>
  )
}

function RowActions({ row: r, onAction }: { row: CampaignRow; onAction: (r: CampaignRow, k: PendingAction['kind']) => void; compact?: boolean }) {
  const canPause = r.eligibility.key === 'em_exibicao' || r.eligibility.key === 'programada'
  const canResume = r.eligibility.key === 'pausada'
  const canCancel = r.eligibility.key !== 'cancelada' && r.eligibility.key !== 'encerrada'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={`/admin/marketplace/destaques/${r.id}`} className="rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: C.primary, color: C.primary }}>Gerenciar</Link>
      {canPause && <button type="button" onClick={() => onAction(r, 'pause')} title="Pausar exibição" className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.warning }}><PauseCircle size={13} aria-hidden="true" /></button>}
      {canResume && <button type="button" onClick={() => onAction(r, 'resume')} title="Retomar exibição" className="rounded-lg border p-1.5" style={{ borderColor: C.primary, color: C.primary }}><PlayCircle size={13} aria-hidden="true" /></button>}
      {canCancel && <button type="button" onClick={() => onAction(r, 'cancel')} title="Encerrar campanha" className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.error }}><StopCircle size={13} aria-hidden="true" /></button>}
      <button type="button" onClick={() => onAction(r, 'duplicate')} title="Duplicar como rascunho" className="rounded-lg border p-1.5" style={{ borderColor: C.border, color: C.textSecondary }}><Copy size={13} aria-hidden="true" /></button>
    </div>
  )
}

function ProgramacaoTab({ reservations }: { reservations: ReservationRow[] }) {
  const [now] = useState(() => Date.now())
  if (reservations.length === 0) {
    return (
      <section className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
        <p className="py-10 text-center text-sm" style={{ color: C.textSecondary }}>Nenhuma reserva de espaço no momento.</p>
      </section>
    )
  }
  return (
    <section className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
      <p className="mb-3 text-xs" style={{ color: C.textSecondary }}>Reservas confirmadas e temporárias, ordenadas por início. Reservas temporárias (&quot;held&quot;) expiram se o checkout não for concluído a tempo.</p>
      <ul className="space-y-2">
        {reservations.map(r => {
          const expired = r.status === 'held' && r.expiresAt && new Date(r.expiresAt).getTime() < now
          return (
            <li key={r.id} className="flex flex-col gap-1 rounded-xl border p-3 text-sm sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: C.border }}>
              <div>
                <Link href={`/admin/marketplace/destaques/${r.campaignId}`} className="font-medium hover:underline" style={{ color: C.text }}>{r.campaignName}</Link>
                <p className="text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(r.startsAt)} até {formatDateTimeBR(r.endsAt)}</p>
              </div>
              <Badge color={r.status === 'confirmed' ? C.success : expired ? C.error : C.warning} label={r.status === 'confirmed' ? 'Confirmada' : expired ? 'Expirada (aguardando limpeza)' : `Temporária até ${formatDateTimeBR(r.expiresAt!)}`} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function PacotesEspacosTab({ spaces, packages, isLeader, onChanged }: { spaces: AdSpace[]; packages: AdPackage[]; isLeader: boolean; onChanged: () => void }) {
  const [showNewPackage, setShowNewPackage] = useState(false)
  const [form, setForm] = useState({ spaceId: spaces[0]?.id ?? '', name: '', description: '', durationDays: 7, price: '', currency: 'BRL', cancellationPolicy: '', pausePolicy: '' })
  const [saving, setSaving] = useState(false)

  async function createPackage() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/campaigns/packages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, price: form.price === '' ? null : Number(form.price) }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível criar o pacote.'); return }
      toast.success('Pacote criado em rascunho.')
      setShowNewPackage(false)
      onChanged()
    } catch { toast.error('Falha de conexão.') }
    finally { setSaving(false) }
  }

  async function setPackageStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/campaigns/packages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (!res.ok) { toast.error('Não foi possível atualizar o pacote.'); return }
    toast.success('Pacote atualizado.')
    onChanged()
  }

  if (!isLeader) {
    return (
      <section className="rounded-2xl border p-5 text-sm" style={{ background: C.card, borderColor: C.border, color: C.textSecondary }}>
        Gerenciar pacotes e espaços requer um técnico líder.
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}><Layers size={15} aria-hidden="true" /> Espaços</h2>
        <ul className="space-y-2">
          {spaces.map(s => (
            <li key={s.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: C.border }}>
              <div className="flex items-center justify-between">
                <p style={{ color: C.text }}>{s.name} <span className="text-xs" style={{ color: C.textSecondary }}>({s.slug})</span></p>
                <Badge color={s.is_active ? C.success : C.textSecondary} label={s.is_active ? 'Ativo' : 'Indisponível'} />
              </div>
              <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{s.description}</p>
              <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>Capacidade: {s.max_concurrent_campaigns} campanhas simultâneas · {s.max_simultaneous_display} exibida(s) por vez · troca a cada {s.swap_interval_seconds}s</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}><Megaphone size={15} aria-hidden="true" /> Pacotes</h2>
          {!showNewPackage && (
            <button type="button" onClick={() => setShowNewPackage(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white" style={{ background: C.primary }}>
              <PlusCircle size={13} aria-hidden="true" /> Novo pacote
            </button>
          )}
        </div>

        {showNewPackage && (
          <div className="mb-4 space-y-3 rounded-xl border p-4 text-sm" style={{ borderColor: C.border }}>
            <Field label="Espaço">
              <select value={form.spaceId} onChange={e => setForm({ ...form, spaceId: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
                {spaces.map(s => <option key={s.id} value={s.id} style={{ color: 'black' }}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Nome do pacote"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            <Field label="Descrição"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Duração (dias)"><input type="number" min={1} value={form.durationDays} onChange={e => setForm({ ...form, durationDays: Number(e.target.value) })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
              <Field label="Moeda"><input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
              <Field label="Preço (deixe em branco pra definir depois)"><input type="number" min={0} step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            </div>
            <Field label="Política de cancelamento"><textarea value={form.cancellationPolicy} onChange={e => setForm({ ...form, cancellationPolicy: e.target.value })} rows={2} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            <Field label="Política de pausa/compensação"><textarea value={form.pausePolicy} onChange={e => setForm({ ...form, pausePolicy: e.target.value })} rows={2} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            <div className="flex gap-2">
              <button type="button" disabled={saving || !form.name} onClick={createPackage} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Criar pacote
              </button>
              <button type="button" onClick={() => setShowNewPackage(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Cancelar</button>
            </div>
          </div>
        )}

        {packages.length === 0 ? <p className="text-sm" style={{ color: C.textSecondary }}>Nenhum pacote cadastrado ainda.</p> : (
          <ul className="space-y-2">
            {packages.map(p => (
              <li key={p.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: C.border }}>
                <div className="flex items-center justify-between">
                  <p style={{ color: C.text }}>{p.name}</p>
                  <Badge color={p.status === 'active' ? C.success : p.status === 'draft' ? C.warning : C.textSecondary} label={p.status === 'active' ? 'Ativo' : p.status === 'draft' ? 'Rascunho' : 'Arquivado'} />
                </div>
                <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
                  {p.duration_days} dias · {p.price != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: p.currency }).format(p.price) : 'Preço pendente'}
                </p>
                <div className="mt-2 flex gap-2">
                  {p.status === 'draft' && p.price != null && <button onClick={() => setPackageStatus(p.id, 'active')} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.primary, color: C.primary }}>Ativar</button>}
                  {p.status === 'draft' && p.price == null && <span className="text-xs" style={{ color: C.warning }}>Defina um preço antes de ativar</span>}
                  {p.status === 'active' && <button onClick={() => setPackageStatus(p.id, 'archived')} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.border, color: C.error }}>Arquivar</button>}
                  {p.status === 'archived' && <button onClick={() => setPackageStatus(p.id, 'draft')} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.border, color: C.text }}>Voltar a rascunho</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium" style={{ color: C.text }}>{label}<div className="mt-1">{children}</div></label>
}
function IndicatorCard({ icon: Icon, label, value, color, onClick, active }: { icon: React.ElementType; label: string; value: number; color?: string; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className="rounded-2xl border p-4 text-left transition-colors" style={{ background: C.card, borderColor: active ? C.primary : C.border }}>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${color ?? C.primary}1A` }}>
        <Icon size={15} style={{ color: color ?? C.primary }} aria-hidden="true" />
      </div>
      <p className="text-xs font-medium" style={{ color: C.textSecondary }}>{label}</p>
      <p className="my-0.5 text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
    </Tag>
  )
}
function ShortcutChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-full border px-3 py-1 text-xs font-semibold" style={active ? { background: C.primary, borderColor: C.primary, color: 'white' } : { borderColor: C.border, color: C.textSecondary }}>{label}</button>
}
function Badge({ color, label, title }: { color: string; label: string; title?: string }) {
  return <span title={title} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}22`, color }}>{label}</span>
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <select value={value} onChange={e => onChange(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.card, borderColor: C.border, color: C.text }}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
}
