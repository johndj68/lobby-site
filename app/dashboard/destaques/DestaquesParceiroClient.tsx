'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Upload, ChevronDown, ChevronUp } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

interface AppOption { id: string; name: string; logoUrl: string | null }
interface PackageOption { id: string; spaceId: string; name: string; description: string | null; durationDays: number; price: number | null; currency: string; cancellationPolicy: string | null; pausePolicy: string | null }
interface SpaceOption { id: string; name: string }
interface Badge { key: string; label: string; color: string }
interface Creative { id: string; version: number; title: string | null; description: string | null; imageUrl: string | null; imageAlt: string | null; ctaLabel: string | null; reviewStatus: string; partnerFeedback: string | null; isLive: boolean }
interface CampaignRow {
  id: string; internalName: string | null; appName: string; appLogoUrl: string | null
  spaceId: string | null; packageId: string | null; startsAt: string; endsAt: string
  review: Badge; payment: Badge; eligibility: Badge & { reasons: string[] }
  creatives: Creative[]
}

export default function DestaquesParceiroClient({ apps, campaigns, spaces, packages }: {
  apps: AppOption[]; campaigns: CampaignRow[]; spaces: SpaceOption[]; packages: PackageOption[]
}) {
  const router = useRouter()
  const [showNew, setShowNew] = useState(false)
  const [newAppId, setNewAppId] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function createCampaign() {
    if (!newAppId || !newName.trim()) { toast.error('Selecione o aplicativo e informe um nome.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appDraftId: newAppId, internalName: newName.trim(), spaceId: spaces[0]?.id }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível criar a campanha.'); return }
      toast.success('Rascunho criado.')
      setShowNew(false)
      setExpanded(data.id)
      router.refresh()
    } catch { toast.error('Falha de conexão.') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold" style={{ color: colors.text }}>Destaques patrocinados</h1>
        <p style={{ color: colors.textSecondary }}>Contrate a exibição do seu aplicativo no carrossel principal da home da LOBBY.</p>
      </div>

      {!showNew ? (
        <button onClick={() => setShowNew(true)} disabled={apps.length === 0} className="rounded-lg px-5 py-2.5 font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.primary }}>
          + Nova campanha
        </button>
      ) : (
        <div className="max-w-lg space-y-3 rounded-2xl border p-5" style={{ borderColor: colors.border }}>
          <label className="block text-sm font-semibold" style={{ color: colors.text }}>Aplicativo
            <select value={newAppId} onChange={e => setNewAppId(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" style={{ borderColor: colors.border, color: colors.text }}>
              <option value="">Selecione…</option>
              {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold" style={{ color: colors.text }}>Nome interno
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Campanha de lançamento" className="mt-1 w-full rounded-lg border p-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
          </label>
          <div className="flex gap-2">
            <button onClick={createCampaign} disabled={saving} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.primary }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null} Criar rascunho
            </button>
            <button onClick={() => setShowNew(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: colors.border, color: colors.text }}>Cancelar</button>
          </div>
        </div>
      )}
      {apps.length === 0 && <p className="text-sm" style={{ color: colors.textSecondary }}>Você precisa ter ao menos um aplicativo publicado para contratar destaque.</p>}

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed p-12 text-center" style={{ borderColor: colors.border }}>
          <p style={{ color: colors.textSecondary }}>Nenhuma campanha ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="rounded-2xl border p-4" style={{ borderColor: colors.border }}>
              <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="flex w-full items-center justify-between text-left">
                <div className="flex items-center gap-3">
                  {c.appLogoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.appLogoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  )}
                  <div>
                    <p className="font-semibold" style={{ color: colors.text }}>{c.appName} · {c.internalName ?? 'Campanha'}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>{new Date(c.startsAt).toLocaleDateString('pt-BR')} até {new Date(c.endsAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill badge={c.review} />
                  <StatusPill badge={c.payment} />
                  <StatusPill badge={c.eligibility} />
                  {expanded === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>
              {expanded === c.id && <CampaignEditor campaign={c} packages={packages.filter(p => !c.spaceId || p.spaceId === c.spaceId)} onChanged={() => router.refresh()} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusPill({ badge }: { badge: Badge }) {
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${badge.color}22`, color: badge.color }}>{badge.label}</span>
}

function CampaignEditor({ campaign, packages, onChanged }: { campaign: CampaignRow; packages: PackageOption[]; onChanged: () => void }) {
  const draftOrPending = campaign.creatives.find(cr => cr.reviewStatus === 'rascunho' || cr.reviewStatus === 'ajustes_solicitados')
  const pending = campaign.creatives.find(cr => cr.reviewStatus === 'em_revisao')
  const live = campaign.creatives.find(cr => cr.isLive)
  const editable = draftOrPending ?? live

  const [form, setForm] = useState({ title: editable?.title ?? '', description: editable?.description ?? '', imageUrl: editable?.imageUrl ?? '', ctaLabel: editable?.ctaLabel ?? 'Conhecer aplicativo' })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [packageId, setPackageId] = useState(campaign.packageId ?? packages[0]?.id ?? '')
  const [accepted, setAccepted] = useState(false)
  const [paying, setPaying] = useState(false)

  const selectedPackage = packages.find(p => p.id === packageId)

  async function uploadImage(file: File) {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/campaigns/upload-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Falha no upload.'); return }
      setForm(f => ({ ...f, imageUrl: data.url }))
    } catch { toast.error('Falha de conexão.') }
    finally { setUploading(false) }
  }

  async function saveAndMaybeSubmit(submit: boolean) {
    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/creative`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível salvar.'); return }
      if (submit) {
        const res2 = await fetch(`/api/campaigns/${campaign.id}/submit`, { method: 'POST' })
        const data2 = await res2.json()
        if (!res2.ok) { toast.error(data2.error || 'Não foi possível enviar para revisão.'); return }
        toast.success('Enviado para revisão.')
      } else toast.success('Rascunho salvo.')
      onChanged()
    } catch { toast.error('Falha de conexão.') }
    finally { setSaving(false) }
  }

  async function pay() {
    if (!packageId) { toast.error('Selecione um pacote.'); return }
    if (!accepted) { toast.error('É preciso aceitar as condições do pacote.'); return }
    setPaying(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId, acceptedTerms: true }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível iniciar o pagamento.'); return }
      if (data.url) window.location.href = data.url
    } catch { toast.error('Falha de conexão.') }
    finally { setPaying(false) }
  }

  return (
    <div className="mt-4 space-y-4 border-t pt-4" style={{ borderColor: colors.border }}>
      {pending && <p className="rounded-lg p-2 text-xs" style={{ background: '#F59E0B22', color: '#92400E' }}>Uma versão do anúncio está em análise pelo time LOBBY.</p>}
      {live?.reviewStatus === 'rejeitado' && live.partnerFeedback && <p className="rounded-lg p-2 text-xs" style={{ background: '#EF444422', color: '#991B1B' }}>Rejeitado: {live.partnerFeedback}</p>}
      {editable?.reviewStatus === 'ajustes_solicitados' && editable.partnerFeedback && <p className="rounded-lg p-2 text-xs" style={{ background: '#F59E0B22', color: '#92400E' }}>Ajustes solicitados: {editable.partnerFeedback}</p>}

      {!pending && (
        <>
          <label className="block text-sm font-semibold" style={{ color: colors.text }}>Título
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
          </label>
          <label className="block text-sm font-semibold" style={{ color: colors.text }}>Descrição
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border p-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
          </label>
          <div className="flex items-center gap-3">
            {form.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt="" className="h-16 w-24 rounded-lg object-cover" />
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Enviar imagem
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => saveAndMaybeSubmit(false)} disabled={saving} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: colors.border, color: colors.text }}>Salvar rascunho</button>
            <button onClick={() => saveAndMaybeSubmit(true)} disabled={saving} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.primary }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null} Enviar para revisão
            </button>
          </div>
        </>
      )}

      {live && campaign.review.key === 'aprovado' && campaign.payment.key !== 'pago' && campaign.payment.key !== 'isento' && (
        <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: colors.border }}>
          <p className="text-sm font-semibold" style={{ color: colors.text }}>Contratação</p>
          <label className="block text-sm" style={{ color: colors.text }}>Pacote
            <select value={packageId} onChange={e => setPackageId(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" style={{ borderColor: colors.border, color: colors.text }}>
              <option value="">Selecione…</option>
              {packages.map(p => <option key={p.id} value={p.id}>{p.name} — {p.durationDays} dias — {p.price != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: p.currency }).format(p.price) : 'sem preço'}</option>)}
            </select>
          </label>
          {selectedPackage && (
            <div className="text-xs" style={{ color: colors.textSecondary }}>
              {selectedPackage.cancellationPolicy && <p>Cancelamento: {selectedPackage.cancellationPolicy}</p>}
              {selectedPackage.pausePolicy && <p>Pausa: {selectedPackage.pausePolicy}</p>}
            </div>
          )}
          <label className="flex items-start gap-2 text-xs" style={{ color: colors.text }}>
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-0.5" />
            Li e aceito as condições do pacote selecionado (duração, preço, política de cancelamento e pausa).
          </label>
          <button onClick={pay} disabled={paying || !accepted || !packageId} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.primary }}>
            {paying ? <Loader2 size={14} className="animate-spin" /> : null} Pagar agora
          </button>
        </div>
      )}
    </div>
  )
}
