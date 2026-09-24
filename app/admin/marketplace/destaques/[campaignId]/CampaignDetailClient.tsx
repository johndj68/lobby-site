'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Grid3x3, Copy, PauseCircle, PlayCircle, StopCircle,
  Info, History as HistoryIcon, Loader2, CheckCircle2, XCircle, MessageSquare, CreditCard, Upload,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import SponsoredCarouselSection from '@/components/sections/SponsoredCarouselSection'
import { MARKETPLACE_COLORS as C, formatDateTimeBR, ORIGIN_LABEL, type PublicationStatus } from '@/lib/marketplace'
import type { CampaignStatusBadge, EligibilityResult } from '@/lib/services/campaigns'

interface CampaignInfo { id: string; internalName: string | null; startsAt: string; endsAt: string; spaceId: string | null; packageId: string | null; pausedReason: string | null; createdAt: string; updatedAt: string }
interface AppInfo { id: string; name: string; logoUrl: string | null; applicationSlug: string | null }
interface SpaceRef { id: string; name: string }
interface PackageRef { id: string; name: string; price: number | null; currency: string; durationDays: number }
interface PackageOption extends PackageRef { spaceId: string }
interface Creative {
  id: string; version: number; title: string | null; description: string | null; imageUrl: string | null; imageAlt: string | null
  ctaLabel: string | null; ctaHref: string | null; reviewStatus: string; reviewerNotes: string | null; partnerFeedback: string | null
  reviewedAt: string | null; isLive: boolean
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
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/admin/marketplace/destaques'))}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar às campanhas
        </button>

        <div className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              {app.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.logoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: C.header }}>
                  <Grid3x3 size={22} style={{ color: C.textSecondary }} aria-hidden="true" />
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{app.name} · {campaign.internalName ?? 'Campanha'}</h1>
                <button onClick={() => { navigator.clipboard.writeText(campaign.id); toast.success('ID da campanha copiado.') }}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs" style={{ color: C.textSecondary }}>
                  ID: {campaign.id.slice(0, 8)}… <Copy size={11} aria-hidden="true" />
                </button>
                <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{origin === 'lobby' ? ORIGIN_LABEL.lobby : `${ORIGIN_LABEL.partner} · ${partnerName}`}</p>
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
            <Info2 label="Período" value={`${formatDateTimeBR(campaign.startsAt)} — ${formatDateTimeBR(campaign.endsAt)}`} />
            <Info2 label="Atualizado" value={formatDateTimeBR(campaign.updatedAt)} />
          </div>
          {campaign.pausedReason && (
            <p className="mt-3 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.warning, color: C.text, background: 'rgba(245,158,11,0.08)' }}>Motivo da pausa: {campaign.pausedReason}</p>
          )}
          {eligibility.reasons.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
              <Info size={13} className="mt-0.5 shrink-0" style={{ color: C.primary }} aria-hidden="true" /><span>{eligibility.reasons.join(' ')}</span>
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
          {tab === 'Prévia' && <PreviaTab liveCreative={liveCreative} pendingCreative={pendingCreative} app={app} />}
          {tab === 'Configuração' && (
            <ConfiguracaoTab campaign={campaign} draftCreative={draftCreative} pendingCreative={pendingCreative} liveCreative={liveCreative}
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

function PreviaTab({ liveCreative, pendingCreative, app }: { liveCreative: Creative | null; pendingCreative: Creative | null; app: AppInfo }) {
  function toCarouselItem(c: Creative) {
    return {
      id: 'preview', application_id: app.id, title: c.title ?? '', description: c.description ?? '',
      campaign_image_url: c.imageUrl ?? undefined, image_alt: c.imageAlt ?? undefined, cta_label: c.ctaLabel ?? undefined,
      cta_href: c.ctaHref ?? undefined, creative_id: null, starts_at: new Date().toISOString(), ends_at: new Date().toISOString(),
      application: [{ id: app.id, name: app.name, slug: app.applicationSlug ?? '', category: '', logo_url: app.logoUrl ?? undefined }],
    }
  }
  return (
    <div className="space-y-6">
      <p className="flex items-center gap-1.5 text-xs" style={{ color: C.textSecondary }}>
        <Info size={12} aria-hidden="true" /> Prévia privada — nenhuma compra, impressão ou clique real é gerado aqui.
      </p>
      {liveCreative ? (
        <div>
          <p className="mb-2 text-xs font-semibold" style={{ color: C.textSecondary }}>Versão aprovada (no ar) — v{liveCreative.version}</p>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.border }}>
            <SponsoredCarouselSection campaigns={[toCarouselItem(liveCreative)]} isPreview />
          </div>
        </div>
      ) : <EmptyState icon={Info} text="Nenhuma versão aprovada ainda." />}
      {pendingCreative && (
        <div>
          <p className="mb-2 text-xs font-semibold" style={{ color: C.warning }}>Versão em análise — v{pendingCreative.version}</p>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.warning }}>
            <SponsoredCarouselSection campaigns={[toCarouselItem(pendingCreative)]} isPreview />
          </div>
        </div>
      )}
    </div>
  )
}

function ConfiguracaoTab({ campaign, draftCreative, pendingCreative, liveCreative, spaceOptions, packageOptions, purchases, isLeader, onChanged }: {
  campaign: CampaignInfo; draftCreative: Creative | null; pendingCreative: Creative | null; liveCreative: Creative | null
  spaceOptions: SpaceRef[]; packageOptions: PackageOption[]; purchases: Purchase[]; isLeader: boolean; onChanged: () => void
}) {
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <h3 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Anúncio</h3>
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
            <Field label="Título"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            <Field label="Descrição"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            <Field label="Imagem">
              <div className="flex items-center gap-2">
                {form.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.imageUrl} alt="" className="h-16 w-24 rounded-lg object-cover" style={{ borderColor: C.border }} />
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
                  {uploading ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Upload size={13} aria-hidden="true" />} Enviar imagem
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
                </label>
              </div>
            </Field>
            <Field label="Texto alternativo da imagem"><input value={form.imageAlt} onChange={e => setForm({ ...form, imageAlt: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            <Field label="Texto do botão"><input value={form.ctaLabel} onChange={e => setForm({ ...form, ctaLabel: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            <p className="text-xs" style={{ color: C.textSecondary }}>Destino do botão: gerado automaticamente a partir do aplicativo selecionado — nunca um link livre.</p>
            <div className="flex gap-2">
              <button onClick={saveCreative} disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Salvar rascunho
              </button>
              <button onClick={submitForReview} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Enviar para revisão</button>
            </div>
          </>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Espaço, pacote e período</h3>
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
        <div className="flex flex-wrap gap-2">
          <button onClick={saveConfig} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Salvar configuração</button>
          <button onClick={reserve} className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.primary, color: C.primary }}>Reservar espaço</button>
        </div>

        <h3 className="mt-2 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Pagamento</h3>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium" style={{ color: C.text }}>{label}<div className="mt-1">{children}</div></label>
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
