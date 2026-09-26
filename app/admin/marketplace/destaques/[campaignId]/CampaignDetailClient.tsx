'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Copy, PauseCircle, PlayCircle, Ban,
  Info, History as HistoryIcon, Loader2, CheckCircle2, XCircle, MessageSquare, CreditCard, Upload, Monitor, Smartphone, Tablet,
  Maximize2, ExternalLink, Settings, AlertTriangle, FileText, Grid3x3, Image as ImageIcon, Lock, Trash2, Eye,
  RotateCcw, Download, MousePointerClick, Percent, TrendingUp, TrendingDown, Minus, ArrowUpDown, BarChart3, ChevronRight,
  PlusCircle, CalendarClock, CalendarCheck, Undo2, Star, ShieldCheck, Search,
  X, AlertCircle, Inbox,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import Link from 'next/link'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import MarketplaceTabs from '@/components/admin/MarketplaceTabs'
import AppLogo from '@/components/admin/AppLogo'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import Pagination from '@/components/ui/Pagination'
import SponsoredCarouselSection from '@/components/sections/SponsoredCarouselSection'
import { MARKETPLACE_COLORS as C, formatDateTimeBR, formatDateLongBR, dateKeyBR, ORIGIN_LABEL, type PublicationStatus } from '@/lib/marketplace'
import { getCreativeReviewBadge, type CampaignStatusBadge } from '@/lib/services/campaign-labels'
import type { EligibilityResult } from '@/lib/services/campaigns'
import { fillDays, type DesempenhoPeriod, type DayPoint } from '@/lib/services/campaign-metrics'
import {
  getActionMeta, getStatusLabel, isDateRangeStatus, isLegacyCancelMislabel, parseChangedFields, parseDuplicateSource,
  originLabel, CATEGORY_OPTIONS, CATEGORY_LABEL, TONE_COLOR, type EventCategory, type EventOrigin, type FieldChange,
} from '@/lib/services/campaign-events'

interface CampaignInfo { id: string; internalName: string | null; startsAt: string; endsAt: string; spaceId: string | null; packageId: string | null; pausedReason: string | null; createdAt: string; updatedAt: string }
interface AppInfo { id: string; name: string; logoUrl: string | null; applicationSlug: string | null }
interface AcceptedFormats { aspect_ratio?: string; min_width?: number; min_height?: number; max_size_mb?: number }
interface SpaceRef { id: string; name: string; slug?: string; description?: string | null; acceptedFormats?: AcceptedFormats | null }
interface PackageRef { id: string; name: string; price: number | null; currency: string; durationDays: number; description?: string | null; cancellationPolicy?: string | null; pausePolicy?: string | null }
interface PackageOption extends PackageRef { spaceId: string }
interface ReservationInfo { id: string; status: string; startsAt: string; endsAt: string; expiresAt: string | null }
interface Creative {
  id: string; version: number; title: string | null; description: string | null; imageUrl: string | null; imageAlt: string | null
  ctaLabel: string | null; ctaHref: string | null; reviewStatus: string; reviewerNotes: string | null; partnerFeedback: string | null
  reviewedAt: string | null; isLive: boolean; reviewerName: string | null; createdAt: string
}
interface Purchase { id: string; amount: number; currency: string; kind: string; status: string; isentoReason: string | null; refundStatus: string | null; createdAt: string; paidAt: string | null }

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  campaign: CampaignInfo
  app: AppInfo
  origin: 'lobby' | 'partner'
  partnerName: string
  publication: PublicationStatus
  review: CampaignStatusBadge
  payment: CampaignStatusBadge
  eligibility: EligibilityResult
  space: SpaceRef | null
  pkg: PackageRef | null
  spaceOptions: SpaceRef[]
  packageOptions: PackageOption[]
  creatives: Creative[]
  purchases: Purchase[]
  latestReservation: ReservationInfo | null
}

const TABS = ['Prévia', 'Configuração', 'Desempenho', 'Histórico'] as const
type Tab = typeof TABS[number]

export default function CampaignDetailClient({ user, profile, campaign, app, origin, partnerName, publication, review, payment, eligibility, space, pkg, spaceOptions, packageOptions, creatives, purchases, latestReservation }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Estado local é a fonte de verdade (router.replace sozinho não reflete de
  // forma confiável em useSearchParams nesta versão do Next — mesmo padrão
  // já usado em BuscaClient.tsx e em AcompanharClient.tsx). router.replace
  // só existe pra manter a aba e os filtros de desempenho na URL, então
  // recarregar ou compartilhar o link preserva a seleção (seção 4/16).
  const initialTab = (searchParams.get('tab') as Tab) || 'Prévia'
  const [tab, setTabState] = useState<Tab>(TABS.includes(initialTab) ? initialTab : 'Prévia')

  function setTab(t: Tab) {
    setTabState(t)
    const next = new URLSearchParams(searchParams.toString())
    next.set('tab', t)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }
  const [busy, setBusy] = useState(false)
  const [confirmKind, setConfirmKind] = useState<'pause' | 'resume' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')
  // Versão específica que a aba Histórico pediu pra abrir na Prévia — nunca
  // a versão ao vivo por padrão quando o pedido veio de um evento histórico
  // (seção 10: nunca abrir o criativo atual como se fosse o da versão).
  const [previewCreativeId, setPreviewCreativeId] = useState<string | null>(null)
  function goToPreview(creativeId?: string) {
    setPreviewCreativeId(creativeId ?? null)
    setTab('Prévia')
  }

  const liveCreative = creatives.find(c => c.isLive) ?? null
  const pendingCreative = creatives.find(c => c.reviewStatus === 'em_revisao') ?? null
  const draftCreative = creatives.find(c => c.reviewStatus === 'rascunho' || c.reviewStatus === 'ajustes_solicitados') ?? null

  async function runAction(url: string, body: Record<string, unknown> | undefined, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return false }
      if (data.warning) toast.warning(data.warning); else toast.success(successMsg)
      router.refresh()
      return true
    } catch { toast.error('Falha de conexão.'); return false }
    finally { setBusy(false) }
  }

  async function confirmLifecycle() {
    if (!confirmKind) return
    if ((confirmKind === 'pause' || confirmKind === 'cancel') && !reason.trim()) { toast.error('Informe o motivo.'); return }
    const body = confirmKind === 'resume' ? undefined : { reason: reason.trim() }
    const label = confirmKind === 'pause' ? 'pausada' : confirmKind === 'resume' ? 'retomada' : 'cancelada'
    const ok = await runAction(`/api/admin/campaigns/${campaign.id}/${confirmKind}`, body, `Campanha ${label}.`)
    if (ok) setConfirmKind(null)
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-3 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> /{' '}
          <Link href="/admin/marketplace/destaques" className="hover:underline">Destaques</Link> / {campaign.internalName ?? 'Campanha'}
        </p>
        <MarketplaceTabs active="destaques" />
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/admin/marketplace/destaques'))}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar aos destaques
        </button>

        <div className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <AppLogo url={app.logoUrl} size={56} theme="dark" />
              <div>
                <h1 className="text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{campaign.internalName ?? 'Campanha sem nome'}</h1>
                <p className="mt-0.5 text-sm" style={{ color: C.textSecondary }}>{app.name}</p>
                <button onClick={() => { navigator.clipboard.writeText(campaign.id); toast.success('ID da campanha copiado.') }}
                  className="mt-1 inline-flex items-center gap-1 text-xs" style={{ color: C.textSecondary }}>
                  ID: {campaign.id.slice(0, 8)}… <Copy size={11} aria-hidden="true" />
                </button>
                <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
                  {origin === 'lobby' ? ORIGIN_LABEL.lobby : `${ORIGIN_LABEL.partner} · ${partnerName}`} · Configuração atualizada em {formatDateTimeBR(campaign.updatedAt)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge prefix="App" color={publication.color} label={publication.label} />
              <Badge prefix="Criativo" color={review.color} label={review.label} />
              <Badge prefix="Financeiro" color={payment.color} label={payment.label} />
              <Badge prefix="Campanha" {...campaignLifecycleBadge(eligibility)} />
              {(eligibility.key === 'em_exibicao' || eligibility.key === 'programada') && <ActionButton icon={PauseCircle} label="Pausar" onClick={() => { setReason(''); setConfirmKind('pause') }} />}
              {eligibility.key === 'pausada' && <ActionButton icon={PlayCircle} label="Retomar" onClick={() => setConfirmKind('resume')} primary />}
              {eligibility.key !== 'cancelada' && eligibility.key !== 'encerrada' && <ActionButton icon={Ban} label="Cancelar campanha" onClick={() => { setReason(''); setConfirmKind('cancel') }} />}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-xs sm:grid-cols-4" style={{ borderColor: C.border }}>
            <Info2 label="Espaço" value={space?.name ?? 'Não definido'} />
            <Info2 label="Pacote" value={pkg?.name ?? 'Não definido'} />
            <Info2 label="Período (horário de Brasília)" value={`${formatDateTimeBR(campaign.startsAt)} — ${formatDateTimeBR(campaign.endsAt)}${
              eligibility.key === 'programada' ? ' · agendada, ainda não começou' : eligibility.key === 'encerrada' ? ' · período encerrado' : ''
            }`} />
            <Info2 label="Configuração atualizada" value={formatDateTimeBR(campaign.updatedAt)} />
          </div>
          {campaign.pausedReason && (
            <p className="mt-3 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.warning, color: C.text, background: 'rgba(245,158,11,0.08)' }}>Motivo da pausa: {campaign.pausedReason}</p>
          )}
          {eligibility.key !== 'em_exibicao' && eligibility.key !== 'programada' && eligibility.key !== 'encerrada' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs" style={{ borderColor: '#7F1D1D', color: C.text, background: 'rgba(239,68,68,0.10)' }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: C.error }} aria-hidden="true" />
              <span><strong>Este destaque não está sendo exibido.</strong> {eligibility.reasons.join(' ')}</span>
            </div>
          )}
          {eligibility.key === 'em_exibicao' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
              <Info size={13} className="mt-0.5 shrink-0" style={{ color: C.success }} aria-hidden="true" /><span>Elegível para exibição no espaço configurado — sem telemetria de entrega em tempo real, não é possível confirmar que está sendo mostrado neste exato instante.</span>
            </div>
          )}
          {(eligibility.key === 'programada' || eligibility.key === 'encerrada') && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
              <Info size={13} className="mt-0.5 shrink-0" style={{ color: C.primary }} aria-hidden="true" />
              <span>{eligibility.key === 'programada'
                ? `Agendamento: começa em ${formatDateTimeBR(campaign.startsAt)} (horário de Brasília).`
                : `Período encerrado em ${formatDateTimeBR(campaign.endsAt)} (horário de Brasília).`}</span>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-3 py-2.5 text-sm font-medium"
              style={{ color: tab === t ? C.primary : C.textSecondary, borderBottom: tab === t ? `2px solid ${C.primary}` : '2px solid transparent' }}>{t}</button>
          ))}
        </div>

        <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          {tab === 'Prévia' && <PreviaTab campaign={campaign} app={app} space={space} creatives={creatives} onGoToConfig={() => setTab('Configuração')} initialCreativeId={previewCreativeId} />}
          {tab === 'Configuração' && (
            <ConfiguracaoTab campaign={campaign} app={app} partnerName={partnerName} origin={origin} draftCreative={draftCreative} pendingCreative={pendingCreative} liveCreative={liveCreative}
              space={space} pkg={pkg} spaceOptions={spaceOptions} packageOptions={packageOptions} purchases={purchases} isLeader={!!profile?.is_leader}
              publication={publication} eligibility={eligibility} latestReservation={latestReservation}
              onChanged={() => router.refresh()} onGoToPreview={() => goToPreview()} />
          )}
          {tab === 'Desempenho' && (
            <DesempenhoTab campaign={campaign} space={space} pkg={pkg} eligibility={eligibility}
              liveCreative={liveCreative} onGoToConfig={() => setTab('Configuração')} onGoToPreview={() => goToPreview()} onGoToHistory={() => setTab('Histórico')} />
          )}
          {tab === 'Histórico' && (
            <HistoricoTab campaign={campaign} creatives={creatives}
              onGoToConfig={() => setTab('Configuração')} onGoToPreview={goToPreview} />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmKind} onOpenChange={next => !busy && setConfirmKind(next ? confirmKind : null)}
        icon={confirmKind === 'pause' ? PauseCircle : confirmKind === 'resume' ? PlayCircle : Ban}
        variant={confirmKind === 'resume' ? 'neutral' : 'destructive'}
        title={confirmKind === 'pause' ? 'Pausar exibição?' : confirmKind === 'resume' ? 'Retomar exibição?' : 'Cancelar campanha?'}
        description={
          <div className="space-y-3">
            <p>
              {confirmKind === 'pause' && 'Deixa de participar do carrossel imediatamente. Período e reserva não são alterados automaticamente.'}
              {confirmKind === 'resume' && 'Revalida revisão, pagamento e reserva antes de voltar a exibir.'}
              {confirmKind === 'cancel' && 'Encerramento definitivo antes do fim do período contratado. Pagamentos e histórico são preservados — nada é apagado.'}
            </p>
            {(confirmKind === 'pause' || confirmKind === 'cancel') && (
              <label className="block text-xs font-medium" style={{ color: C.text }}>Motivo
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm text-white outline-none" style={{ borderColor: C.border }} />
              </label>
            )}
          </div>
        }
        confirmLabel={confirmKind === 'pause' ? 'Pausar' : confirmKind === 'resume' ? 'Retomar' : 'Cancelar campanha'}
        confirmingLabel={<><Loader2 size={15} className="animate-spin" />Aplicando…</>}
        busy={busy}
        onConfirm={confirmLifecycle}
      />
    </AdminShell>
  )
}

/** Monta o item aceito por SponsoredCarouselSection a partir de campos soltos
 *  (rascunho ainda não salvo) ou de uma versão já persistida — usada tanto
 *  pela prévia ao vivo da aba Configuração quanto pela aba Prévia. ctaHref
 *  só existe pra versões já persistidas (a rota de salvar rascunho sempre
 *  recalcula a partir do slug real — nunca aceita link livre do cliente). */
function buildPreviewItem(app: AppInfo, fields: { title: string; description: string; imageUrl: string; imageAlt: string; ctaLabel: string }, ctaHref?: string | null) {
  return {
    id: 'preview', application_id: app.id, title: fields.title, description: fields.description,
    campaign_image_url: fields.imageUrl || undefined, image_alt: fields.imageAlt || undefined, cta_label: fields.ctaLabel || undefined,
    cta_href: ctaHref ?? undefined, creative_id: null, starts_at: new Date().toISOString(), ends_at: new Date().toISOString(),
    application: [{ id: app.id, name: app.name, slug: app.applicationSlug ?? '', category: '', logo_url: app.logoUrl ?? undefined }],
  }
}

type Viewport = 'desktop' | 'tablet' | 'mobile'

/** Rótulo real da versão — nunca "Versão aprovada (no ar)" fixo (seção 9):
 *  distingue rascunho / em análise / ajustes pedidos / vinculada à
 *  veiculação (a que serve agora) / aprovada histórica (já foi live, foi
 *  substituída) / rejeitada, sempre com o número real da versão. */
function versionLabel(c: Creative): string {
  if (c.isLive) return `Vinculada à veiculação · v${c.version}`
  switch (c.reviewStatus) {
    case 'rascunho': return `Rascunho · v${c.version}`
    case 'em_revisao': return `Em análise · v${c.version}`
    case 'ajustes_solicitados': return `Ajustes solicitados · v${c.version}`
    case 'aprovado': return `Aprovada (histórico) · v${c.version}`
    case 'rejeitado': return `Rejeitada · v${c.version}`
    default: return `v${c.version}`
  }
}

function ViewportButton({ icon: Icon, label, active, onClick }: { icon: React.ElementType; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
      style={active ? { background: `${C.primary}22`, color: C.primary } : { color: C.textSecondary }}>
      <Icon size={14} aria-hidden="true" /> {label}
    </button>
  )
}

function PreviaTab({ campaign, app, space, creatives, onGoToConfig, initialCreativeId }: {
  campaign: CampaignInfo; app: AppInfo; space: SpaceRef | null; creatives: Creative[]; onGoToConfig: () => void
  /** Versão pedida por outra aba (Histórico → "Ver detalhes" → "Abrir
   *  prévia") — só aplicada uma vez; depois disso o usuário volta a
   *  controlar o seletor normalmente (seção 10). */
  initialCreativeId?: string | null
}) {
  const sorted = [...creatives].sort((a, b) => b.version - a.version)
  const defaultCreative = sorted.find(c => c.isLive) ?? sorted[0] ?? null
  const [selectedId, setSelectedId] = useState<string | null>(defaultCreative?.id ?? null)
  // Ajuste de estado durante a renderização (padrão oficial do React pra
  // "resetar/aplicar estado quando uma prop muda") em vez de useEffect — só
  // aplica a versão pedida pelo Histórico uma vez, sem disparar um efeito
  // encadeado extra.
  const [appliedInitialId, setAppliedInitialId] = useState<string | null>(null)
  if (initialCreativeId && initialCreativeId !== appliedInitialId) {
    setAppliedInitialId(initialCreativeId)
    if (sorted.some(c => c.id === initialCreativeId)) setSelectedId(initialCreativeId)
  }
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [expanded, setExpanded] = useState(false)
  const [ctaInfo, setCtaInfo] = useState<{ href: string; valid: boolean } | null>(null)
  const expandTriggerRef = useRef<HTMLButtonElement>(null)

  // Se a versão selecionada sumir (troca de campanha, refresh) cai pra
  // versão padrão em vez de continuar apontando pra um id que não existe
  // mais — nunca mistura dado antigo com a lista nova (seção 19).
  const selected = sorted.find(c => c.id === selectedId) ?? defaultCreative

  const isCarouselSpace = space?.slug === 'home_carousel'
  const item = selected ? buildPreviewItem(app, {
    title: selected.title ?? '', description: selected.description ?? '', imageUrl: selected.imageUrl ?? '',
    imageAlt: selected.imageAlt ?? '', ctaLabel: selected.ctaLabel ?? '',
  }, selected.ctaHref) : null

  const checks: { label: string; ok: boolean }[] = selected ? [
    { label: 'Título preenchido', ok: !!selected.title?.trim() },
    { label: 'Descrição válida', ok: !!selected.description?.trim() },
    { label: 'Imagem disponível', ok: !!selected.imageUrl },
    { label: 'CTA configurado', ok: !!selected.ctaLabel?.trim() },
    { label: 'Destino válido', ok: !!selected.ctaHref },
    { label: 'Espaço de exibição ativo', ok: !!space },
  ] : []

  function renderFrame(vp: Viewport) {
    if (!space) return <EmptyState icon={Info} text="Nenhum espaço de exibição definido para esta campanha ainda." />
    if (!isCarouselSpace) return <EmptyState icon={Info} text={`Nenhuma prévia visual disponível para o espaço "${space.name}" ainda.`} />
    if (!selected || !item) return <EmptyState icon={Info} text="Nenhuma versão de anúncio criada ainda." />
    return (
      <div className="mx-auto overflow-hidden rounded-2xl border transition-all"
        style={{ borderColor: C.border, maxWidth: vp === 'mobile' ? 390 : vp === 'tablet' ? 768 : '100%' }}>
        <SponsoredCarouselSection campaigns={[item]} isPreview forceViewport={vp} onPreviewCtaClick={setCtaInfo} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Prévia do destaque</h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Confira a apresentação desta campanha no espaço selecionado.</p>
      </div>
      <p className="flex items-center gap-1.5 text-xs" style={{ color: C.textSecondary }}>
        <Info size={12} aria-hidden="true" /> Ambiente de prévia. Não gera métricas comerciais nem compras.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select value={selected?.id ?? ''} onChange={e => setSelectedId(e.target.value || null)} disabled={sorted.length === 0}
          className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-50" style={{ borderColor: C.border, color: C.text }}>
          {sorted.length === 0 && <option value="" style={{ color: 'black' }}>Nenhuma versão</option>}
          {sorted.map(c => <option key={c.id} value={c.id} style={{ color: 'black' }}>{versionLabel(c)}</option>)}
        </select>
        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: C.border }}>
          <ViewportButton icon={Monitor} label="Desktop" active={viewport === 'desktop'} onClick={() => setViewport('desktop')} />
          <ViewportButton icon={Tablet} label="Tablet" active={viewport === 'tablet'} onClick={() => setViewport('tablet')} />
          <ViewportButton icon={Smartphone} label="Celular" active={viewport === 'mobile'} onClick={() => setViewport('mobile')} />
        </div>
        <button type="button" ref={expandTriggerRef} onClick={() => setExpanded(true)} disabled={!selected}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40" style={{ borderColor: C.border, color: C.text }}>
          <Maximize2 size={13} aria-hidden="true" /> Expandir
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[72fr_28fr]">
        <div className="min-w-0 rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
          {renderFrame(viewport)}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>Versão selecionada</p>
            {selected ? (
              <div className="space-y-2 text-xs">
                <Info2 label="Versão" value={`v${selected.version}`} />
                <Info2 label="Status do criativo" value={getCreativeReviewBadge(selected.reviewStatus as Parameters<typeof getCreativeReviewBadge>[0]).label} />
                <Info2 label="Data" value={selected.reviewedAt ? formatDateTimeBR(selected.reviewedAt) : `Criada em ${formatDateTimeBR(selected.createdAt)}`} />
                {selected.reviewerName && <Info2 label="Responsável" value={selected.reviewerName} />}
                <Info2 label="Formato" value={space?.name ?? 'Não definido'} />
              </div>
            ) : <p className="text-xs" style={{ color: C.textSecondary }}>Nenhuma versão disponível.</p>}
          </div>

          <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>Verificações do destaque</p>
            {selected ? (
              <ul className="space-y-1.5">
                {checks.map(c => (
                  <li key={c.label} className="flex items-center gap-2 text-xs" style={{ color: C.text }}>
                    {c.ok ? <CheckCircle2 size={13} style={{ color: C.success }} aria-hidden="true" /> : <AlertTriangle size={13} style={{ color: C.warning }} aria-hidden="true" />}
                    {c.label}
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs" style={{ color: C.textSecondary }}>Sem versão selecionada.</p>}
          </div>

          <button type="button" onClick={onGoToConfig}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
            <Settings size={14} aria-hidden="true" /> Abrir configuração
          </button>
          <p className="text-[11px]" style={{ color: C.textSecondary }}>A aprovação do criativo não reativa uma campanha cancelada ou pausada — a exibição depende de todas as condições da campanha.</p>
        </div>
      </div>

      <Dialog open={!!ctaInfo} onOpenChange={o => { if (!o) setCtaInfo(null) }}>
        <DialogContent className="max-w-md border" style={{ background: C.card, borderColor: C.border, color: C.text }}>
          <DialogTitle style={{ color: C.text }}>Destino do anúncio</DialogTitle>
          {ctaInfo && (
            <div className="space-y-3 text-sm">
              <p style={{ color: C.textSecondary }}>Ao clicar no anúncio publicado, o comprador seria levado para:</p>
              <p className="break-all rounded-lg border p-2 font-mono text-xs" style={{ borderColor: C.border, color: C.text }}>{ctaInfo.href}</p>
              <p className="flex items-center gap-1.5" style={{ color: ctaInfo.valid ? C.success : C.error }}>
                {ctaInfo.valid ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
                {ctaInfo.valid ? 'Destino válido.' : 'Nenhum destino real configurado ainda — o aplicativo pode não ter um slug publicado.'}
              </p>
              <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: C.border }}>
                {ctaInfo.valid && (
                  <a href={ctaInfo.href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: C.primary }}>
                    <ExternalLink size={12} aria-hidden="true" /> Abrir destino (nova aba)
                  </a>
                )}
                <Link href={`/admin/marketplace/aplicativos/${app.id}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
                  Ver aplicativo no admin
                </Link>
              </div>
              <p className="text-[11px]" style={{ color: C.textSecondary }}>Abrir o destino sai do ambiente de prévia. Nenhum clique publicitário é registrado por esta ação.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={expanded} onOpenChange={o => { if (!o) setExpanded(false) }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[1200px] border" style={{ background: C.card, borderColor: C.border, color: C.text }}>
          <DialogTitle className="text-sm" style={{ color: C.text }}>Prévia do destaque — {selected ? versionLabel(selected) : campaign.internalName ?? 'Campanha'}</DialogTitle>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: C.border }}>
            <p className="text-xs" style={{ color: C.textSecondary }}>Ambiente de prévia. Não gera métricas comerciais nem compras.</p>
            <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: C.border }}>
              <ViewportButton icon={Monitor} label="Desktop" active={viewport === 'desktop'} onClick={() => setViewport('desktop')} />
              <ViewportButton icon={Tablet} label="Tablet" active={viewport === 'tablet'} onClick={() => setViewport('tablet')} />
              <ViewportButton icon={Smartphone} label="Celular" active={viewport === 'mobile'} onClick={() => setViewport('mobile')} />
            </div>
          </div>
          <div className="max-h-[75vh] overflow-y-auto py-3">{renderFrame(viewport)}</div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// America/Sao_Paulo é UTC-3 fixo desde o fim do horário de verão no Brasil
// (2019) — mesma suposição já assumida em lib/marketplace.ts (periodRange).
// <input type="datetime-local"> não faz nenhuma conversão de fuso sozinho:
// ele mostra/edita os dígitos literais da string. O bug real que isto
// substitui era pegar os dígitos UTC crus (campaign.startsAt.slice(0,16)) e
// exibi-los como se já fossem horário de Brasília — o admin via (e podia
// resalvar) um horário sempre 3h adiantado em relação ao real.
const BRT_OFFSET_MINUTES = 3 * 60
function utcIsoToBrtInputValue(iso: string): string {
  return new Date(new Date(iso).getTime() - BRT_OFFSET_MINUTES * 60000).toISOString().slice(0, 16)
}
function brtInputValueToUtcIso(value: string): string {
  return new Date(new Date(`${value}:00Z`).getTime() + BRT_OFFSET_MINUTES * 60000).toISOString()
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
type AvailabilityState = { status: 'idle' | 'checking' | 'disponivel' | 'indisponivel' | 'erro'; detail?: string }

function ConfiguracaoTab({
  campaign, app, partnerName, origin, draftCreative, pendingCreative, liveCreative,
  space, pkg, spaceOptions, packageOptions, purchases, isLeader, publication, eligibility, latestReservation,
  onChanged, onGoToPreview,
}: {
  campaign: CampaignInfo; app: AppInfo; partnerName: string; origin: 'lobby' | 'partner'
  draftCreative: Creative | null; pendingCreative: Creative | null; liveCreative: Creative | null
  space: SpaceRef | null; pkg: PackageRef | null; spaceOptions: SpaceRef[]; packageOptions: PackageOption[]
  purchases: Purchase[]; isLeader: boolean; publication: PublicationStatus; eligibility: EligibilityResult
  latestReservation: ReservationInfo | null
  onChanged: () => void; onGoToPreview: () => void
}) {
  const editableCreative = draftCreative ?? liveCreative
  const canEditCreative = !pendingCreative

  const initialCreativeForm = {
    title: editableCreative?.title ?? '', description: editableCreative?.description ?? '',
    imageUrl: editableCreative?.imageUrl ?? '', imageAlt: editableCreative?.imageAlt ?? '',
    ctaLabel: editableCreative?.ctaLabel ?? 'Conhecer aplicativo',
  }
  const initialConfigForm = {
    internalName: campaign.internalName ?? '', spaceId: campaign.spaceId ?? spaceOptions[0]?.id ?? '',
    packageId: campaign.packageId ?? '', startsAt: utcIsoToBrtInputValue(campaign.startsAt), endsAt: utcIsoToBrtInputValue(campaign.endsAt),
  }

  const [creativeForm, setCreativeForm] = useState(initialCreativeForm)
  const [configForm, setConfigForm] = useState(initialConfigForm)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' })
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [expandedPreview, setExpandedPreview] = useState(false)
  const [ctaTest, setCtaTest] = useState<{ href: string; valid: boolean } | null>(null)
  const [exemptReason, setExemptReason] = useState('')
  const [showExempt, setShowExempt] = useState(false)

  const isCreativeDirty = canEditCreative && JSON.stringify(creativeForm) !== JSON.stringify(initialCreativeForm)
  const isConfigDirty = JSON.stringify(configForm) !== JSON.stringify(initialConfigForm)
  const isDirty = isCreativeDirty || isConfigDirty

  // Protege contra perder edição ao fechar/recarregar a aba (seção 16) —
  // trocar de aba dentro da própria página não passa por aqui, mas também
  // nunca desmonta este componente (a troca só esconde/mostra), então o
  // estado do formulário sobrevive normalmente.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) { if (isDirty) e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const selectedSpace = spaceOptions.find(s => s.id === configForm.spaceId) ?? space
  const selectedPackage = packageOptions.find(p => p.id === configForm.packageId) ?? (pkg && configForm.packageId === campaign.packageId ? { ...pkg, spaceId: campaign.spaceId ?? '' } : null)
  const hasConfirmedPurchase = purchases.some(p => p.status === 'paid' || p.status === 'isento')
  const changingContractedTerms = hasConfirmedPurchase && (configForm.spaceId !== (campaign.spaceId ?? '') || configForm.packageId !== (campaign.packageId ?? ''))

  const ctaHref = app.applicationSlug ? `/app/${app.applicationSlug}` : null
  const destinationValid = !!ctaHref

  async function uploadImage(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/campaigns/upload-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setUploadError(data.error || 'Falha no upload.'); return }
      setCreativeForm(f => ({ ...f, imageUrl: data.url }))
      setImageMeta(data.width && data.height ? { width: data.width, height: data.height } : null)
      toast.success('Imagem enviada.')
    } catch { setUploadError('Falha de conexão.') }
    finally { setUploading(false) }
  }

  function removeImage() {
    setCreativeForm(f => ({ ...f, imageUrl: '' }))
    setImageMeta(null)
  }

  async function submitForReview() {
    if (isDirty) { toast.error('Salve as alterações antes de enviar para revisão.'); return }
    const res = await fetch(`/api/admin/campaigns/${campaign.id}/creative/submit`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Não foi possível enviar.'); return }
    toast.success('Enviado para revisão.')
    onChanged()
  }

  async function decide(action: 'approve' | 'request_changes' | 'reject', reason?: string) {
    const res = await fetch(`/api/admin/campaigns/${campaign.id}/creative/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }) })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Não foi possível registrar a decisão.'); return }
    toast.success('Decisão registrada.')
    onChanged()
  }

  async function saveAll() {
    setSaveState('saving')
    setSaveError(null)
    try {
      if (isConfigDirty) {
        // Só manda os campos que o admin realmente tocou — não os 5 sempre —
        // pra "Campos alterados" no histórico (seção 17) refletir o que de
        // fato mudou, não tudo que passou pela tela.
        const patch: Record<string, unknown> = { expected_updated_at: campaign.updatedAt }
        if (configForm.internalName !== initialConfigForm.internalName) patch.internal_name = configForm.internalName
        if (configForm.spaceId !== initialConfigForm.spaceId) patch.space_id = configForm.spaceId || null
        if (configForm.packageId !== initialConfigForm.packageId) patch.package_id = configForm.packageId || null
        if (configForm.startsAt !== initialConfigForm.startsAt) patch.starts_at = brtInputValueToUtcIso(configForm.startsAt)
        if (configForm.endsAt !== initialConfigForm.endsAt) patch.ends_at = brtInputValueToUtcIso(configForm.endsAt)
        const res = await fetch(`/api/admin/campaigns/${campaign.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const data = await res.json()
        if (!res.ok) {
          setSaveState(data.conflict ? 'conflict' : 'error')
          setSaveError(data.error || 'Não foi possível salvar a configuração.')
          toast.error(data.error || 'Não foi possível salvar.')
          return
        }
      }
      if (isCreativeDirty) {
        const res = await fetch(`/api/admin/campaigns/${campaign.id}/creative`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creativeForm) })
        const data = await res.json()
        if (!res.ok) {
          setSaveState('error')
          setSaveError(data.error || 'Não foi possível salvar o anúncio.')
          toast.error(data.error || 'Não foi possível salvar.')
          return
        }
      }
      setSaveState('saved')
      toast.success('Alterações salvas.')
      onChanged()
    } catch {
      setSaveState('error')
      setSaveError('Falha de conexão.')
      toast.error('Falha de conexão.')
    }
  }

  function discard() {
    setCreativeForm(initialCreativeForm)
    setConfigForm(initialConfigForm)
    setUploadError(null)
    setSaveState('idle')
    setSaveError(null)
  }

  async function checkAvailability() {
    if (!configForm.spaceId) { toast.error('Selecione um espaço primeiro.'); return }
    setAvailability({ status: 'checking' })
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/check-availability`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId: configForm.spaceId, startsAt: brtInputValueToUtcIso(configForm.startsAt), endsAt: brtInputValueToUtcIso(configForm.endsAt) }),
      })
      const data = await res.json()
      if (!res.ok) { setAvailability({ status: 'erro', detail: data.error }); return }
      setAvailability({ status: data.status === 'disponivel' ? 'disponivel' : 'indisponivel', detail: data.reason })
    } catch { setAvailability({ status: 'erro', detail: 'Falha de conexão.' }) }
  }

  async function reserve() {
    const res = await fetch(`/api/admin/campaigns/${campaign.id}/reserve`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Não foi possível reservar.'); return }
    toast.success('Espaço reservado temporariamente.')
    onChanged()
  }

  async function checkout() {
    if (!configForm.packageId) { toast.error('Selecione um pacote.'); return }
    const res = await fetch(`/api/admin/campaigns/${campaign.id}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId: configForm.packageId }) })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Não foi possível iniciar a cobrança.'); return }
    if (data.url) window.location.href = data.url
  }

  async function grantExemption() {
    if (!exemptReason.trim()) { toast.error('Informe o motivo.'); return }
    const res = await fetch(`/api/admin/campaigns/${campaign.id}/exempt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: exemptReason.trim(), packageId: configForm.packageId || undefined }) })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Não foi possível conceder isenção.'); return }
    if (data.warning) toast.warning(data.warning); else toast.success('Isenção concedida.')
    setShowExempt(false)
    onChanged()
  }

  const previewItem = buildPreviewItem(app, creativeForm, ctaHref)

  const configPendencies = [
    { label: 'Título ausente', ok: !!creativeForm.title.trim() },
    { label: 'Descrição ausente', ok: !!creativeForm.description.trim() },
    { label: 'Imagem ausente', ok: !!creativeForm.imageUrl },
    { label: 'Destino inválido', ok: destinationValid },
    { label: 'Período inválido', ok: new Date(brtInputValueToUtcIso(configForm.endsAt)).getTime() > new Date(brtInputValueToUtcIso(configForm.startsAt)).getTime() },
  ].filter(c => !c.ok)
  const deliveryBlockers = eligibility.key === 'em_exibicao' || eligibility.key === 'programada' ? [] : eligibility.reasons

  return (
    <div className="grid gap-6 lg:grid-cols-[68fr_32fr]">
      <div className="min-w-0 space-y-6 pb-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Configuração da campanha</h2>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Defina onde, quando e como o destaque será apresentado.</p>
        </div>

        {publication.key === 'suspenso' && (
          <div className="flex items-start gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: '#7F1D1D', background: 'rgba(239,68,68,0.10)', color: C.text }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: C.error }} aria-hidden="true" />
            <span>O aplicativo está suspenso. Salvar aqui não remove a suspensão nem reativa a veiculação — isso é feito pelo fluxo de aplicativos.</span>
          </div>
        )}
        {eligibility.key === 'cancelada' && (
          <div className="flex items-start gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: '#7F1D1D', background: 'rgba(239,68,68,0.10)', color: C.text }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: C.error }} aria-hidden="true" />
            <span>Esta campanha está cancelada. Salvar configuração não a reativa — reativação não é uma operação suportada por esta campanha.</span>
          </div>
        )}

        {/* 1. Dados da campanha */}
        <NumberedCard number={1} icon={FileText} title="Dados da campanha">
          <Field label="Nome interno" hint="Só aparece aqui no admin — não é o título público do anúncio.">
            <input value={configForm.internalName} onChange={e => setConfigForm({ ...configForm, internalName: e.target.value })}
              placeholder="Ex: FlowPilot — Campanha de outubro" className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Aplicativo vinculado" hint="A troca de aplicativo não é suportada — abra uma nova campanha se precisar vincular outro app.">
              <div className="flex items-center gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: C.border, color: C.textSecondary, background: 'rgba(255,255,255,0.03)' }}>
                <Lock size={12} className="shrink-0" aria-hidden="true" /> {app.name}
              </div>
            </Field>
            <Field label="Parceiro responsável" hint="Derivado do vínculo do aplicativo, não editável aqui.">
              <div className="flex items-center gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: C.border, color: C.textSecondary, background: 'rgba(255,255,255,0.03)' }}>
                <Lock size={12} className="shrink-0" aria-hidden="true" /> {origin === 'lobby' ? ORIGIN_LABEL.lobby : partnerName}
              </div>
            </Field>
          </div>
          <button type="button" onClick={() => { navigator.clipboard.writeText(campaign.id); toast.success('ID da campanha copiado.') }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.primary }}>
            <Copy size={12} aria-hidden="true" /> Copiar identificador da campanha
          </button>
        </NumberedCard>

        {/* 2. Espaço e período */}
        <NumberedCard number={2} icon={Grid3x3} title="Espaço e período">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Espaço de exibição">
              <select value={configForm.spaceId} onChange={e => { setConfigForm({ ...configForm, spaceId: e.target.value, packageId: '' }); setAvailability({ status: 'idle' }) }}
                className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
                <option value="" style={{ color: 'black' }}>Selecione…</option>
                {spaceOptions.map(s => <option key={s.id} value={s.id} style={{ color: 'black' }}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Pacote">
              <select value={configForm.packageId} onChange={e => setConfigForm({ ...configForm, packageId: e.target.value })}
                className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
                <option value="" style={{ color: 'black' }}>Selecione…</option>
                {packageOptions.filter(p => !configForm.spaceId || p.spaceId === configForm.spaceId).map(p => (
                  <option key={p.id} value={p.id} style={{ color: 'black' }}>{p.name} — {p.price != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: p.currency }).format(p.price) : 'sem preço'}</option>
                ))}
              </select>
            </Field>
          </div>
          {selectedSpace?.acceptedFormats && (
            <p className="text-xs" style={{ color: C.textSecondary }}>
              Formato aceito: {selectedSpace.acceptedFormats.aspect_ratio ?? '—'} · mínimo {selectedSpace.acceptedFormats.min_width ?? '—'}×{selectedSpace.acceptedFormats.min_height ?? '—'}px · até {selectedSpace.acceptedFormats.max_size_mb ?? '—'}MB
            </p>
          )}
          {selectedPackage && (
            <p className="text-xs" style={{ color: C.textSecondary }}>
              {selectedPackage.durationDays} dia(s) de duração{selectedPackage.description ? ` · ${selectedPackage.description}` : ''}
              {selectedPackage.cancellationPolicy ? ` · Cancelamento: ${selectedPackage.cancellationPolicy}` : ''}
            </p>
          )}
          {changingContractedTerms && (
            <p className="flex items-start gap-1.5 text-xs" style={{ color: C.warning }}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> Há uma contratação confirmada para o espaço/pacote atual — trocar aqui não altera as condições já contratadas nem gera cobrança automática.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: C.border }}>
            <Field label="Início"><input type="datetime-local" value={configForm.startsAt} onChange={e => { setConfigForm({ ...configForm, startsAt: e.target.value }); setAvailability({ status: 'idle' }) }} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} /></Field>
            <Field label="Término"><input type="datetime-local" value={configForm.endsAt} onChange={e => { setConfigForm({ ...configForm, endsAt: e.target.value }); setAvailability({ status: 'idle' }) }} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} /></Field>
          </div>
          <p className="text-xs" style={{ color: C.textSecondary }}>
            Exibição prevista de {formatDateTimeBR(brtInputValueToUtcIso(configForm.startsAt))} até {formatDateTimeBR(brtInputValueToUtcIso(configForm.endsAt))}, no fuso horário de Brasília.
          </p>
          {new Date(brtInputValueToUtcIso(configForm.endsAt)).getTime() <= new Date(brtInputValueToUtcIso(configForm.startsAt)).getTime() && (
            <p className="text-xs" style={{ color: C.error }}>O término precisa ser posterior ao início.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={checkAvailability} disabled={availability.status === 'checking'}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ borderColor: C.border, color: C.text }}>
              {availability.status === 'checking' ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null} Verificar disponibilidade
            </button>
            {availability.status === 'disponivel' && <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.success }}><CheckCircle2 size={13} aria-hidden="true" /> Disponível</span>}
            {availability.status === 'indisponivel' && <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.error }}><AlertTriangle size={13} aria-hidden="true" /> Indisponível</span>}
            {availability.status === 'erro' && <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.warning }}><AlertTriangle size={13} aria-hidden="true" /> Não foi possível verificar</span>}
          </div>
          {availability.detail && <p className="text-xs" style={{ color: C.textSecondary }}>{availability.detail}</p>}
          <p className="text-[11px]" style={{ color: C.textSecondary }}>Uma consulta de disponibilidade não garante a vaga — a reserva efetiva é validada de novo no momento em que é feita.</p>

          {latestReservation && (
            <p className="border-t pt-3 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
              Reserva atual: <strong style={{ color: C.text }}>{latestReservation.status === 'confirmed' ? 'confirmada' : latestReservation.status === 'held' ? 'temporária' : 'liberada'}</strong>
              {' '}({formatDateTimeBR(latestReservation.startsAt)} — {formatDateTimeBR(latestReservation.endsAt)})
              {latestReservation.status === 'held' && latestReservation.expiresAt ? `, expira em ${formatDateTimeBR(latestReservation.expiresAt)}` : ''}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: C.border }}>
            <button type="button" onClick={reserve} className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.primary, color: C.primary }}>Reservar espaço</button>
          </div>
        </NumberedCard>

        {/* 3. Conteúdo do destaque + destino */}
        <NumberedCard number={3} icon={ImageIcon} title="Conteúdo do destaque">
          {pendingCreative && (
            <div className="rounded-xl border p-3 text-sm" style={{ borderColor: C.warning }}>
              <p style={{ color: C.text }}>Versão v{pendingCreative.version} em análise — decisão pendente.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => decide('approve')} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: C.success }}><CheckCircle2 size={13} aria-hidden="true" /> Aprovar</button>
                <ReviewDecisionButton icon={MessageSquare} label="Pedir ajustes" color={C.warning} onSubmit={r => decide('request_changes', r)} />
                <ReviewDecisionButton icon={XCircle} label="Rejeitar" color={C.error} onSubmit={r => decide('reject', r)} />
              </div>
            </div>
          )}
          {!canEditCreative ? (
            <p className="text-xs" style={{ color: C.textSecondary }}>Há uma versão em análise — decida sobre ela antes de editar novamente.</p>
          ) : (
            <>
              <Field label="Título público" hint="Frase curta e direta — é o que mais chama atenção no anúncio.">
                <input value={creativeForm.title} onChange={e => setCreativeForm({ ...creativeForm, title: e.target.value })} placeholder="Ex: Crie fluxos visuais sem programar"
                  className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
              </Field>
              <Field label="Descrição curta" hint="Uma ou duas linhas complementando o título.">
                <textarea value={creativeForm.description} onChange={e => setCreativeForm({ ...creativeForm, description: e.target.value })} rows={3} placeholder="Automatize tarefas e conecte suas ferramentas."
                  className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
              </Field>

              <Field label="Imagem do destaque" hint={selectedSpace?.acceptedFormats ? `${selectedSpace.acceptedFormats.aspect_ratio ?? ''} · mínimo ${selectedSpace.acceptedFormats.min_width ?? '—'}×${selectedSpace.acceptedFormats.min_height ?? '—'}px · até ${selectedSpace.acceptedFormats.max_size_mb ?? '—'}MB`.trim() : 'Formato 16:9 recomendado.'}>
                {creativeForm.imageUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={creativeForm.imageUrl} alt="" className="h-20 w-32 rounded-lg border object-cover" style={{ borderColor: C.border }} />
                    <div className="space-y-1.5">
                      {imageMeta && <p className="text-xs" style={{ color: C.textSecondary }}>{imageMeta.width}×{imageMeta.height}px</p>}
                      <div className="flex gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
                          {uploading ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Upload size={12} aria-hidden="true" />} Substituir
                          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
                        </label>
                        <button type="button" onClick={removeImage} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.error, color: C.error }}>
                          <Trash2 size={12} aria-hidden="true" /> Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) uploadImage(f) }}
                    className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-center"
                    style={{ borderColor: dragOver ? C.primary : C.border, background: dragOver ? `${C.primary}11` : 'transparent', color: C.textSecondary }}>
                    {uploading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}
                    <span className="text-xs">{uploading ? 'Enviando…' : 'Clique ou arraste uma imagem'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
                  </label>
                )}
                {uploadError && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: C.error }}>
                    <AlertTriangle size={12} aria-hidden="true" /> {uploadError}
                    <button type="button" onClick={() => setUploadError(null)} className="underline">Tentar de novo</button>
                  </p>
                )}
              </Field>

              <Field label="Texto alternativo da imagem" hint="Descrição curta pra leitores de tela.">
                <input value={creativeForm.imageAlt} onChange={e => setCreativeForm({ ...creativeForm, imageAlt: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
              </Field>
              <Field label="Texto do botão">
                <input value={creativeForm.ctaLabel} onChange={e => setCreativeForm({ ...creativeForm, ctaLabel: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
              </Field>

              <div className="space-y-2 border-t pt-4" style={{ borderColor: C.border }}>
                <p className="text-xs font-semibold" style={{ color: C.text }}>Destino do botão</p>
                <p className="text-xs" style={{ color: C.textSecondary }}>Tipo: página interna do aplicativo (derivada automaticamente — não é possível digitar uma URL livre).</p>
                <p className="break-all text-xs font-mono" style={{ color: C.text }}>{ctaHref ?? 'Nenhum destino disponível'}</p>
                <p className="flex items-center gap-1.5 text-xs" style={{ color: destinationValid ? C.success : C.error }}>
                  {destinationValid ? <CheckCircle2 size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}
                  {destinationValid ? 'Destino válido.' : 'Aplicativo ainda não publicado — não há endereço público pra apontar.'}
                </p>
                <button type="button" onClick={() => setCtaTest({ href: ctaHref ?? 'Nenhum destino disponível', valid: destinationValid })}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
                  Testar destino
                </button>
              </div>

              <p className="text-[11px]" style={{ color: C.textSecondary }}>O selo &quot;Patrocinado&quot; segue a regra do espaço — não pode ser removido por aqui.</p>
            </>
          )}
        </NumberedCard>

        {/* 4. Condições comerciais */}
        <NumberedCard number={4} icon={CreditCard} title="Condições comerciais">
          {purchases.length === 0 ? <EmptyState icon={CreditCard} text="Nenhuma cobrança criada ainda." /> : (
            <ul className="space-y-2">
              {purchases.map(p => (
                <li key={p.id} className="rounded-xl border p-3 text-xs" style={{ borderColor: C.border, color: C.text }}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: p.currency }).format(p.amount)} · {p.status} ({p.kind}) · {formatDateTimeBR(p.createdAt)}
                  {p.isentoReason && <span> · Isenção: {p.isentoReason}</span>}
                  {p.refundStatus && <span> · Reembolso: {p.refundStatus}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px]" style={{ color: C.textSecondary }}>Estado financeiro é só de consulta aqui — confirmação de pagamento vem sempre do provedor real (Stripe) ou de isenção registrada, nunca de um campo editável.</p>
          <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: C.border }}>
            <button type="button" onClick={checkout} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>Gerar cobrança (Stripe)</button>
            {isLeader && !showExempt && <button type="button" onClick={() => setShowExempt(true)} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Conceder isenção</button>}
          </div>
          {showExempt && (
            <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: C.border }}>
              <label className="block text-xs font-medium" style={{ color: C.text }}>Motivo da isenção
                <textarea value={exemptReason} onChange={e => setExemptReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={grantExemption} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: C.primary }}>Confirmar isenção</button>
                <button type="button" onClick={() => setShowExempt(false)} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: C.border, color: C.text }}>Cancelar</button>
              </div>
            </div>
          )}
        </NumberedCard>

        {/* Barra de ações — sticky só dentro da coluna do formulário, nunca cobre a sidebar nem o teclado no celular */}
        <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t px-5 py-3" style={{ borderColor: C.border, background: C.card }}>
          <SaveStateLabel state={saveState} error={saveError} isDirty={isDirty} />
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={discard} disabled={!isDirty || saveState === 'saving'}
              className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ borderColor: C.border, color: C.text }}>
              Descartar alterações
            </button>
            <button type="button" onClick={onGoToPreview} className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
              <Eye size={14} aria-hidden="true" /> Ver prévia
            </button>
            <button type="button" onClick={saveAll} disabled={!isDirty || saveState === 'saving'}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
              {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Salvar alterações
            </button>
          </div>
        </div>
        {canEditCreative && !isDirty && (draftCreative ?? liveCreative) && (
          <div className="-mt-3 flex justify-end">
            <button type="button" onClick={submitForReview} className="text-xs font-semibold hover:underline" style={{ color: C.primary }}>Enviar anúncio para revisão</button>
          </div>
        )}
      </div>

      {/* Coluna de apoio */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
          <p className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Resumo da configuração</p>
          <div className="space-y-2 text-xs">
            <Info2 label="Aplicativo" value={app.name} />
            <Info2 label="Espaço" value={selectedSpace?.name ?? 'Não definido'} />
            <Info2 label="Pacote" value={selectedPackage?.name ?? 'Não definido'} />
            <Info2 label="Período" value={`${formatDateTimeBR(brtInputValueToUtcIso(configForm.startsAt))} — ${formatDateTimeBR(brtInputValueToUtcIso(configForm.endsAt))}`} />
            <Info2 label="Fuso" value="Horário de Brasília" />
            <Info2 label="Versão do criativo" value={liveCreative ? `v${liveCreative.version} (vinculada)` : editableCreative ? `v${editableCreative.version} (rascunho)` : 'Nenhuma ainda'} />
            <Info2 label="Estado financeiro" value={hasConfirmedPurchase ? 'Confirmado' : 'Pendente'} />
          </div>
          {isDirty && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg p-2 text-xs font-semibold" style={{ background: `${C.warning}18`, color: C.warning }}>
              <AlertTriangle size={12} aria-hidden="true" /> Alterações ainda não salvas
            </p>
          )}
        </div>

        <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Prévia do destaque</p>
            <button type="button" onClick={() => setExpandedPreview(true)} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.primary }}>
              Ampliar prévia <Maximize2 size={11} aria-hidden="true" />
            </button>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <ViewportButton icon={Monitor} label="Desktop" active={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')} />
            <ViewportButton icon={Smartphone} label="Mobile" active={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')} />
          </div>
          <div className="mx-auto overflow-hidden rounded-xl border transition-all" style={{ borderColor: C.border, maxWidth: previewMode === 'mobile' ? 360 : '100%' }}>
            <SponsoredCarouselSection campaigns={[previewItem]} isPreview forceViewport={previewMode === 'mobile' ? 'mobile' : 'desktop'} onPreviewCtaClick={setCtaTest} />
          </div>
          <p className="mt-2 text-[11px]" style={{ color: C.textSecondary }}>Reflete o formulário atual — nenhuma impressão, clique ou compra real é gerada aqui.</p>
        </div>

        <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
          <p className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Antes de veicular</p>
          {configPendencies.length === 0 && deliveryBlockers.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: C.success }}><CheckCircle2 size={13} aria-hidden="true" /> Sem pendências conhecidas.</p>
          ) : (
            <div className="space-y-3">
              {configPendencies.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>Pendências de configuração</p>
                  <ul className="space-y-1">
                    {configPendencies.map(p => (
                      <li key={p.label} className="flex items-center gap-1.5 text-xs" style={{ color: C.warning }}><AlertTriangle size={12} aria-hidden="true" /> {p.label}</li>
                    ))}
                  </ul>
                </div>
              )}
              {deliveryBlockers.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>Impedimentos de veiculação</p>
                  <ul className="space-y-1">
                    {deliveryBlockers.map((r, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs" style={{ color: C.error }}><XCircle size={12} aria-hidden="true" /> {r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!ctaTest} onOpenChange={o => { if (!o) setCtaTest(null) }}>
        <DialogContent className="max-w-md border" style={{ background: C.card, borderColor: C.border, color: C.text }}>
          <DialogTitle style={{ color: C.text }}>Destino do anúncio</DialogTitle>
          {ctaTest && (
            <div className="space-y-3 text-sm">
              <p className="break-all rounded-lg border p-2 font-mono text-xs" style={{ borderColor: C.border, color: C.text }}>{ctaTest.href}</p>
              <p className="flex items-center gap-1.5" style={{ color: ctaTest.valid ? C.success : C.error }}>
                {ctaTest.valid ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
                {ctaTest.valid ? 'Destino válido.' : 'Nenhum destino real configurado.'}
              </p>
              {ctaTest.valid && (
                <a href={ctaTest.href} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: C.primary }}>
                  <ExternalLink size={12} aria-hidden="true" /> Abrir destino (nova aba)
                </a>
              )}
              <p className="text-[11px]" style={{ color: C.textSecondary }}>Isto só confere o endereço — nenhum clique publicitário, checkout ou reserva é registrado.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={expandedPreview} onOpenChange={o => { if (!o) setExpandedPreview(false) }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[1000px] border" style={{ background: C.card, borderColor: C.border, color: C.text }}>
          <DialogTitle className="text-sm" style={{ color: C.text }}>Prévia do destaque — rascunho atual</DialogTitle>
          <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: C.border }}>
            <ViewportButton icon={Monitor} label="Desktop" active={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')} />
            <ViewportButton icon={Smartphone} label="Mobile" active={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')} />
          </div>
          <div className="max-h-[70vh] overflow-y-auto py-3">
            <div className="mx-auto overflow-hidden rounded-xl border transition-all" style={{ borderColor: C.border, maxWidth: previewMode === 'mobile' ? 390 : '100%' }}>
              <SponsoredCarouselSection campaigns={[previewItem]} isPreview forceViewport={previewMode === 'mobile' ? 'mobile' : 'desktop'} onPreviewCtaClick={setCtaTest} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NumberedCard({ number, icon: Icon, title, children }: { number: number; icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border p-5" style={{ borderColor: C.border, background: C.header }}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: `${C.primary}22`, color: C.primary }}>{number}</span>
        <Icon size={15} style={{ color: C.textSecondary }} aria-hidden="true" />
        <h3 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function SaveStateLabel({ state, error, isDirty }: { state: SaveState; error: string | null; isDirty: boolean }) {
  if (state === 'saving') return <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.textSecondary }}><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Salvando…</span>
  if (state === 'conflict') return <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.error }} role="alert"><AlertTriangle size={12} aria-hidden="true" /> {error ?? 'Conflito de versão — recarregue a página.'}</span>
  if (state === 'error') return <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.error }} role="alert"><AlertTriangle size={12} aria-hidden="true" /> {error ?? 'Erro ao salvar.'}</span>
  // "Salvo" só se sustenta enquanto nada mudou depois — um novo campo tocado
  // após salvar volta a ser "alterações não salvas", nunca fica preso no
  // rótulo de sucesso de um salvamento anterior.
  if (state === 'saved' && !isDirty) return <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.success }}><CheckCircle2 size={12} aria-hidden="true" /> Salvo</span>
  if (isDirty) return <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.warning }} role="status"><AlertTriangle size={12} aria-hidden="true" /> Alterações não salvas</span>
  return <span className="text-xs" style={{ color: C.textSecondary }}>Sem alterações</span>
}


function ReviewDecisionButton({ icon: Icon, label, color, onSubmit }: { icon: React.ElementType; label: string; color: string; onSubmit: (reason: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: color, color }}><Icon size={13} aria-hidden="true" /> {label}</button>
  return (
    <span className="inline-flex items-center gap-1.5">
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Motivo" className="rounded-lg border bg-transparent px-2 py-1 text-xs outline-none" style={{ borderColor: C.border, color: C.text }} />
      <button onClick={() => { if (text.trim()) onSubmit(text.trim()) }} className="rounded-lg px-2 py-1 text-xs font-semibold text-white" style={{ background: color }}>OK</button>
    </span>
  )
}

interface MetricsResponse {
  period: DesempenhoPeriod
  range: { start: string; end: string; clampedToNow: boolean }
  campaignCreatedAt: string; campaignStartsAt: string; campaignEndsAt: string; campaignNotStarted: boolean
  impressions: number; clicks: number; ctr: number | null
  byDay: DayPoint[]
  byDevice: Record<string, number>
  byCreative: { creativeId: string; impressions: number; clicks: number; version: number | null }[]
  comparison: { range: { start: string; end: string }; impressions: number; clicks: number; ctr: number | null; byDay: DayPoint[] } | null
  fetchedAt: string
}

const DESEMP_PERIOD_LABEL: Record<DesempenhoPeriod, string> = {
  hoje: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', campanha: 'Todo o período da campanha', custom: 'Personalizado',
}
const numberBR = (n: number) => n.toLocaleString('pt-BR')

function shortDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function DesempenhoTab({ campaign, space, pkg, eligibility, liveCreative, onGoToConfig, onGoToPreview, onGoToHistory }: {
  campaign: CampaignInfo; space: SpaceRef | null; pkg: PackageRef | null; eligibility: EligibilityResult
  liveCreative: Creative | null; onGoToConfig: () => void; onGoToPreview: () => void; onGoToHistory: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const initialPeriod = searchParams.get('period')
  const [period, setPeriodState] = useState<DesempenhoPeriod>(isValidDesempenhoPeriod(initialPeriod) ? initialPeriod : '30d')
  const [customFrom, setCustomFrom] = useState(searchParams.get('from') ?? '')
  const [customTo, setCustomTo] = useState(searchParams.get('to') ?? '')
  const [compare, setCompareState] = useState(searchParams.get('compare') === '1')
  const [metric, setMetric] = useState<'impressions' | 'clicks' | 'ctr'>('impressions')
  const [breakdown, setBreakdown] = useState<'none' | 'device' | 'creative'>('none')
  const [sortAsc, setSortAsc] = useState(false)
  const [tablePage, setTablePage] = useState(0)
  const TABLE_PAGE_SIZE = 14

  const [data, setData] = useState<MetricsResponse | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error' | 'refreshing'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const hasLoadedRef = useRef(false)
  const [refreshKey, setRefreshKey] = useState(0)

  function updateQuery(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('tab', 'Desempenho')
    for (const [k, v] of Object.entries(updates)) { if (v === null) next.delete(k); else next.set(k, v) }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }
  function setPeriod(p: DesempenhoPeriod) {
    setPeriodState(p)
    setTablePage(0)
    updateQuery({ period: p, ...(p !== 'custom' ? { from: null, to: null } : {}) })
  }
  function setCompare(v: boolean) { setCompareState(v); updateQuery({ compare: v ? '1' : null }) }

  const canFetch = period !== 'custom' || (!!customFrom && !!customTo)

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    const myId = ++requestIdRef.current
    setLoadState(hasLoadedRef.current ? 'refreshing' : 'loading')
    setErrorMsg(null)
    const qs = new URLSearchParams({ period, compare: compare ? '1' : '0' })
    if (period === 'custom') { qs.set('from', customFrom); qs.set('to', customTo) }
    fetch(`/api/admin/campaigns/${campaign.id}/metrics?${qs.toString()}`)
      .then(async res => {
        const json = await res.json()
        if (cancelled || myId !== requestIdRef.current) return
        if (!res.ok) { setLoadState('error'); setErrorMsg(json.error || 'Falha ao carregar.'); return }
        setData(json)
        setLoadState('loaded')
        hasLoadedRef.current = true
      })
      .catch(() => {
        if (cancelled || myId !== requestIdRef.current) return
        setLoadState('error')
        setErrorMsg('Falha de conexão.')
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo, compare, refreshKey, campaign.id])

  function exportCsv() {
    const qs = new URLSearchParams({ period })
    if (period === 'custom') { qs.set('from', customFrom); qs.set('to', customTo) }
    window.open(`/api/admin/campaigns/${campaign.id}/metrics/export?${qs.toString()}`, '_blank')
  }

  const days = data ? fillDays(data.byDay, data.range.start, data.range.end) : []
  const prevDays = data?.comparison ? fillDays(data.comparison.byDay, data.comparison.range.start, data.comparison.range.end) : []
  const sortedDays = [...days].sort((a, b) => sortAsc ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day))
  const pagedDays = sortedDays.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE)
  const totalPages = Math.ceil(sortedDays.length / TABLE_PAGE_SIZE)

  const campaignNotStarted = data?.campaignNotStarted ?? false

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Desempenho da campanha</h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Acompanhe as exibições e os cliques do seu destaque.</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={period} onChange={e => setPeriod(e.target.value as DesempenhoPeriod)}
          className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ background: C.header, borderColor: C.border, color: C.text }}>
          {(Object.keys(DESEMP_PERIOD_LABEL) as DesempenhoPeriod[]).map(p => <option key={p} value={p} style={{ color: 'black' }}>{DESEMP_PERIOD_LABEL[p]}</option>)}
        </select>
        {period === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); updateQuery({ from: e.target.value || null }) }}
              className="rounded-lg border px-2 py-2 text-sm outline-none" style={{ background: C.header, borderColor: C.border, color: C.text, colorScheme: 'dark' }} aria-label="Data inicial" />
            <span style={{ color: C.textSecondary }}>—</span>
            <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); updateQuery({ to: e.target.value || null }) }}
              className="rounded-lg border px-2 py-2 text-sm outline-none" style={{ background: C.header, borderColor: C.border, color: C.text, colorScheme: 'dark' }} aria-label="Data final" />
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: C.text }}>
          <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Comparar período anterior
        </label>
        <button type="button" onClick={() => setRefreshKey(k => k + 1)} disabled={loadState === 'refreshing' || loadState === 'loading'}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: C.border, color: C.text }}>
          <RotateCcw size={14} className={loadState === 'refreshing' ? 'animate-spin' : ''} aria-hidden="true" /> Atualizar
        </button>
        <button type="button" onClick={exportCsv} disabled={!data}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
          <Download size={14} aria-hidden="true" /> Exportar dados
        </button>
      </div>

      {data && (
        <p className="text-xs" style={{ color: C.textSecondary }}>
          {formatDateTimeBR(data.range.start)} — {formatDateTimeBR(data.range.end)} (horário de Brasília)
          {data.range.clampedToNow ? ' · período contratado ainda em andamento, mostrando até agora' : ''}
          {' · '}Dados atualizados em {formatDateTimeBR(data.fetchedAt)}
          {loadState === 'refreshing' ? ' · atualizando…' : ''}
        </p>
      )}

      {loadState === 'error' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: C.error, color: C.text }}>
          <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
          {errorMsg ?? 'Não foi possível carregar as métricas.'}
          <button type="button" onClick={() => setRefreshKey(k => k + 1)} className="ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>Tentar novamente</button>
        </div>
      )}

      {loadState === 'loading' && !data && (
        <div className="space-y-4" aria-busy="true" aria-label="Carregando métricas">
          <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl" style={{ background: C.header }} />)}</div>
          <div className="h-64 animate-pulse rounded-xl" style={{ background: C.header }} />
        </div>
      )}

      {data && (
        <>
          {campaignNotStarted && (
            <p className="flex items-center gap-1.5 rounded-xl border p-3 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
              <Info size={13} style={{ color: C.primary }} aria-hidden="true" /> Esta campanha ainda não começou — não há veiculação possível antes de {formatDateTimeBR(data.campaignStartsAt)}.
            </p>
          )}
          {eligibility.key === 'cancelada' && (
            <p className="flex items-center gap-1.5 rounded-xl border p-3 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
              <Info size={13} style={{ color: C.warning }} aria-hidden="true" /> Esta campanha está cancelada — os resultados abaixo, quando existirem, são o histórico real registrado antes do cancelamento.
            </p>
          )}

          {/* Indicadores */}
          <div className="grid gap-3 sm:grid-cols-3">
            <IndicatorCard icon={Eye} label="IMPRESSÕES" value={numberBR(data.impressions)} hint="Exibições válidas registradas no período."
              delta={data.comparison ? deltaPercent(data.impressions, data.comparison.impressions) : null} />
            <IndicatorCard icon={MousePointerClick} label="CLIQUES" value={numberBR(data.clicks)} hint="Cliques válidos no destaque no período."
              delta={data.comparison ? deltaPercent(data.clicks, data.comparison.clicks) : null} />
            <IndicatorCard icon={Percent} label="CTR" value={data.ctr != null ? `${data.ctr.toLocaleString('pt-BR')}%` : '—'}
              hint={data.ctr != null ? 'Cliques ÷ impressões × 100.' : 'Sem impressões para calcular a taxa.'}
              delta={data.comparison && data.ctr != null && data.comparison.ctr != null ? { points: Number((data.ctr - data.comparison.ctr).toFixed(2)) } : null} />
          </div>

          {/* Evolução + Contexto */}
          <div className="grid gap-5 lg:grid-cols-[70fr_30fr]">
            <div className="min-w-0 rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Evolução no período</p>
                <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: C.border }}>
                  {(['impressions', 'clicks', 'ctr'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setMetric(m)} aria-pressed={metric === m}
                      className="rounded-md px-3 py-1.5 text-xs font-semibold" style={metric === m ? { background: C.primary, color: '#fff' } : { color: C.textSecondary }}>
                      {m === 'impressions' ? 'Impressões' : m === 'clicks' ? 'Cliques' : 'CTR'}
                    </button>
                  ))}
                </div>
              </div>
              {days.every(d => d.impressions === 0 && d.clicks === 0) ? (
                <div className="flex flex-col items-center gap-2 py-14 text-center">
                  <BarChart3 size={28} style={{ color: C.textSecondary }} aria-hidden="true" />
                  <p className="text-sm font-semibold" style={{ color: C.text }}>Nenhum evento registrado neste período.</p>
                  <p className="text-xs" style={{ color: C.textSecondary }}>Não há exibições ou cliques no período selecionado.</p>
                  <button type="button" onClick={() => setPeriod('30d')} className="text-xs font-semibold hover:underline" style={{ color: C.primary }}>Alterar período</button>
                </div>
              ) : (
                <EvolutionChart days={days} prevDays={compare ? prevDays : null} metric={metric} />
              )}
              <p className="mt-2 text-[11px]" style={{ color: C.textSecondary }}>Valores exatos por dia na tabela &quot;Resultados por dia&quot; abaixo — alternativa acessível ao gráfico.</p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
                <p className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Contexto da campanha</p>
                <div className="space-y-2 text-xs">
                  <Info2 label="Espaço contratado" value={space?.name ?? 'Não definido'} />
                  <Info2 label="Pacote contratado" value={pkg?.name ?? 'Não definido'} />
                  <Info2 label="Período contratado" value={`${formatDateTimeBR(campaign.startsAt)} — ${formatDateTimeBR(campaign.endsAt)}`} />
                  <Info2 label="Estado atual" value={campaignLifecycleBadge(eligibility).label} />
                  <Info2 label="Versão do criativo" value={liveCreative ? `v${liveCreative.version} (vinculada)` : 'Nenhuma vinculada'} />
                  <Info2 label="Cobertura de métricas" value={`Desde ${formatDateTimeBR(data.campaignCreatedAt)}`} />
                </div>
                {(eligibility.key !== 'em_exibicao' && eligibility.key !== 'programada' && eligibility.key !== 'encerrada') && (
                  <p className="mt-3 flex items-start gap-1.5 rounded-lg p-2 text-xs" style={{ background: `${C.error}18`, color: C.text }}>
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" style={{ color: C.error }} aria-hidden="true" /> {eligibility.reasons.join(' ')}
                  </p>
                )}
                <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: C.border }}>
                  <button type="button" onClick={onGoToConfig} className="flex w-full items-center justify-between text-xs font-semibold hover:underline" style={{ color: C.primary }}>Ver configuração <ChevronRight size={12} aria-hidden="true" /></button>
                  <button type="button" onClick={onGoToHistory} className="flex w-full items-center justify-between text-xs font-semibold hover:underline" style={{ color: C.primary }}>Consultar histórico <ChevronRight size={12} aria-hidden="true" /></button>
                  <button type="button" onClick={onGoToPreview} className="flex w-full items-center justify-between text-xs font-semibold hover:underline" style={{ color: C.primary }}>Abrir prévia <ChevronRight size={12} aria-hidden="true" /></button>
                </div>
              </div>
            </div>
          </div>

          {/* Resultados por dia + Atribuição */}
          <div className="grid gap-5 lg:grid-cols-[70fr_30fr]">
            <div className="min-w-0 space-y-3 rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Resultados por dia</p>
                {(Object.keys(data.byDevice).length > 0 || data.byCreative.length > 1) && (
                  <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: C.border }}>
                    <button type="button" onClick={() => setBreakdown('none')} className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={breakdown === 'none' ? { background: C.primary, color: '#fff' } : { color: C.textSecondary }}>Por dia</button>
                    {Object.keys(data.byDevice).length > 0 && <button type="button" onClick={() => setBreakdown('device')} className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={breakdown === 'device' ? { background: C.primary, color: '#fff' } : { color: C.textSecondary }}>Por dispositivo</button>}
                    {data.byCreative.length > 1 && <button type="button" onClick={() => setBreakdown('creative')} className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={breakdown === 'creative' ? { background: C.primary, color: '#fff' } : { color: C.textSecondary }}>Por versão do criativo</button>}
                  </div>
                )}
              </div>

              {breakdown === 'device' ? (
                <table className="w-full text-left text-xs">
                  <thead><tr style={{ color: C.textSecondary }}><th className="pb-2 font-semibold">Dispositivo</th><th className="pb-2 font-semibold">Impressões</th></tr></thead>
                  <tbody>{Object.entries(data.byDevice).map(([k, v]) => (
                    <tr key={k} className="border-t" style={{ borderColor: C.border, color: C.text }}><td className="py-1.5 capitalize">{k}</td><td className="py-1.5">{numberBR(v)}</td></tr>
                  ))}</tbody>
                </table>
              ) : breakdown === 'creative' ? (
                <table className="w-full text-left text-xs">
                  <thead><tr style={{ color: C.textSecondary }}><th className="pb-2 font-semibold">Versão</th><th className="pb-2 font-semibold">Impressões</th><th className="pb-2 font-semibold">Cliques</th></tr></thead>
                  <tbody>{data.byCreative.map(c => (
                    <tr key={c.creativeId} className="border-t" style={{ borderColor: C.border, color: C.text }}><td className="py-1.5">{c.version != null ? `v${c.version}` : 'Desconhecida'}</td><td className="py-1.5">{numberBR(c.impressions)}</td><td className="py-1.5">{numberBR(c.clicks)}</td></tr>
                  ))}</tbody>
                </table>
              ) : sortedDays.every(d => d.impressions === 0 && d.clicks === 0) ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <FileText size={22} style={{ color: C.textSecondary }} aria-hidden="true" />
                  <p className="text-sm" style={{ color: C.textSecondary }}>Nenhum resultado para este período.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-xs">
                    <thead>
                      <tr style={{ color: C.textSecondary }}>
                        <th className="pb-2 font-semibold">
                          <button type="button" onClick={() => setSortAsc(v => !v)} className="inline-flex items-center gap-1 hover:underline">Data <ArrowUpDown size={11} aria-hidden="true" /></button>
                        </th>
                        <th className="pb-2 font-semibold">Impressões</th>
                        <th className="pb-2 font-semibold">Cliques</th>
                        <th className="pb-2 font-semibold">CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedDays.map(d => (
                        <tr key={d.day} className="border-t" style={{ borderColor: C.border, color: C.text }}>
                          <td className="py-1.5">{formatDateTimeBR(`${d.day}T12:00:00Z`).split(',')[0]}</td>
                          <td className="py-1.5">{numberBR(d.impressions)}</td>
                          <td className="py-1.5">{numberBR(d.clicks)}</td>
                          <td className="py-1.5">{d.impressions > 0 ? `${((d.clicks / d.impressions) * 100).toFixed(2)}%` : '—'}</td>
                        </tr>
                      ))}
                      <tr className="border-t font-semibold" style={{ borderColor: C.border, color: C.text }}>
                        <td className="py-1.5">Total</td>
                        <td className="py-1.5">{numberBR(data.impressions)}</td>
                        <td className="py-1.5">{numberBR(data.clicks)}</td>
                        <td className="py-1.5">{data.ctr != null ? `${data.ctr}%` : '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {breakdown === 'none' && totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 text-xs" style={{ color: C.textSecondary }}>
                  <button type="button" onClick={() => setTablePage(p => Math.max(0, p - 1))} disabled={tablePage === 0} className="rounded-lg border px-2 py-1 disabled:opacity-40" style={{ borderColor: C.border }}>Anterior</button>
                  Página {tablePage + 1} de {totalPages}
                  <button type="button" onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))} disabled={tablePage >= totalPages - 1} className="rounded-lg border px-2 py-1 disabled:opacity-40" style={{ borderColor: C.border }}>Próxima</button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}
                title="Não há hoje um vínculo entre o clique no destaque e um pedido/assinatura do app anunciado.">
                Atribuição de vendas <Info size={13} style={{ color: C.textSecondary }} aria-hidden="true" />
              </p>
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <BarChart3 size={24} style={{ color: C.textSecondary }} aria-hidden="true" />
                <p className="text-xs" style={{ color: C.textSecondary }}>Este destaque mede exibições e cliques — vendas e receita atribuídas não são calculadas, pois não existe hoje um vínculo entre o clique e um pedido do app anunciado.</p>
              </div>
            </div>
          </div>

          <Accordion>
            <AccordionItem value="definicoes">
              <AccordionTrigger className="text-sm font-bold" style={{ color: C.text }}>Como calculamos os resultados</AccordionTrigger>
              <AccordionContent style={{ color: C.textSecondary }}>
                <div className="space-y-2 text-xs">
                  <p><strong style={{ color: C.text }}>Impressão:</strong> contada quando ao menos 50% do anúncio fica visível na tela por 1 segundo contínuo, com a aba em primeiro plano — no máximo uma vez por visita (mesmo identificador de sessão), mesmo se o carrossel pré-carregar outros slides.</p>
                  <p><strong style={{ color: C.text }}>Clique:</strong> contado quando o botão do anúncio é acionado numa página pública real — nunca em prévia administrativa, prévia do parceiro ou testes.</p>
                  <p><strong style={{ color: C.text }}>CTR:</strong> cliques ÷ impressões do próprio intervalo × 100 — nunca a média das taxas diárias.</p>
                  <p><strong style={{ color: C.text }}>Exclusões:</strong> este projeto não implementa filtragem de bots nem deduplicação de visitantes únicos — os números refletem eventos brutos que passaram pela regra de visibilidade acima.</p>
                  <p><strong style={{ color: C.text }}>Atribuição de vendas:</strong> não há hoje um vínculo entre o clique no destaque e um pedido/assinatura do app anunciado — por isso o card &quot;Atribuição de vendas&quot; não mostra números.</p>
                  <p><strong style={{ color: C.text }}>Atualização:</strong> os números refletem o momento da consulta (campo &quot;Dados atualizados em&quot;) — não há atraso de processamento em lote.</p>
                  <p><strong style={{ color: C.text }}>Cobertura disponível:</strong> desde {formatDateTimeBR(data.campaignCreatedAt)}, quando esta campanha foi criada.</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </div>
  )
}

function isValidDesempenhoPeriod(v: string | null): v is DesempenhoPeriod {
  return !!v && (['hoje', '7d', '30d', 'campanha', 'custom'] as const).includes(v as DesempenhoPeriod)
}

function deltaPercent(current: number, previous: number): { percent: number | null } {
  if (previous <= 0) return { percent: null }
  return { percent: Number((((current - previous) / previous) * 100).toFixed(1)) }
}

function IndicatorCard({ icon: Icon, label, value, hint, delta }: {
  icon: React.ElementType; label: string; value: string; hint: string
  delta: { percent: number | null } | { points: number } | null
}) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${C.primary}18` }}>
          <Icon size={15} style={{ color: C.primary }} aria-hidden="true" />
        </span>
        <p className="text-xs font-bold tracking-wide" style={{ color: C.textSecondary }}>{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
      <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{hint}</p>
      {delta && <DeltaLabel delta={delta} />}
    </div>
  )
}

function DeltaLabel({ delta }: { delta: { percent: number | null } | { points: number } }) {
  if ('points' in delta) {
    const Icon = delta.points > 0 ? TrendingUp : delta.points < 0 ? TrendingDown : Minus
    return (
      <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: delta.points > 0 ? C.success : delta.points < 0 ? C.error : C.textSecondary }}>
        <Icon size={12} aria-hidden="true" /> {delta.points > 0 ? '+' : ''}{delta.points.toLocaleString('pt-BR')} p.p. vs. período anterior
      </p>
    )
  }
  if (delta.percent === null) return <p className="mt-1.5 text-xs font-semibold" style={{ color: C.textSecondary }}>Sem base de comparação</p>
  const Icon = delta.percent > 0 ? TrendingUp : delta.percent < 0 ? TrendingDown : Minus
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: delta.percent > 0 ? C.success : delta.percent < 0 ? C.error : C.textSecondary }}>
      <Icon size={12} aria-hidden="true" /> {delta.percent > 0 ? '+' : ''}{delta.percent.toLocaleString('pt-BR')}% vs. período anterior
    </p>
  )
}

/** SVG simples e real — nada de curva ilustrativa: impressões/cliques em
 *  barras (contagem discreta por dia), CTR em linha reta ponto-a-ponto com
 *  lacuna real nos dias sem impressão (taxa indefinida, não zero). A tabela
 *  "Resultados por dia" logo abaixo é a alternativa acessível (seção 7). */
function EvolutionChart({ days, prevDays, metric }: { days: DayPoint[]; prevDays: DayPoint[] | null; metric: 'impressions' | 'clicks' | 'ctr' }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const width = 640, height = 220, padL = 32, padB = 24, padT = 10, padR = 8
  const plotW = width - padL - padR, plotH = height - padT - padB

  function valueOf(d: DayPoint): number | null {
    if (metric === 'impressions') return d.impressions
    if (metric === 'clicks') return d.clicks
    return d.impressions > 0 ? Number(((d.clicks / d.impressions) * 100).toFixed(2)) : null
  }

  const values = days.map(valueOf)
  const prevValues = prevDays?.map(valueOf) ?? []
  const maxVal = Math.max(1, ...values.filter((v): v is number => v !== null), ...prevValues.filter((v): v is number => v !== null))
  const n = days.length
  const stepX = n > 1 ? plotW / (n - 1) : 0
  const xFor = (i: number) => padL + (n > 1 ? i * stepX : plotW / 2)
  const yFor = (v: number) => padT + plotH - (v / maxVal) * plotH

  const tickCount = Math.min(6, n)
  const tickIdx = Array.from({ length: tickCount }, (_, i) => Math.round(i * (n - 1) / Math.max(1, tickCount - 1)))

  function linePath(vals: (number | null)[]) {
    let path = ''
    let started = false
    vals.forEach((v, i) => {
      if (v === null) { started = false; return }
      const cmd = started ? 'L' : 'M'
      path += `${cmd}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)} `
      started = true
    })
    return path.trim()
  }

  const isBar = metric !== 'ctr'
  const label = metric === 'impressions' ? 'impressões' : metric === 'clicks' ? 'cliques' : 'CTR'

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`Gráfico de ${label} por dia no período selecionado`} style={{ overflow: 'visible' }}>
        {[0, 0.5, 1].map(f => (
          <line key={f} x1={padL} x2={width - padR} y1={padT + plotH * f} y2={padT + plotH * f} stroke={C.border} strokeWidth={1} />
        ))}
        <text x={4} y={padT + 4} fontSize={9} fill={C.textSecondary}>{metric === 'ctr' ? `${maxVal}%` : numberBR(Math.round(maxVal))}</text>
        <text x={4} y={padT + plotH + 4} fontSize={9} fill={C.textSecondary}>0</text>

        {isBar ? days.map((d, i) => {
          const v = values[i] ?? 0
          const barW = Math.max(2, stepX * 0.5)
          const x = xFor(i) - barW / 2
          const y = yFor(v)
          return (
            <rect key={d.day} x={x} y={y} width={barW} height={Math.max(0, padT + plotH - y)} fill={C.primary} opacity={hoverIdx === i ? 1 : 0.75}
              onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} tabIndex={0}
              onFocus={() => setHoverIdx(i)} onBlur={() => setHoverIdx(null)} role="button" aria-label={`${d.day}: ${numberBR(metric === 'impressions' ? d.impressions : d.clicks)} ${label}`}>
              <title>{`${d.day}: ${numberBR(metric === 'impressions' ? d.impressions : d.clicks)} ${label}`}</title>
            </rect>
          )
        }) : (
          <>
            {prevDays && <path d={linePath(prevValues)} fill="none" stroke={C.textSecondary} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7} />}
            <path d={linePath(values)} fill="none" stroke={C.primary} strokeWidth={2} />
            {values.map((v, i) => v === null ? null : (
              <circle key={days[i].day} cx={xFor(i)} cy={yFor(v)} r={hoverIdx === i ? 4 : 2.5} fill={C.primary}
                onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} tabIndex={0}
                onFocus={() => setHoverIdx(i)} onBlur={() => setHoverIdx(null)} role="button" aria-label={`${days[i].day}: ${v}% de CTR`}>
                <title>{`${days[i].day}: ${v}% de CTR`}</title>
              </circle>
            ))}
          </>
        )}

        {tickIdx.map(i => (
          <text key={i} x={xFor(i)} y={height - 4} fontSize={9} fill={C.textSecondary} textAnchor="middle">{shortDay(days[i].day)}</text>
        ))}
      </svg>
      {hoverIdx !== null && (
        <p className="mt-1 text-center text-xs" style={{ color: C.text }}>
          {days[hoverIdx].day} — {metric === 'ctr'
            ? (values[hoverIdx] != null ? `${values[hoverIdx]}% de CTR` : 'Sem impressões')
            : `${numberBR(values[hoverIdx] ?? 0)} ${label}`}
        </p>
      )}
      {prevDays && metric === 'ctr' && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: C.textSecondary }}>
          <span className="inline-block h-0.5 w-4" style={{ background: C.primary }} /> período atual
          <span className="ml-2 inline-block h-0.5 w-4 border-t border-dashed" style={{ borderColor: C.textSecondary }} /> período anterior
        </p>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium" style={{ color: C.text }}>
      {label}
      {hint && <span className="mt-0.5 block text-[11px] font-normal" style={{ color: C.textSecondary }}>{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}
function Badge({ color, label, prefix }: { color: string; label: string; prefix?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${color}22`, color }}>
      {prefix && <span className="font-medium opacity-80">{prefix}:</span>} {label}
    </span>
  )
}

/** Estado real do CICLO DE VIDA da campanha — dimensão própria, separada de
 *  criativo/financeiro/exibição (seção 3: 4 rótulos com significado claro,
 *  não um "eligibility" composto disfarçado de 4º badge). Cancelada/pausada/
 *  agendada/encerrada vêm direto das mesmas checagens já usadas em
 *  computeCampaignEligibility (nunca uma segunda régua divergente); fora
 *  desses casos, a campanha em si está "ativa" mesmo que outra dimensão
 *  (criativo em revisão, pagamento pendente) seja o que impede a exibição. */
function campaignLifecycleBadge(eligibility: EligibilityResult): { label: string; color: string } {
  switch (eligibility.key) {
    case 'cancelada': return { label: 'Cancelada', color: C.textSecondary }
    case 'pausada': return { label: 'Pausada', color: C.warning }
    case 'programada': return { label: 'Agendada', color: C.primary }
    case 'encerrada': return { label: 'Encerrada', color: C.textSecondary }
    default: return { label: 'Ativa', color: C.success }
  }
}
function ActionButton({ icon: Icon, label, onClick, primary }: { icon: React.ElementType; label: string; onClick: () => void; primary?: boolean }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold" style={primary ? { background: C.primary, color: 'white' } : { border: `1px solid ${C.border}`, color: C.text }}><Icon size={13} aria-hidden="true" /> {label}</button>
}
function Info2({ label, value }: { label: string; value: string }) {
  return <div><p style={{ color: C.textSecondary }}>{label}</p><p className="mt-0.5 font-medium" style={{ color: C.text }}>{value}</p></div>
}
function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <div className="flex flex-col items-center gap-2 py-10 text-center"><Icon size={20} style={{ color: C.textSecondary }} aria-hidden="true" /><p className="text-sm" style={{ color: C.textSecondary }}>{text}</p></div>
}

/* ────────────────────────────────────────────────────────────────────────
 * Aba Histórico — auditoria somente leitura de app_admin_events.
 * Busca/filtro/ordenação/paginação sempre no backend (seção 5), nunca
 * reescreve eventos (seção 13), nunca reconstrói valores que não foram
 * registrados (seção 9). Ver /api/admin/campaigns/[id]/events{,/export}.
 * ──────────────────────────────────────────────────────────────────────── */

interface HistoryEventItem {
  id: string; action: string; reason: string | null; previousStatus: string | null; newStatus: string | null
  createdAt: string; actorId: string | null; actorName: string; actorOrigin: EventOrigin
  creativeId: string | null; internalNote: string | null; fieldChanges: FieldChange[] | null
}
interface HistorySummary {
  campaignCreatedAt: string; totalEvents: number
  lastActivity: (Pick<HistoryEventItem, 'createdAt' | 'action' | 'actorId' | 'actorName' | 'actorOrigin'>) | null
  lastCreativeDecision: { createdAt: string; action: string } | null
}
interface ActorOption { id: string; name: string }
interface EventsResponse { items: HistoryEventItem[]; total: number; page: number; pageSize: number; summary: HistorySummary; actorOptions: ActorOption[]; fetchedAt: string }

const HISTORY_PAGE_SIZE = 15
const CREATIVE_ACTIONS = new Set(['submit_creative', 'review_creative_approve', 'review_creative_changes', 'review_creative_reject'])

const ACTION_ICON: Record<string, React.ElementType> = {
  create_campaign: PlusCircle, submit_creative: Upload, review_creative_approve: CheckCircle2, review_creative_changes: MessageSquare,
  review_creative_reject: XCircle, promote_creative: Star, reserve_capacity: CalendarCheck, confirm_payment: CreditCard,
  payment_capacity_conflict: AlertTriangle, grant_exemption: ShieldCheck, refund_campaign: Undo2, pause_campaign: PauseCircle,
  resume_campaign: PlayCircle, cancel_campaign: Ban, reschedule_campaign: CalendarClock, duplicate_campaign: Copy,
  update_campaign_config: Settings, update_space: Settings, update_package: Settings,
}

/** Heurística de fallback só pra eventos LEGADOS (gravados antes da coluna
 *  `creative_id` existir em app_admin_events) — aproxima por proximidade de
 *  horário (submit → created_at da versão; revisão → reviewed_at). Eventos
 *  novos já têm o vínculo real (`item.creativeId`, ver resolveEventCreative
 *  abaixo) e nunca passam por aqui. */
function findLegacyMatchedCreative(action: string, createdAt: string, creatives: Creative[]): { creative: Creative; approximate: boolean } | null {
  if (!CREATIVE_ACTIONS.has(action)) return null
  const eventTs = new Date(createdAt).getTime()
  const candidates = creatives
    .map(c => ({ c, ts: action === 'submit_creative' ? c.createdAt : c.reviewedAt }))
    .filter((x): x is { c: Creative; ts: string } => !!x.ts)
    .map(x => ({ creative: x.c, diff: Math.abs(new Date(x.ts).getTime() - eventTs) }))
    .sort((a, b) => a.diff - b.diff)
  const best = candidates[0]
  if (!best || best.diff > 5 * 60 * 1000) return null
  return { creative: best.creative, approximate: best.diff > 2000 }
}

/** Versão do criativo de um evento — sempre exata quando `creativeId` está
 *  gravado (seção 10: nunca a versão ao vivo por padrão); só cai na
 *  heurística de horário pra eventos gravados antes dessa coluna existir. */
function resolveEventCreative(item: Pick<HistoryEventItem, 'action' | 'createdAt' | 'creativeId'>, creatives: Creative[]): { creative: Creative; exact: boolean; approximate: boolean } | null {
  if (item.creativeId) {
    const creative = creatives.find(c => c.id === item.creativeId)
    return creative ? { creative, exact: true, approximate: false } : null
  }
  const legacy = findLegacyMatchedCreative(item.action, item.createdAt, creatives)
  return legacy ? { creative: legacy.creative, exact: false, approximate: legacy.approximate } : null
}

function HistoricoTab({ campaign, creatives, onGoToConfig, onGoToPreview }: {
  campaign: CampaignInfo; creatives: Creative[]; onGoToConfig: () => void; onGoToPreview: (creativeId?: string) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [qDraft, setQDraft] = useState(searchParams.get('hq') ?? '')
  const [q, setQ] = useState(searchParams.get('hq') ?? '')
  const [category, setCategoryState] = useState<EventCategory | 'todos'>((searchParams.get('htype') as EventCategory) || 'todos')
  const [actor, setActorState] = useState(searchParams.get('hactor') ?? 'todos')
  const [from, setFromState] = useState(searchParams.get('hfrom') ?? '')
  const [to, setToState] = useState(searchParams.get('hto') ?? '')
  const [sort, setSortState] = useState<'recentes' | 'antigos'>(searchParams.get('hsort') === 'antigos' ? 'antigos' : 'recentes')
  const [page, setPageState] = useState(Number(searchParams.get('hpage') ?? 0) || 0)

  const [data, setData] = useState<EventsResponse | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error' | 'refreshing'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedEvent, setSelectedEvent] = useState<HistoryEventItem | null>(null)
  const [hasNewActivity, setHasNewActivity] = useState(false)
  const requestIdRef = useRef(0)
  const hasLoadedRef = useRef(false)
  const latestTopIdRef = useRef<string | null>(null)

  function updateQuery(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('tab', 'Histórico')
    for (const [k, v] of Object.entries(updates)) { if (v === null || v === '' || v === 'todos') next.delete(k); else next.set(k, v) }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }
  // Busca com debounce — nunca uma requisição por tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => { setQ(qDraft); setPageState(0); updateQuery({ hq: qDraft || null, hpage: null }) }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft])

  function setCategory(v: EventCategory | 'todos') { setCategoryState(v); setPageState(0); updateQuery({ htype: v === 'todos' ? null : v, hpage: null }) }
  function setActor(v: string) { setActorState(v); setPageState(0); updateQuery({ hactor: v === 'todos' ? null : v, hpage: null }) }
  function setFrom(v: string) { setFromState(v); setPageState(0); updateQuery({ hfrom: v || null, hpage: null }) }
  function setTo(v: string) { setToState(v); setPageState(0); updateQuery({ hto: v || null, hpage: null }) }
  function setSort(v: 'recentes' | 'antigos') { setSortState(v); setPageState(0); updateQuery({ hsort: v === 'recentes' ? null : v, hpage: null }) }
  function setPage(p: number) { setPageState(p); updateQuery({ hpage: p > 0 ? String(p) : null }) }

  const hasActiveFilters = !!q || category !== 'todos' || actor !== 'todos' || !!from || !!to
  function clearFilters() {
    setQDraft(''); setQ(''); setCategoryState('todos'); setActorState('todos'); setFromState(''); setToState(''); setSortState('recentes'); setPageState(0)
    updateQuery({ hq: null, htype: null, hactor: null, hfrom: null, hto: null, hsort: null, hpage: null })
  }

  useEffect(() => {
    let cancelled = false
    const myId = ++requestIdRef.current
    setLoadState(hasLoadedRef.current ? 'refreshing' : 'loading')
    setErrorMsg(null)
    const qs = new URLSearchParams({ sort, page: String(page) })
    if (q) qs.set('q', q)
    if (category !== 'todos') qs.set('type', category)
    if (actor !== 'todos') qs.set('actor', actor)
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    fetch(`/api/admin/campaigns/${campaign.id}/events?${qs.toString()}`)
      .then(async res => {
        const json = await res.json()
        if (cancelled || myId !== requestIdRef.current) return
        if (!res.ok) { setLoadState('error'); setErrorMsg(json.error || 'Falha ao carregar.'); return }
        setData(json)
        setLoadState('loaded')
        hasLoadedRef.current = true
        if (page === 0 && sort === 'recentes') latestTopIdRef.current = json.items[0]?.id ?? null
        setHasNewActivity(false)
      })
      .catch(() => { if (cancelled || myId !== requestIdRef.current) return; setLoadState('error'); setErrorMsg('Falha de conexão.') })
    return () => { cancelled = true }
  }, [q, category, actor, from, to, sort, page, refreshKey, campaign.id])

  // Detecta atividade nova sem deslocar a leitura (seção 15) — só checa
  // quando dá pra comparar com segurança (topo da lista, mais recentes
  // primeiro); nunca troca os dados sozinho, só mostra o aviso.
  useEffect(() => {
    if (page !== 0 || sort !== 'recentes' || loadState !== 'loaded') return
    const interval = setInterval(async () => {
      try {
        const qs = new URLSearchParams({ sort: 'recentes', page: '0' })
        if (q) qs.set('q', q)
        if (category !== 'todos') qs.set('type', category)
        if (actor !== 'todos') qs.set('actor', actor)
        if (from) qs.set('from', from)
        if (to) qs.set('to', to)
        const res = await fetch(`/api/admin/campaigns/${campaign.id}/events?${qs.toString()}`)
        if (!res.ok) return
        const json: EventsResponse = await res.json()
        const newestId = json.items[0]?.id ?? null
        if (newestId && latestTopIdRef.current && newestId !== latestTopIdRef.current) setHasNewActivity(true)
      } catch { /* verificação silenciosa — não interrompe a leitura */ }
    }, 60000)
    return () => clearInterval(interval)
  }, [page, sort, loadState, q, category, actor, from, to, campaign.id])

  function exportCsv() {
    const qs = new URLSearchParams({ sort })
    if (q) qs.set('q', q)
    if (category !== 'todos') qs.set('type', category)
    if (actor !== 'todos') qs.set('actor', actor)
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    window.open(`/api/admin/campaigns/${campaign.id}/events/export?${qs.toString()}`, '_blank')
  }

  const items = data?.items ?? []
  const totalPages = data ? Math.ceil(data.total / HISTORY_PAGE_SIZE) : 0
  const groups: { key: string; label: string; items: HistoryEventItem[] }[] = []
  for (const item of items) {
    const key = dateKeyBR(item.createdAt)
    const lastGroup = groups[groups.length - 1]
    if (lastGroup?.key === key) lastGroup.items.push(item)
    else groups.push({ key, label: formatDateLongBR(item.createdAt), items: [item] })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Histórico da campanha</h2>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Consulte as alterações, decisões e movimentações deste destaque.</p>
        </div>
        <button type="button" onClick={exportCsv} disabled={!data || data.summary.totalEvents === 0}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
          <Download size={14} aria-hidden="true" /> Exportar histórico
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[68fr_32fr]">
        <div className="min-w-0 space-y-4">
          {/* Filtros — sempre aplicados no backend (seção 5) */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border p-3" style={{ borderColor: C.border, background: C.header }}>
            <div className="relative min-w-[180px] flex-1">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
              <input value={qDraft} onChange={e => setQDraft(e.target.value)} placeholder="Buscar no histórico" aria-label="Buscar por descrição, responsável ou identificador"
                className="w-full rounded-lg border bg-transparent py-2 pl-8 pr-3 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
            </div>
            <label className="sr-only" htmlFor="hist-type">Tipo de evento</label>
            <select id="hist-type" value={category} onChange={e => setCategory(e.target.value as EventCategory | 'todos')}
              className="rounded-lg border bg-transparent px-2.5 py-2 text-xs outline-none" style={{ borderColor: C.border, color: C.text, background: C.header }}>
              {CATEGORY_OPTIONS.map(o => <option key={o.key} value={o.key} style={{ color: 'black' }}>{o.label}</option>)}
            </select>
            <label className="sr-only" htmlFor="hist-actor">Responsável</label>
            <select id="hist-actor" value={actor} onChange={e => setActor(e.target.value)}
              className="max-w-[160px] rounded-lg border bg-transparent px-2.5 py-2 text-xs outline-none" style={{ borderColor: C.border, color: C.text, background: C.header }}>
              <option value="todos" style={{ color: 'black' }}>Responsável: todos</option>
              {(data?.actorOptions ?? []).map(a => <option key={a.id} value={a.id} style={{ color: 'black' }}>{a.name}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <label className="sr-only" htmlFor="hist-from">Data inicial</label>
              <input id="hist-from" type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="Período — data inicial"
                className="rounded-lg border bg-transparent px-2 py-2 text-xs outline-none" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} />
              <span style={{ color: C.textSecondary }}>—</span>
              <label className="sr-only" htmlFor="hist-to">Data final</label>
              <input id="hist-to" type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="Período — data final"
                className="rounded-lg border bg-transparent px-2 py-2 text-xs outline-none" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} />
            </div>
            <label className="sr-only" htmlFor="hist-sort">Ordenação</label>
            <select id="hist-sort" value={sort} onChange={e => setSort(e.target.value as 'recentes' | 'antigos')}
              className="rounded-lg border bg-transparent px-2.5 py-2 text-xs outline-none" style={{ borderColor: C.border, color: C.text, background: C.header }}>
              <option value="recentes" style={{ color: 'black' }}>Mais recentes primeiro</option>
              <option value="antigos" style={{ color: 'black' }}>Mais antigos primeiro</option>
            </select>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold" style={{ borderColor: C.border, color: C.textSecondary }}>
                <X size={12} aria-hidden="true" /> Limpar filtros
              </button>
            )}
          </div>

          {hasNewActivity && (
            <div className="flex items-center gap-2 rounded-xl border p-2.5 text-xs" style={{ borderColor: C.primary, color: C.text, background: `${C.primary}12` }}>
              <Info size={13} style={{ color: C.primary }} aria-hidden="true" />
              Há novas atividades registradas.
              <button type="button" onClick={() => setRefreshKey(k => k + 1)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-white" style={{ background: C.primary }}>
                <RotateCcw size={11} aria-hidden="true" /> Atualizar
              </button>
            </div>
          )}

          {loadState === 'error' && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: C.error, color: C.text }}>
              <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
              {errorMsg ?? 'Não foi possível carregar o histórico.'}
              <button type="button" onClick={() => setRefreshKey(k => k + 1)} className="ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>Tentar novamente</button>
            </div>
          )}

          {loadState === 'loading' && !data && (
            <div className="space-y-3" aria-busy="true" aria-label="Carregando histórico">
              {[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl" style={{ background: C.header }} />)}
            </div>
          )}

          {data && (
            <>
              <p className="text-xs" style={{ color: C.textSecondary }}>
                {data.total} {data.total === 1 ? 'evento encontrado' : 'eventos encontrados'}
                {loadState === 'refreshing' ? ' · atualizando…' : ''}
              </p>

              {data.summary.totalEvents === 0 ? (
                <EmptyState icon={HistoryIcon} text="Nenhum evento registrado ainda para esta campanha." />
              ) : data.total === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border py-10 text-center" style={{ borderColor: C.border }}>
                  <Inbox size={20} style={{ color: C.textSecondary }} aria-hidden="true" />
                  <p className="text-sm font-semibold" style={{ color: C.text }}>Nenhum resultado para estes filtros.</p>
                  <button type="button" onClick={clearFilters} className="text-xs font-semibold hover:underline" style={{ color: C.primary }}>Limpar filtros</button>
                </div>
              ) : (
                <div className="space-y-6">
                  {groups.map(group => (
                    <div key={group.key}>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: C.textSecondary }}>{group.label}</p>
                      <div className="relative space-y-3 border-l pl-4" style={{ borderColor: C.border }}>
                        {group.items.map(item => (
                          <TimelineEventCard key={item.id} item={item} creatives={creatives} onDetails={() => setSelectedEvent(item)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} variant="dark" className="pt-1" />
              )}
            </>
          )}
        </div>

        <HistorySidebar summary={data?.summary ?? null} onGoToConfig={onGoToConfig} onGoToPreview={() => onGoToPreview()} />
      </div>

      {selectedEvent && (
        <EventDetailDialog event={selectedEvent} creatives={creatives} onClose={() => setSelectedEvent(null)} onOpenPreview={onGoToPreview} />
      )}
    </div>
  )
}

function TimelineEventCard({ item, creatives, onDetails }: { item: HistoryEventItem; creatives: Creative[]; onDetails: () => void }) {
  const meta = getActionMeta(item.action)
  const Icon = ACTION_ICON[item.action] ?? Info
  const tone = TONE_COLOR[meta.tone]
  const matched = resolveEventCreative(item, creatives)
  const legacyMislabel = isLegacyCancelMislabel(item.action, item.newStatus)

  const prevLabel = isDateRangeStatus(item.action) ? (item.previousStatus ? formatDateTimeBR(item.previousStatus) : null) : (item.previousStatus ? getStatusLabel(item.previousStatus).label : null)
  const newLabel = isDateRangeStatus(item.action) ? (item.newStatus ? formatDateTimeBR(item.newStatus) : null) : (item.newStatus ? getStatusLabel(item.newStatus).label : null)

  return (
    <div className="relative">
      <span className="absolute -left-[21px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: `${tone}22`, boxShadow: `0 0 0 4px ${C.card}` }}>
        <Icon size={12} style={{ color: tone }} aria-hidden="true" />
      </span>
      <div className="rounded-2xl border p-3.5" style={{ borderColor: C.border, background: C.header }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold" style={{ color: C.text }}>{meta.label}</p>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${tone}18`, color: tone }}>{CATEGORY_LABEL[meta.category]}</span>
            </div>
            <p className="mt-0.5 text-xs" style={{ color: C.textSecondary }}>
              {item.actorName} · {originLabel(item.actorOrigin)} · {formatDateTimeBR(item.createdAt)}
            </p>
          </div>
          <button type="button" onClick={onDetails} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline" style={{ color: C.primary }}>
            Ver detalhes <ChevronRight size={12} aria-hidden="true" />
          </button>
        </div>
        {item.action === 'update_campaign_config' ? (
          item.fieldChanges ? (
            <p className="mt-2 text-xs" style={{ color: C.textSecondary }}>Campos alterados: {item.fieldChanges.map(f => f.label).join(', ')}.</p>
          ) : parseChangedFields(item.reason) && (
            <p className="mt-2 text-xs" style={{ color: C.textSecondary }}>Campos alterados: {parseChangedFields(item.reason)!.join(', ')}.</p>
          )
        ) : item.reason && (
          <p className="mt-2 text-xs" style={{ color: C.textSecondary }}>
            {(item.action === 'review_creative_changes' || item.action === 'review_creative_reject') ? 'Mensagem enviada ao parceiro: ' : 'Motivo: '}{item.reason}
          </p>
        )}
        {(prevLabel || newLabel) && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: C.text }}>
            {prevLabel && <span className="rounded-md px-1.5 py-0.5" style={{ background: `${C.textSecondary}18` }}>{prevLabel}</span>}
            {prevLabel && newLabel && <ArrowRightSmall />}
            {newLabel && <span className="rounded-md px-1.5 py-0.5 font-semibold" style={{ background: `${tone}18`, color: tone }}>{newLabel}</span>}
            {legacyMislabel && <span className="text-[10px] font-normal" style={{ color: C.textSecondary }}>(registro legado — ver detalhes)</span>}
          </p>
        )}
        {matched && <p className="mt-2 text-[11px]" style={{ color: C.textSecondary }}>Versão {matched.creative.version}{!matched.exact ? ' (associada por horário — registro legado)' : ''}</p>}
      </div>
    </div>
  )
}
function ArrowRightSmall() { return <ChevronRight size={11} aria-hidden="true" style={{ color: C.textSecondary }} /> }

function HistorySidebar({ summary, onGoToConfig, onGoToPreview }: { summary: HistorySummary | null; onGoToConfig: () => void; onGoToPreview: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
        <p className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Resumo do histórico</p>
        {!summary ? (
          <p className="text-xs" style={{ color: C.textSecondary }}>Carregando…</p>
        ) : (
          <div className="space-y-3 text-xs">
            <Info2 label="Criação da campanha" value={formatDateTimeBR(summary.campaignCreatedAt)} />
            {summary.lastActivity && (
              <div>
                <p style={{ color: C.textSecondary }}>Última atividade</p>
                <p className="mt-0.5 font-medium" style={{ color: C.text }}>{formatDateTimeBR(summary.lastActivity.createdAt)}</p>
                <p className="mt-0.5" style={{ color: C.textSecondary }}>{getActionMeta(summary.lastActivity.action).label} · {summary.lastActivity.actorName}</p>
              </div>
            )}
            {summary.lastCreativeDecision && (
              <Info2 label="Última decisão do criativo" value={`${getActionMeta(summary.lastCreativeDecision.action).label} · ${formatDateTimeBR(summary.lastCreativeDecision.createdAt)}`} />
            )}
            <Info2 label="Total de eventos" value={`${summary.totalEvents} (todo o histórico, ignora filtros ativos)`} />
            <p className="border-t pt-2 text-[11px]" style={{ borderColor: C.border, color: C.textSecondary }}>
              Algumas ações anteriores ao início da auditoria podem não estar disponíveis.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>
          <ShieldCheck size={14} style={{ color: C.primary }} aria-hidden="true" /> Registro de alterações
        </p>
        <p className="text-xs" style={{ color: C.textSecondary }}>Consulte quem realizou cada ação e os detalhes registrados no momento da alteração.</p>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${C.textSecondary}18`, color: C.textSecondary }}>
          <Lock size={9} aria-hidden="true" /> Somente leitura
        </span>
      </div>

      <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
        <p className="mb-2 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Ações rápidas</p>
        <div className="space-y-1.5">
          <button type="button" onClick={onGoToConfig} className="flex w-full items-center justify-between text-xs font-semibold hover:underline" style={{ color: C.primary }}>Ver configuração <ChevronRight size={12} aria-hidden="true" /></button>
          <button type="button" onClick={onGoToPreview} className="flex w-full items-center justify-between text-xs font-semibold hover:underline" style={{ color: C.primary }}>Abrir prévia <ChevronRight size={12} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  )
}

function DiffRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-t py-1.5 text-xs first:border-t-0" style={{ borderColor: C.border }}>
      <span style={{ color: C.textSecondary }}>{label}</span>
      <span className="col-span-2" style={{ color: C.text }}>{value}</span>
    </div>
  )
}

function EventDetailDialog({ event, creatives, onClose, onOpenPreview }: {
  event: HistoryEventItem; creatives: Creative[]; onClose: () => void; onOpenPreview: (creativeId?: string) => void
}) {
  const meta = getActionMeta(event.action)
  const isDateRange = isDateRangeStatus(event.action)
  const prev = event.previousStatus ? (isDateRange ? { label: formatDateTimeBR(event.previousStatus), raw: event.previousStatus, known: true } : getStatusLabel(event.previousStatus)) : null
  const next = event.newStatus ? (isDateRange ? { label: formatDateTimeBR(event.newStatus), raw: event.newStatus, known: true } : getStatusLabel(event.newStatus)) : null
  const legacyMislabel = isLegacyCancelMislabel(event.action, event.newStatus)
  // Campos alterados: prefere o registro real (before/after gravados desde
  // a migration de auditoria mais rica); só cai no parse de `reason` (só
  // nomes de campo, sem valores) pra eventos gravados antes dela existir.
  const realFieldChanges = event.fieldChanges
  const legacyChangedFieldNames = !realFieldChanges ? parseChangedFields(event.reason) : null
  const duplicateSource = parseDuplicateSource(event.reason)
  const matched = resolveEventCreative(event, creatives)
  const isPartnerMessage = event.action === 'review_creative_changes' || event.action === 'review_creative_reject'
  const hasRawDetails = (prev && !prev.known) || (next && !next.known) || legacyMislabel

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto border" style={{ background: C.card, borderColor: C.border, color: C.text }}>
        <DialogTitle style={{ color: C.text }}>{meta.label}</DialogTitle>
        <div className="space-y-1 text-sm">
          <button type="button" onClick={() => { navigator.clipboard.writeText(event.id); toast.success('ID do evento copiado.') }}
            className="inline-flex items-center gap-1 text-xs" style={{ color: C.textSecondary }}>
            ID: {event.id.slice(0, 8)}… <Copy size={11} aria-hidden="true" />
          </button>

          <div className="mt-2 space-y-0 rounded-xl border" style={{ borderColor: C.border }}>
            <DiffRow label="Categoria" value={CATEGORY_LABEL[meta.category]} />
            <DiffRow label="Data e hora" value={`${formatDateTimeBR(event.createdAt)} (horário de Brasília)`} />
            <DiffRow label="Responsável" value={`${event.actorName} · ${originLabel(event.actorOrigin)}`} />
            {realFieldChanges ? (
              <DiffRow label="Campos alterados" value={realFieldChanges.map(f => f.label).join(', ')} />
            ) : legacyChangedFieldNames ? (
              <DiffRow label="Campos alterados" value={legacyChangedFieldNames.join(', ')} />
            ) : event.reason ? (
              <DiffRow label={isPartnerMessage ? 'Mensagem ao parceiro' : 'Motivo'} value={event.reason} />
            ) : null}
            {prev && <DiffRow label="Estado anterior" value={prev.label} />}
            {next && <DiffRow label="Estado posterior" value={next.label} />}
            {matched && (
              <div className="grid grid-cols-3 gap-2 border-t py-1.5 text-xs" style={{ borderColor: C.border }}>
                <span style={{ color: C.textSecondary }}>Versão do criativo</span>
                <span className="col-span-2 flex items-center gap-2" style={{ color: C.text }}>
                  Versão {matched.creative.version}{!matched.exact && ' (associada por horário — registro legado, sem vínculo direto)'}
                  <button type="button" onClick={() => { onClose(); onOpenPreview(matched.creative.id) }} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: C.primary }}>
                    Abrir prévia <ExternalLink size={10} aria-hidden="true" />
                  </button>
                </span>
              </div>
            )}
            {CREATIVE_ACTIONS.has(event.action) && !matched && (
              <DiffRow label="Versão do criativo" value="Não identificada com segurança neste registro." />
            )}
            {event.internalNote && <DiffRow label="Nota interna" value={event.internalNote} />}
            {duplicateSource && <DiffRow label="Referência relacionada" value={`Duplicada a partir da campanha ${duplicateSource.slice(0, 8)}…`} />}
          </div>

          {realFieldChanges && (
            <div className="mt-3 overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
              <table className="w-full text-left text-xs">
                <thead><tr style={{ color: C.textSecondary }}><th className="p-2 font-semibold">Campo</th><th className="p-2 font-semibold">Antes</th><th className="p-2 font-semibold">Depois</th></tr></thead>
                <tbody>
                  {realFieldChanges.map(f => (
                    <tr key={f.field} className="border-t" style={{ borderColor: C.border, color: C.text }}>
                      <td className="p-2">{f.label}</td>
                      <td className="p-2">{f.before ?? 'Valor anterior não registrado'}</td>
                      <td className="p-2">{f.after ?? 'Valor não registrado neste evento'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {legacyChangedFieldNames && (
            <div className="mt-3 overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
              <table className="w-full text-left text-xs">
                <thead><tr style={{ color: C.textSecondary }}><th className="p-2 font-semibold">Campo</th><th className="p-2 font-semibold">Antes</th><th className="p-2 font-semibold">Depois</th></tr></thead>
                <tbody>
                  {legacyChangedFieldNames.map(f => (
                    <tr key={f} className="border-t" style={{ borderColor: C.border, color: C.text }}>
                      <td className="p-2 capitalize">{f}</td>
                      <td className="p-2" style={{ color: C.textSecondary }}>Valor anterior não registrado</td>
                      <td className="p-2" style={{ color: C.textSecondary }}>Valor não registrado neste evento</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="p-2 text-[11px]" style={{ color: C.textSecondary, borderTop: `1px solid ${C.border}` }}>
                Registro legado: este evento registrou quais campos mudaram, mas não os valores antes/depois — não há snapshot pra reconstruir.
              </p>
            </div>
          )}

          {legacyMislabel && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border p-2.5 text-xs" style={{ borderColor: C.warning, color: C.text, background: `${C.warning}12` }}>
              <AlertCircle size={13} className="mt-0.5 shrink-0" style={{ color: C.warning }} aria-hidden="true" />
              <span>Registro legado: esta versão do sistema gravava &quot;Encerrada&quot; para todo cancelamento manual. O estado atual real desta campanha é <strong>Cancelada</strong> — o valor acima é o que foi gravado no momento, preservado sem alteração.</span>
            </div>
          )}

          {hasRawDetails && (
            <Accordion className="mt-3">
              <AccordionItem value="tecnico">
                <AccordionTrigger className="text-xs font-semibold" style={{ color: C.textSecondary }}>Detalhes técnicos</AccordionTrigger>
                <AccordionContent style={{ color: C.textSecondary }}>
                  <div className="space-y-1 text-[11px]">
                    <p>Ação: <code>{event.action}</code></p>
                    {event.previousStatus && <p>Código anterior: <code>{event.previousStatus}</code></p>}
                    {event.newStatus && <p>Código posterior: <code>{event.newStatus}</code></p>}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
