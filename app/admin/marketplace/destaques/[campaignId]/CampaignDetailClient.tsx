'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Copy, PauseCircle, PlayCircle, StopCircle,
  Info, History as HistoryIcon, Loader2, CheckCircle2, XCircle, MessageSquare, CreditCard, Upload, Monitor, Smartphone, Tablet,
  Maximize2, ExternalLink, Settings, AlertTriangle,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import Link from 'next/link'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import MarketplaceTabs from '@/components/admin/MarketplaceTabs'
import AppLogo from '@/components/admin/AppLogo'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import SponsoredCarouselSection from '@/components/sections/SponsoredCarouselSection'
import { MARKETPLACE_COLORS as C, formatDateTimeBR, ORIGIN_LABEL, type PublicationStatus } from '@/lib/marketplace'
import { getCreativeReviewBadge, type CampaignStatusBadge } from '@/lib/services/campaign-labels'
import type { EligibilityResult } from '@/lib/services/campaigns'

interface CampaignInfo { id: string; internalName: string | null; startsAt: string; endsAt: string; spaceId: string | null; packageId: string | null; pausedReason: string | null; createdAt: string; updatedAt: string }
interface AppInfo { id: string; name: string; logoUrl: string | null; applicationSlug: string | null }
interface SpaceRef { id: string; name: string; slug?: string }
interface PackageRef { id: string; name: string; price: number | null; currency: string; durationDays: number }
interface PackageOption extends PackageRef { spaceId: string }
interface Creative {
  id: string; version: number; title: string | null; description: string | null; imageUrl: string | null; imageAlt: string | null
  ctaLabel: string | null; ctaHref: string | null; reviewStatus: string; reviewerNotes: string | null; partnerFeedback: string | null
  reviewedAt: string | null; isLive: boolean; reviewerName: string | null; createdAt: string
}
interface Purchase { id: string; amount: number; currency: string; kind: string; status: string; isentoReason: string | null; refundStatus: string | null; createdAt: string; paidAt: string | null }
interface EventItem { id: string; action: string; reason: string | null; previous_status: string | null; new_status: string | null; actorName: string; created_at: string }

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
  events: EventItem[]
}

const TABS = ['Prévia', 'Configuração', 'Desempenho', 'Histórico'] as const
type Tab = typeof TABS[number]
const ACTION_LABEL: Record<string, string> = {
  create_campaign: 'Campanha criada', submit_creative: 'Anúncio enviado para revisão', review_creative_approve: 'Anúncio aprovado',
  review_creative_changes: 'Ajustes solicitados', review_creative_reject: 'Anúncio rejeitado', reserve_capacity: 'Espaço reservado',
  confirm_payment: 'Pagamento confirmado', payment_capacity_conflict: 'Pagamento confirmado com pendência de conciliação',
  grant_exemption: 'Isenção concedida', refund_campaign: 'Reembolso solicitado', pause_campaign: 'Exibição pausada',
  resume_campaign: 'Exibição retomada', cancel_campaign: 'Campanha encerrada', reschedule_campaign: 'Reagendada', duplicate_campaign: 'Duplicada',
}

export default function CampaignDetailClient({ user, profile, campaign, app, origin, partnerName, publication, review, payment, eligibility, space, pkg, spaceOptions, packageOptions, creatives, purchases, events }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Prévia')
  const [busy, setBusy] = useState(false)
  const [confirmKind, setConfirmKind] = useState<'pause' | 'resume' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')

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
    const label = confirmKind === 'pause' ? 'pausada' : confirmKind === 'resume' ? 'retomada' : 'encerrada'
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
                  {origin === 'lobby' ? ORIGIN_LABEL.lobby : `${ORIGIN_LABEL.partner} · ${partnerName}`} · Atualizado em {formatDateTimeBR(campaign.updatedAt)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={publication.color} label={publication.label} />
              <Badge color={review.color} label={review.label} />
              <Badge color={payment.color} label={payment.label} />
              <Badge color={eligibility.color} label={eligibility.label} />
              {(eligibility.key === 'em_exibicao' || eligibility.key === 'programada') && <ActionButton icon={PauseCircle} label="Pausar" onClick={() => { setReason(''); setConfirmKind('pause') }} />}
              {eligibility.key === 'pausada' && <ActionButton icon={PlayCircle} label="Retomar" onClick={() => setConfirmKind('resume')} primary />}
              {eligibility.key !== 'cancelada' && eligibility.key !== 'encerrada' && <ActionButton icon={StopCircle} label="Encerrar" onClick={() => { setReason(''); setConfirmKind('cancel') }} />}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-xs sm:grid-cols-4" style={{ borderColor: C.border }}>
            <Info2 label="Espaço" value={space?.name ?? 'Não definido'} />
            <Info2 label="Pacote" value={pkg?.name ?? 'Não definido'} />
            <Info2 label="Período (horário de Brasília)" value={`${formatDateTimeBR(campaign.startsAt)} — ${formatDateTimeBR(campaign.endsAt)}${
              eligibility.key === 'programada' ? ' · agendada, ainda não começou' : eligibility.key === 'encerrada' ? ' · período encerrado' : ''
            }`} />
            <Info2 label="Atualizado" value={formatDateTimeBR(campaign.updatedAt)} />
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
          {tab === 'Prévia' && <PreviaTab campaign={campaign} app={app} space={space} creatives={creatives} onGoToConfig={() => setTab('Configuração')} />}
          {tab === 'Configuração' && (
            <ConfiguracaoTab campaign={campaign} app={app} draftCreative={draftCreative} pendingCreative={pendingCreative} liveCreative={liveCreative}
              spaceOptions={spaceOptions} packageOptions={packageOptions} purchases={purchases} isLeader={!!profile?.is_leader}
              onChanged={() => router.refresh()} />
          )}
          {tab === 'Desempenho' && <DesempenhoTab campaignId={campaign.id} />}
          {tab === 'Histórico' && (
            events.length === 0 ? <EmptyState icon={HistoryIcon} text="Nenhuma ação registrada ainda para esta campanha." /> : (
              <ul className="space-y-2">
                {events.map(e => (
                  <li key={e.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: C.border }}>
                    <p style={{ color: C.text }}>{ACTION_LABEL[e.action] ?? e.action} por {e.actorName}</p>
                    {e.reason && <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>Motivo: {e.reason}</p>}
                    {(e.previous_status || e.new_status) && <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{e.previous_status} → {e.new_status}</p>}
                    <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(e.created_at)}</p>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmKind} onOpenChange={next => !busy && setConfirmKind(next ? confirmKind : null)}
        icon={confirmKind === 'pause' ? PauseCircle : confirmKind === 'resume' ? PlayCircle : StopCircle}
        variant={confirmKind === 'resume' ? 'neutral' : 'destructive'}
        title={confirmKind === 'pause' ? 'Pausar exibição?' : confirmKind === 'resume' ? 'Retomar exibição?' : 'Encerrar campanha?'}
        description={
          <div className="space-y-3">
            <p>
              {confirmKind === 'pause' && 'Deixa de participar do carrossel imediatamente. Período e reserva não são alterados automaticamente.'}
              {confirmKind === 'resume' && 'Revalida revisão, pagamento e reserva antes de voltar a exibir.'}
              {confirmKind === 'cancel' && 'Pagamentos e histórico são preservados — nada é apagado.'}
            </p>
            {(confirmKind === 'pause' || confirmKind === 'cancel') && (
              <label className="block text-xs font-medium" style={{ color: C.text }}>Motivo
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm text-white outline-none" style={{ borderColor: C.border }} />
              </label>
            )}
          </div>
        }
        confirmLabel={confirmKind === 'pause' ? 'Pausar' : confirmKind === 'resume' ? 'Retomar' : 'Encerrar'}
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

function PreviaTab({ campaign, app, space, creatives, onGoToConfig }: {
  campaign: CampaignInfo; app: AppInfo; space: SpaceRef | null; creatives: Creative[]; onGoToConfig: () => void
}) {
  const sorted = [...creatives].sort((a, b) => b.version - a.version)
  const defaultCreative = sorted.find(c => c.isLive) ?? sorted[0] ?? null
  const [selectedId, setSelectedId] = useState<string | null>(defaultCreative?.id ?? null)
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

function ConfiguracaoTab({ campaign, app, draftCreative, pendingCreative, liveCreative, spaceOptions, packageOptions, purchases, isLeader, onChanged }: {
  campaign: CampaignInfo; app: AppInfo; draftCreative: Creative | null; pendingCreative: Creative | null; liveCreative: Creative | null
  spaceOptions: SpaceRef[]; packageOptions: PackageOption[]; purchases: Purchase[]; isLeader: boolean; onChanged: () => void
}) {
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const editable = draftCreative ?? liveCreative
  const [form, setForm] = useState({
    title: editable?.title ?? '', description: editable?.description ?? '', imageUrl: editable?.imageUrl ?? '',
    imageAlt: editable?.imageAlt ?? '', ctaLabel: editable?.ctaLabel ?? 'Conhecer aplicativo',
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [spaceId, setSpaceId] = useState(campaign.spaceId ?? spaceOptions[0]?.id ?? '')
  const [packageId, setPackageId] = useState(campaign.packageId ?? '')
  const [startsAt, setStartsAt] = useState(campaign.startsAt.slice(0, 16))
  const [endsAt, setEndsAt] = useState(campaign.endsAt.slice(0, 16))
  const [exemptReason, setExemptReason] = useState('')
  const [showExempt, setShowExempt] = useState(false)

  const canEditCreative = !pendingCreative

  async function uploadImage(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/campaigns/upload-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Falha no upload.'); return }
      setForm(f => ({ ...f, imageUrl: data.url }))
      toast.success('Imagem enviada.')
    } catch { toast.error('Falha de conexão.') }
    finally { setUploading(false) }
  }

  async function saveCreative() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/creative`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível salvar.'); return }
      toast.success('Anúncio salvo.')
      onChanged()
    } catch { toast.error('Falha de conexão.') }
    finally { setSaving(false) }
  }

  async function submitForReview() {
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

  async function saveConfig() {
    const res = await fetch(`/api/admin/campaigns/${campaign.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: spaceId || null, package_id: packageId || null, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString() }),
    })
    if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Não foi possível salvar.'); return }
    toast.success('Configuração salva.')
    onChanged()
  }

  async function reserve() {
    const res = await fetch(`/api/admin/campaigns/${campaign.id}/reserve`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Não foi possível reservar.'); return }
    toast.success('Espaço reservado temporariamente.')
    onChanged()
  }

  async function checkout() {
    if (!packageId) { toast.error('Selecione um pacote.'); return }
    const res = await fetch(`/api/admin/campaigns/${campaign.id}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId }) })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Não foi possível iniciar a cobrança.'); return }
    if (data.url) window.location.href = data.url
  }

  async function grantExemption() {
    if (!exemptReason.trim()) { toast.error('Informe o motivo.'); return }
    const res = await fetch(`/api/admin/campaigns/${campaign.id}/exempt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: exemptReason.trim(), packageId: packageId || undefined }) })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Não foi possível conceder isenção.'); return }
    if (data.warning) toast.warning(data.warning); else toast.success('Isenção concedida.')
    setShowExempt(false)
    onChanged()
  }

  const previewItem = buildPreviewItem(app, form)

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      {/* Coluna esquerda: formulário do anúncio, organizado com rótulo + texto de apoio por campo */}
      <div className="space-y-6">
        <SectionHeader title="Anúncio" subtitle="O que aparece pro comprador no carrossel — título, imagem e chamada." />

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
          <div className="space-y-5 rounded-2xl border p-5" style={{ borderColor: C.border, background: C.header }}>
            <Field label="Título" hint="Frase curta e direta — é o que mais chama atenção no anúncio.">
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Crie fluxos visuais sem programar"
                className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
            </Field>
            <Field label="Descrição" hint="Uma ou duas linhas complementando o título.">
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Automatize tarefas e conecte suas ferramentas."
                className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
            </Field>
            <Field label="Imagem" hint="Formato 16:9, mínimo 800×450 — reaproveita a validação/compressão real de upload.">
              <div className="flex items-center gap-3">
                {form.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.imageUrl} alt="" className="h-16 w-24 rounded-lg border object-cover" style={{ borderColor: C.border }} />
                ) : (
                  <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed" style={{ borderColor: C.border, color: C.textSecondary }}>
                    <Upload size={16} aria-hidden="true" />
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
                  {uploading ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Upload size={13} aria-hidden="true" />} Enviar imagem
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
                </label>
              </div>
            </Field>
            <Field label="Texto alternativo da imagem" hint="Descrição curta pra leitores de tela.">
              <input value={form.imageAlt} onChange={e => setForm({ ...form, imageAlt: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
            </Field>
            <Field label="Texto do botão" hint="Chamada de ação — o destino é sempre a página do aplicativo, gerado automaticamente.">
              <input value={form.ctaLabel} onChange={e => setForm({ ...form, ctaLabel: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
            </Field>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: C.border }}>
              <button onClick={saveCreative} disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Salvar rascunho
              </button>
              <button onClick={submitForReview} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Enviar para revisão</button>
            </div>
          </div>
        )}

        <SectionHeader title="Espaço, pacote e período" subtitle="Onde e por quanto tempo a campanha roda." />
        <div className="space-y-4 rounded-2xl border p-5" style={{ borderColor: C.border, background: C.header }}>
          <Field label="Espaço de exibição">
            <select value={spaceId} onChange={e => { setSpaceId(e.target.value); setPackageId('') }} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
              <option value="" style={{ color: 'black' }}>Selecione…</option>
              {spaceOptions.map(s => <option key={s.id} value={s.id} style={{ color: 'black' }}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Pacote">
            <select value={packageId} onChange={e => setPackageId(e.target.value)} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
              <option value="" style={{ color: 'black' }}>Selecione…</option>
              {packageOptions.filter(p => !spaceId || p.spaceId === spaceId).map(p => <option key={p.id} value={p.id} style={{ color: 'black' }}>{p.name} — {p.price != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: p.currency }).format(p.price) : 'sem preço'}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início"><input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} /></Field>
            <Field label="Término"><input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} /></Field>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: C.border }}>
            <button onClick={saveConfig} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Salvar configuração</button>
            <button onClick={reserve} className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.primary, color: C.primary }}>Reservar espaço</button>
          </div>
        </div>

        <SectionHeader title="Pagamento" subtitle="Cobrança real via Stripe, ou isenção autorizada." />
        <div className="space-y-3 rounded-2xl border p-5" style={{ borderColor: C.border, background: C.header }}>
          {purchases.length === 0 ? <EmptyState icon={CreditCard} text="Nenhuma cobrança criada ainda." /> : (
            <ul className="space-y-2">
              {purchases.map(p => (
                <li key={p.id} className="rounded-xl border p-3 text-xs" style={{ borderColor: C.border, color: C.text }}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: p.currency }).format(p.amount)} · {p.status} ({p.kind}) · {formatDateTimeBR(p.createdAt)}
                  {p.isentoReason && <span> · Motivo: {p.isentoReason}</span>}
                  {p.refundStatus && <span> · Reembolso: {p.refundStatus}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={checkout} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>Gerar cobrança (Stripe)</button>
            {isLeader && !showExempt && <button onClick={() => setShowExempt(true)} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Conceder isenção</button>}
          </div>
          {showExempt && (
            <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: C.border }}>
              <label className="block text-xs font-medium" style={{ color: C.text }}>Motivo da isenção
                <textarea value={exemptReason} onChange={e => setExemptReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
              </label>
              <div className="flex gap-2">
                <button onClick={grantExemption} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: C.primary }}>Confirmar isenção</button>
                <button onClick={() => setShowExempt(false)} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: C.border, color: C.text }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Coluna direita: prévia ao vivo, atualiza a cada tecla — mesmo padrão
          do editor de app do parceiro (split-pane form + prévia), adaptado
          ao tema escuro do admin. */}
      <div className="lg:sticky lg:top-6 lg:self-start space-y-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.header }}>
          <p className="mb-3 text-sm font-semibold" style={{ color: C.text }}>Prévia do anúncio</p>
          <div className="mb-3 flex items-center gap-2">
            <button type="button" onClick={() => setPreviewMode('desktop')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={previewMode === 'desktop' ? { background: `${C.primary}22`, color: C.primary } : { color: C.textSecondary }}>
              <Monitor size={14} aria-hidden="true" /> Desktop
            </button>
            <button type="button" onClick={() => setPreviewMode('mobile')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={previewMode === 'mobile' ? { background: `${C.primary}22`, color: C.primary } : { color: C.textSecondary }}>
              <Smartphone size={14} aria-hidden="true" /> Mobile
            </button>
            <span className="ml-auto text-[11px]" style={{ color: C.textSecondary }}>Prévia privada</span>
          </div>
          <div className="mx-auto overflow-hidden rounded-xl border transition-all" style={{ borderColor: C.border, maxWidth: previewMode === 'mobile' ? 360 : '100%' }}>
            <SponsoredCarouselSection campaigns={[previewItem]} isPreview />
          </div>
          <p className="mt-2 text-[11px]" style={{ color: C.textSecondary }}>Atualiza conforme você edita — nenhuma impressão ou clique real é gerado aqui.</p>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h3>
      <p className="mt-0.5 text-xs" style={{ color: C.textSecondary }}>{subtitle}</p>
    </div>
  )
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

function DesempenhoTab({ campaignId }: { campaignId: string }) {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState<{ impressions: number; clicks: number; ctr: number | null; byDevice: Record<string, number> } | null>(null)
  const loading = data === null

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/campaigns/${campaignId}/metrics?period=${period}`)
      .then(r => r.json()).then(d => { if (!cancelled) setData(d) })
    return () => { cancelled = true }
  }, [campaignId, period])

  return (
    <div className="space-y-4">
      <select value={period} onChange={e => setPeriod(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" style={{ background: C.header, borderColor: C.border, color: C.text }}>
        <option value="7d" style={{ color: 'black' }}>Últimos 7 dias</option>
        <option value="30d" style={{ color: 'black' }}>Últimos 30 dias</option>
        <option value="90d" style={{ color: 'black' }}>Últimos 90 dias</option>
      </select>
      {loading ? <Loader2 size={18} className="animate-spin" style={{ color: C.textSecondary }} aria-hidden="true" /> : data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Info2 label="Impressões" value={String(data.impressions)} />
            <Info2 label="Cliques" value={String(data.clicks)} />
            <Info2 label="CTR" value={data.ctr != null ? `${data.ctr}%` : '—'} />
          </div>
          {Object.keys(data.byDevice).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: C.textSecondary }}>Impressões por dispositivo</p>
              <div className="flex gap-3 text-xs" style={{ color: C.text }}>
                {Object.entries(data.byDevice).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
              </div>
            </div>
          )}
          <p className="text-xs" style={{ color: C.textSecondary }}>Conversão/receita atribuída não é exibida — não há janela de atribuição real implementada neste projeto.</p>
        </>
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
function Badge({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${color}22`, color }}>{label}</span>
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
