'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Grid3x3, Copy, ExternalLink, PauseCircle, PlayCircle, Archive,
  Info, Sparkles, History as HistoryIcon, ShieldCheck, Loader2, Plus, X, Eye,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MARKETPLACE_COLORS as C, formatDateTimeBR, ORIGIN_LABEL, type PublicationStatus, type ReviewStatus } from '@/lib/marketplace'
import { formatOfferPrice, type AvailabilityResult, type PlanStatus, type PromotionStatus } from '@/lib/services/offers'

interface OfferInfo {
  id: string; name: string; description: string | null; currency: string; price: number | null; billingPeriod: string | null
  features: string[]; limits: unknown; usersLimit: number | null; supportLevel: string | null
  activationMethod: string | null; activationInstructions: string | null
  status: PlanStatus; pausedReason: string | null; createdAt: string; updatedAt: string
}
interface AppInfo { id: string; name: string; logoUrl: string | null; category: string | null; applicationSlug: string | null }
interface ActivationConfig { activation_method: string | null; activation_link: string | null; support_email: string | null; instructions: unknown }
interface CodeStats { total: number; available: number; delivered: number; reserved: number; revoked: number }
interface PromotionItem {
  id: string; name: string | null; promo_price: number; original_price: number | null; discount_percentage: number | null
  starts_at: string; ends_at: string; timezone: string; unit_limit: number | null; eligible_for_daily_deals: boolean
  internal_note: string | null; status: PromotionStatus
}
interface EventItem { id: string; action: string; reason: string | null; previous_status: string | null; new_status: string | null; actorName: string; created_at: string }

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  initialTab?: 'Plano e preço' | 'Promoções'
  offer: OfferInfo
  app: AppInfo
  origin: 'lobby' | 'partner'
  partnerName: string
  publication: PublicationStatus
  review: ReviewStatus
  availability: AvailabilityResult
  activationConfig: ActivationConfig | null
  codeStats: CodeStats | null
  promotions: PromotionItem[]
  events: EventItem[]
}

const TABS = ['Resumo', 'Plano e preço', 'Promoções', 'Disponibilidade', 'Histórico'] as const
type Tab = typeof TABS[number]

const ACTION_LABEL: Record<string, string> = {
  create_offer: 'Oferta criada', update_plan_price: 'Preço alterado', pause_offer: 'Vendas pausadas',
  resume_offer: 'Vendas retomadas', archive_offer: 'Oferta arquivada',
  create_promotion: 'Promoção criada', update_promotion: 'Promoção atualizada', pause_promotion: 'Promoção pausada',
  cancel_promotion: 'Promoção cancelada', reactivate_promotion: 'Promoção reativada',
}
const BILLING_PERIODS: [string, string][] = [['one-time', 'Pagamento único'], ['monthly', 'Assinatura mensal'], ['yearly', 'Assinatura anual'], ['lifetime', 'Vitalício']]

export default function OfertaDetailClient({
  user, profile, initialTab, offer, app, origin, partnerName, publication, review, availability,
  activationConfig, codeStats, promotions, events,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab ?? 'Resumo')
  const [busy, setBusy] = useState(false)
  const [confirmKind, setConfirmKind] = useState<'pause' | 'resume' | 'archive' | null>(null)
  const [reason, setReason] = useState('')

  async function runAction(url: string, body: Record<string, unknown> | undefined, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return false }
      toast.success(successMsg)
      router.refresh()
      return true
    } catch { toast.error('Falha de conexão. Tente novamente.'); return false }
    finally { setBusy(false) }
  }

  async function confirmLifecycle() {
    if (!confirmKind) return
    if (confirmKind === 'pause' && !reason.trim()) { toast.error('Informe o motivo da pausa.'); return }
    const body = confirmKind === 'archive' ? { reason: reason.trim() || undefined } : confirmKind === 'pause' ? { reason: reason.trim() } : undefined
    const label = confirmKind === 'pause' ? 'pausada' : confirmKind === 'resume' ? 'retomada' : 'arquivada'
    const ok = await runAction(`/api/admin/offers/${offer.id}/${confirmKind}`, body, `Oferta ${label}.`)
    if (ok) setConfirmKind(null)
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/admin/marketplace/ofertas'))}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar às ofertas
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
                <h1 className="text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{app.name} · {offer.name}</h1>
                <button onClick={() => { navigator.clipboard.writeText(offer.id); toast.success('ID da oferta copiado.') }}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs" style={{ color: C.textSecondary }}>
                  ID da oferta: {offer.id.slice(0, 8)}… <Copy size={11} aria-hidden="true" />
                </button>
                <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
                  {origin === 'lobby' ? ORIGIN_LABEL.lobby : `${ORIGIN_LABEL.partner} · ${partnerName}`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={publication.color} label={publication.label} />
              <Badge color={review.color} label={review.label} />
              <Badge color={availability.color} label={availability.label} />
              {offer.status === 'active' && <ActionButton icon={PauseCircle} label="Pausar vendas" onClick={() => { setReason(''); setConfirmKind('pause') }} />}
              {offer.status === 'paused' && <ActionButton icon={PlayCircle} label="Retomar vendas" onClick={() => setConfirmKind('resume')} primary />}
              {offer.status !== 'archived' && <ActionButton icon={Archive} label="Arquivar" onClick={() => { setReason(''); setConfirmKind('archive') }} />}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-xs sm:grid-cols-4" style={{ borderColor: C.border }}>
            <Info2 label="Categoria" value={app.category || 'Sem categoria'} />
            <Info2 label="Preço vigente" value={formatOfferPrice(offer.price, offer.currency, offer.billingPeriod)} />
            <Info2 label="Criada em" value={formatDateTimeBR(offer.createdAt)} />
            <Info2 label="Atualizada em" value={formatDateTimeBR(offer.updatedAt)} />
          </div>
          {offer.status === 'paused' && offer.pausedReason && (
            <p className="mt-3 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.warning, color: C.text, background: 'rgba(245,158,11,0.08)' }}>
              Motivo da pausa: {offer.pausedReason}
            </p>
          )}
          {availability.reasons.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
              <Info size={13} className="mt-0.5 shrink-0" style={{ color: C.primary }} aria-hidden="true" />
              <span>{availability.reasons.join(' ')}</span>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-3 py-2.5 text-sm font-medium"
              style={{ color: tab === t ? C.primary : C.textSecondary, borderBottom: tab === t ? `2px solid ${C.primary}` : '2px solid transparent' }}>
              {t}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          {tab === 'Resumo' && (
            <ResumoTab app={app} offer={offer} partnerName={partnerName} origin={origin} publication={publication} review={review} availability={availability} />
          )}
          {tab === 'Plano e preço' && <PlanoPrecoTab offer={offer} onSaved={() => router.refresh()} />}
          {tab === 'Promoções' && <PromocoesTab offerId={offer.id} offerPrice={offer.price} currency={offer.currency} billingPeriod={offer.billingPeriod} promotions={promotions} onChanged={() => router.refresh()} />}
          {tab === 'Disponibilidade' && <DisponibilidadeTab availability={availability} activationConfig={activationConfig} codeStats={codeStats} />}
          {tab === 'Histórico' && (
            events.length === 0 ? <EmptyState icon={HistoryIcon} text="Nenhuma ação administrativa registrada ainda para esta oferta." /> : (
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
        icon={confirmKind === 'pause' ? PauseCircle : confirmKind === 'resume' ? PlayCircle : Archive}
        variant={confirmKind === 'resume' ? 'neutral' : 'destructive'}
        title={confirmKind === 'pause' ? 'Pausar novas vendas?' : confirmKind === 'resume' ? 'Retomar novas vendas?' : 'Arquivar oferta?'}
        description={
          <div className="space-y-3">
            <p>
              {confirmKind === 'pause' && 'Deixa de aceitar novas compras imediatamente. Assinaturas e pedidos anteriores não são afetados.'}
              {confirmKind === 'resume' && 'Os requisitos de publicação serão revalidados antes de voltar a aceitar novas compras.'}
              {confirmKind === 'archive' && 'Sai de comercialização. Pedidos, códigos e histórico anteriores são preservados — nada é apagado.'}
            </p>
            {(confirmKind === 'pause' || confirmKind === 'archive') && (
              <label className="block text-xs font-medium" style={{ color: C.text }}>
                Motivo{confirmKind === 'pause' ? '' : ' (opcional)'}
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm text-white outline-none" style={{ borderColor: C.border }} />
              </label>
            )}
          </div>
        }
        confirmLabel={confirmKind === 'pause' ? 'Pausar' : confirmKind === 'resume' ? 'Retomar' : 'Arquivar'}
        confirmingLabel={<><Loader2 size={15} className="animate-spin" />Aplicando…</>}
        busy={busy}
        onConfirm={confirmLifecycle}
      />
    </AdminShell>
  )
}

function ResumoTab({ app, offer, partnerName, origin, publication, review, availability }: {
  app: AppInfo; offer: OfferInfo; partnerName: string; origin: 'lobby' | 'partner'
  publication: PublicationStatus; review: ReviewStatus; availability: AvailabilityResult
}) {
  return (
    <div className="space-y-5 text-sm" style={{ color: C.text }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Info2 label="Aplicativo" value={app.name} />
        <Info2 label="Plano" value={offer.name} />
        <Info2 label="Organização responsável" value={origin === 'lobby' ? ORIGIN_LABEL.lobby : partnerName} />
        <Info2 label="Estado de revisão" value={review.label} />
        <Info2 label="Estado de publicação" value={publication.label} />
        <Info2 label="Disponibilidade" value={availability.label} />
      </div>
      {availability.reasons.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold" style={{ color: C.textSecondary }}>Resumo das pendências</p>
          <ul className="space-y-1 text-xs" style={{ color: C.warning }}>
            {availability.reasons.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/marketplace/solicitacoes" className="flex items-center justify-between rounded-xl border p-3 text-xs font-semibold" style={{ borderColor: C.border, color: C.primary }}>
          Ver solicitações de revisão <ExternalLink size={13} aria-hidden="true" />
        </Link>
        {app.applicationSlug && publication.key === 'publicado' ? (
          <a href={`/app/${app.applicationSlug}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border p-3 text-xs font-semibold" style={{ borderColor: C.border, color: C.primary }}>
            Ver página pública <ExternalLink size={13} aria-hidden="true" />
          </a>
        ) : (
          <div title="Só existe depois de publicado" className="flex items-center justify-between rounded-xl border p-3 text-xs font-semibold opacity-40" style={{ borderColor: C.border, color: C.textSecondary }}>
            Ver página pública <ExternalLink size={13} aria-hidden="true" />
          </div>
        )}
        <div title='Destaque patrocinado: a participação no carrossel patrocinado possui contratação e programação próprias (área ainda não implementada em /admin/marketplace/destaques)' className="flex items-center justify-between rounded-xl border p-3 text-xs font-semibold opacity-40" style={{ borderColor: C.border, color: C.textSecondary }}>
          Destaque patrocinado <ExternalLink size={13} aria-hidden="true" />
        </div>
      </div>
      <PreviaComercial offer={offer} />
    </div>
  )
}

function PreviaComercial({ offer, promotion }: { offer: OfferInfo; promotion?: PromotionItem | null }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: C.header }}>
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.textSecondary }}>
        <Eye size={13} aria-hidden="true" /> Prévia comercial (privada — nenhuma compra real é processada aqui)
      </p>
      <div className="max-w-xs rounded-xl border p-4" style={{ borderColor: C.border, background: C.card }}>
        <p className="text-sm font-semibold" style={{ color: C.text }}>{offer.name}</p>
        {promotion ? (
          <div className="mt-1">
            <p className="text-lg font-bold" style={{ color: C.success, fontFamily: 'Space Grotesk, sans-serif' }}>{formatOfferPrice(promotion.promo_price, offer.currency, offer.billingPeriod)}</p>
            <p className="text-xs line-through" style={{ color: C.textSecondary }}>{formatOfferPrice(promotion.original_price ?? offer.price, offer.currency, offer.billingPeriod)}</p>
            <p className="mt-1 text-[11px]" style={{ color: C.textSecondary }}>Promoção até {formatDateTimeBR(promotion.ends_at)}</p>
          </div>
        ) : (
          <p className="mt-1 text-lg font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{formatOfferPrice(offer.price, offer.currency, offer.billingPeriod)}</p>
        )}
        {offer.features.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs" style={{ color: C.textSecondary }}>
            {offer.features.map((f, i) => <li key={i}>✓ {f}</li>)}
          </ul>
        )}
        {offer.activationMethod && <p className="mt-3 text-[11px]" style={{ color: C.textSecondary }}>Ativação: {offer.activationMethod}</p>}
      </div>
    </div>
  )
}

function PlanoPrecoTab({ offer, onSaved }: { offer: OfferInfo; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: offer.name, description: offer.description ?? '', currency: offer.currency, price: offer.price ?? 0, billingPeriod: offer.billingPeriod ?? 'one-time',
    usersLimit: offer.usersLimit ?? '', supportLevel: offer.supportLevel ?? '', activationMethod: offer.activationMethod ?? 'manual',
    activationInstructions: offer.activationInstructions ?? '',
  })
  const [features, setFeatures] = useState<string[]>(offer.features)
  const [newFeature, setNewFeature] = useState('')
  const [saving, setSaving] = useState(false)
  const dirty = form.name !== offer.name || form.price !== (offer.price ?? 0) || form.billingPeriod !== (offer.billingPeriod ?? 'one-time')
    || form.currency !== offer.currency || JSON.stringify(features) !== JSON.stringify(offer.features)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/offers/${offer.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, description: form.description || null, currency: form.currency, price: Number(form.price), billing_period: form.billingPeriod,
          features, users_limit: form.usersLimit === '' ? null : Number(form.usersLimit), support_level: form.supportLevel || null,
          activation_method: form.activationMethod || null, activation_instructions: form.activationInstructions || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível salvar.'); return }
      toast.success('Oferta atualizada.')
      onSaved()
    } catch { toast.error('Falha de conexão. Tente novamente.') }
    finally { setSaving(false) }
  }

  const disabledNote = offer.status === 'archived' ? 'Oferta arquivada — reative-a (fale com o time de produto) antes de editar.' : null

  return (
    <div className="max-w-xl space-y-4 text-sm" style={{ color: C.text }}>
      {disabledNote && (
        <p className="rounded-lg border p-2.5 text-xs" style={{ borderColor: C.error, color: C.text, background: 'rgba(239,68,68,0.08)' }}>{disabledNote}</p>
      )}
      <Field label="Nome do plano">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
      </Field>
      <Field label="Descrição comercial">
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Como esta oferta é apresentada ao comprador"
          className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Moeda">
          <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
        </Field>
        <Field label="Preço">
          <input type="number" min={0} step="0.01" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
        </Field>
      </div>
      <Field label="Modalidade de cobrança">
        <select value={form.billingPeriod} onChange={e => setForm({ ...form, billingPeriod: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
          {BILLING_PERIODS.map(([v, l]) => <option key={v} value={v} style={{ color: 'black' }}>{l}</option>)}
        </select>
      </Field>
      <p className="text-xs" style={{ color: C.textSecondary }}>{formatOfferPrice(Number(form.price) || null, form.currency, form.billingPeriod)}</p>

      <Field label="Recursos incluídos">
        <div className="flex flex-wrap gap-1.5">
          {features.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: C.header, color: C.text }}>
              {f} <button type="button" onClick={() => setFeatures(features.filter((_, j) => j !== i))}><X size={10} aria-hidden="true" /></button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input value={newFeature} onChange={e => setNewFeature(e.target.value)} placeholder="Adicionar recurso"
            className="flex-1 rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
          <button type="button" onClick={() => { if (newFeature.trim()) { setFeatures([...features, newFeature.trim()]); setNewFeature('') } }}
            className="rounded-lg border px-3" style={{ borderColor: C.border, color: C.primary }}><Plus size={14} aria-hidden="true" /></button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Limite de usuários">
          <input type="number" min={0} value={form.usersLimit} onChange={e => setForm({ ...form, usersLimit: e.target.value })} placeholder="Sem limite" className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
        </Field>
        <Field label="Nível de suporte">
          <input value={form.supportLevel} onChange={e => setForm({ ...form, supportLevel: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
        </Field>
      </div>
      <Field label="Forma de entrega/ativação">
        <select value={form.activationMethod} onChange={e => setForm({ ...form, activationMethod: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}>
          <option value="manual" style={{ color: 'black' }}>Manual (código de ativação)</option>
          <option value="api" style={{ color: 'black' }}>API</option>
          <option value="oauth" style={{ color: 'black' }}>OAuth</option>
          <option value="saas" style={{ color: 'black' }}>SaaS (acesso direto)</option>
        </select>
      </Field>
      <Field label="Condições de suporte, atualização e reembolso">
        <textarea value={form.activationInstructions} onChange={e => setForm({ ...form, activationInstructions: e.target.value })} rows={3}
          className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
      </Field>

      <div className="flex items-center gap-3">
        <button type="button" disabled={saving || offer.status === 'archived'} onClick={save}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
          {saving ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Salvando…</> : 'Salvar alterações'}
        </button>
        {dirty && !saving && <span className="text-xs" style={{ color: C.warning }}>Alterações não salvas</span>}
      </div>
      <p className="text-xs" style={{ color: C.textSecondary }}>
        Alterar preço aqui não modifica pedidos, assinaturas ou licenças já concedidas — vale só para novas vendas a partir de agora.
      </p>
    </div>
  )
}

function PromocoesTab({ offerId, offerPrice, currency, billingPeriod, promotions, onChanged }: {
  offerId: string; offerPrice: number | null; currency: string; billingPeriod: string | null; promotions: PromotionItem[]; onChanged: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', discountPercent: '', promoPrice: '', startsAt: '', endsAt: '', unitLimit: '', eligibleForDailyDeals: false, internalNote: '' })
  const [reactivating, setReactivating] = useState<string | null>(null)
  const [newDates, setNewDates] = useState({ startsAt: '', endsAt: '' })

  const hasOpenPromo = promotions.some(p => p.status.key === 'ativa' || p.status.key === 'programada')

  async function create() {
    if (offerPrice == null) { toast.error('Defina o preço regular na aba "Plano e preço" antes de criar uma promoção.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/offers/${offerId}/promotions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || null,
          discountPercent: form.discountPercent ? Number(form.discountPercent) : undefined,
          promoPrice: form.promoPrice ? Number(form.promoPrice) : undefined,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
          unitLimit: form.unitLimit ? Number(form.unitLimit) : undefined,
          eligibleForDailyDeals: form.eligibleForDailyDeals,
          internalNote: form.internalNote || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível criar a promoção.'); return }
      toast.success('Promoção criada.')
      setShowForm(false)
      onChanged()
    } catch { toast.error('Falha de conexão. Tente novamente.') }
    finally { setSaving(false) }
  }

  async function act(promotionId: string, action: 'pause' | 'resume' | 'cancel' | 'reactivate', extra?: Record<string, unknown>) {
    const res = await fetch(`/api/admin/offers/promotions/${promotionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return }
    toast.success('Promoção atualizada.')
    setReactivating(null)
    onChanged()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: C.textSecondary }}>Promoções não se empilham — apenas uma vigente por vez para esta oferta.</p>
        {!showForm && (
          <button type="button" disabled={hasOpenPromo} title={hasOpenPromo ? 'Já existe uma promoção ativa ou programada para esta oferta.' : undefined}
            onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" style={{ background: C.primary }}>
            <Plus size={13} aria-hidden="true" /> Nova promoção
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border p-4 space-y-3 text-sm" style={{ borderColor: C.border }}>
          <Field label="Nome interno"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desconto percentual"><input type="number" min={1} max={99} value={form.discountPercent} onChange={e => setForm({ ...form, discountPercent: e.target.value, promoPrice: '' })} placeholder="Ex: 30" className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
            <Field label="Ou preço promocional"><input type="number" min={0} step="0.01" value={form.promoPrice} onChange={e => setForm({ ...form, promoPrice: e.target.value, discountPercent: '' })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
          </div>
          {offerPrice != null && (form.discountPercent || form.promoPrice) && (
            <p className="text-xs" style={{ color: C.success }}>
              Preço final: {formatOfferPrice(form.discountPercent ? Math.round(offerPrice * (100 - Number(form.discountPercent))) / 100 : Number(form.promoPrice), currency, billingPeriod)} (regular: {formatOfferPrice(offerPrice, currency, billingPeriod)})
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início"><input type="datetime-local" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} /></Field>
            <Field label="Término"><input type="datetime-local" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} /></Field>
          </div>
          <p className="text-[11px]" style={{ color: C.textSecondary }}>Fuso: America/Sao_Paulo · início inclusivo, término exclusivo.</p>
          <Field label="Limite de unidades (opcional)"><input type="number" min={1} value={form.unitLimit} onChange={e => setForm({ ...form, unitLimit: e.target.value })} placeholder="Sem limite" className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
          <label className="flex items-start gap-2 text-xs" style={{ color: C.text }}>
            <input type="checkbox" checked={form.eligibleForDailyDeals} onChange={e => setForm({ ...form, eligibleForDailyDeals: e.target.checked })} className="mt-0.5" />
            <span>Elegível para promoções do dia<br /><span style={{ color: C.textSecondary }}>A oferta poderá ser selecionada para a seção de promoções enquanto estiver válida e disponível. Isto não garante exibição.</span></span>
          </label>
          <Field label="Observação interna (opcional)"><textarea value={form.internalNote} onChange={e => setForm({ ...form, internalNote: e.target.value })} rows={2} className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} /></Field>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={create} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null} Criar promoção
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Cancelar</button>
          </div>
        </div>
      )}

      {promotions.length === 0 ? <EmptyState icon={Sparkles} text="Nenhuma promoção cadastrada ainda para esta oferta." /> : (
        <ul className="space-y-2">
          {promotions.map(p => (
            <li key={p.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: C.border }}>
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ color: C.text }}>{p.name || 'Promoção sem nome interno'} <Badge color={p.status.color} label={p.status.label} /></p>
                  <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
                    {formatOfferPrice(p.promo_price, currency, billingPeriod)} {p.discount_percentage != null && `(-${p.discount_percentage}%)`} · {formatDateTimeBR(p.starts_at)} → {formatDateTimeBR(p.ends_at)}
                  </p>
                  {p.eligible_for_daily_deals && <p className="mt-1 text-[11px]" style={{ color: C.textSecondary }}>Elegível para promoções do dia</p>}
                  {p.internal_note && <p className="mt-1 text-[11px]" style={{ color: C.textSecondary }}>Nota: {p.internal_note}</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {(p.status.key === 'ativa' || p.status.key === 'programada') && <button onClick={() => act(p.id, 'pause')} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.border, color: C.warning }}>Pausar</button>}
                  {p.status.key === 'pausada' && <button onClick={() => act(p.id, 'resume')} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.primary, color: C.primary }}>Retomar</button>}
                  {p.status.key !== 'cancelada' && p.status.key !== 'encerrada' && <button onClick={() => act(p.id, 'cancel')} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.border, color: C.error }}>Cancelar</button>}
                  {p.status.key === 'encerrada' && (
                    reactivating === p.id ? (
                      <div className="flex items-center gap-1">
                        <input type="datetime-local" value={newDates.startsAt} onChange={e => setNewDates({ ...newDates, startsAt: e.target.value })} className="rounded border bg-transparent p-1 text-[11px]" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} />
                        <input type="datetime-local" value={newDates.endsAt} onChange={e => setNewDates({ ...newDates, endsAt: e.target.value })} className="rounded border bg-transparent p-1 text-[11px]" style={{ borderColor: C.border, color: C.text, colorScheme: 'dark' }} />
                        <button onClick={() => act(p.id, 'reactivate', { startsAt: new Date(newDates.startsAt).toISOString(), endsAt: new Date(newDates.endsAt).toISOString() })} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.primary, color: C.primary }}>OK</button>
                      </div>
                    ) : <button onClick={() => setReactivating(p.id)} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.border, color: C.text }}>Reativar</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div title='Destaque patrocinado: a participação no carrossel patrocinado possui contratação e programação próprias (área ainda não implementada em /admin/marketplace/destaques)'
        className="rounded-xl border p-3 text-xs opacity-60" style={{ borderColor: C.border, color: C.textSecondary }}>
        Destaque patrocinado tem contratação e programação próprias, separadas de promoções de preço.
      </div>
    </div>
  )
}

function DisponibilidadeTab({ availability, activationConfig, codeStats }: { availability: AvailabilityResult; activationConfig: ActivationConfig | null; codeStats: CodeStats | null }) {
  const factors: { label: string; ok: boolean }[] = [
    { label: 'Aplicativo publicado e elegível', ok: availability.key !== 'nao_publicado' },
    { label: 'Sem pausa administrativa nesta oferta', ok: availability.key !== 'pausada' && availability.key !== 'arquivada' },
    { label: 'Sem bloqueios de pendência (revisão, ativação, parceiro)', ok: availability.key !== 'bloqueada_por_pendencia' },
    { label: 'Estoque de código disponível (quando aplicável)', ok: availability.key !== 'sem_estoque' },
  ]
  return (
    <div className="space-y-4 text-sm" style={{ color: C.text }}>
      <div className="flex items-center gap-2">
        <Badge color={availability.color} label={availability.label} />
      </div>
      <ul className="space-y-2">
        {factors.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-xs" style={{ color: f.ok ? C.text : C.error }}>
            <ShieldCheck size={13} style={{ color: f.ok ? C.success : C.error }} aria-hidden="true" /> {f.label}
          </li>
        ))}
      </ul>
      {codeStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Info2 label="Disponíveis" value={String(codeStats.available)} />
          <Info2 label="Reservados" value={String(codeStats.reserved)} />
          <Info2 label="Entregues" value={String(codeStats.delivered)} />
          <Info2 label="Invalidados" value={String(codeStats.revoked)} />
        </div>
      )}
      <div className="rounded-lg border p-3 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
        Checkout de aplicativos ainda não é uma integração real neste projeto — hoje só pacotes de créditos internos têm cobrança via Stripe no site. A disponibilidade acima reflete a prontidão do catálogo (publicação, revisão, ativação, estoque), não uma compra ao vivo.
      </div>
      {activationConfig?.activation_link && <Info2 label="Link de ativação" value={activationConfig.activation_link} />}
      {activationConfig?.support_email && <Info2 label="E-mail de suporte" value={activationConfig.support_email} />}
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
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
      style={primary ? { background: C.primary, color: 'white' } : { border: `1px solid ${C.border}`, color: C.text }}>
      <Icon size={13} aria-hidden="true" /> {label}
    </button>
  )
}
function Info2({ label, value }: { label: string; value: string }) {
  return <div><p style={{ color: C.textSecondary }}>{label}</p><p className="mt-0.5 font-medium" style={{ color: C.text }}>{value}</p></div>
}
function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <div className="flex flex-col items-center gap-2 py-10 text-center"><Icon size={20} style={{ color: C.textSecondary }} aria-hidden="true" /><p className="text-sm" style={{ color: C.textSecondary }}>{text}</p></div>
}
