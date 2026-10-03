'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { getPromotionStatus, formatOfferPrice } from '@/lib/services/offers'

export interface PlanOption {
  id: string
  appName: string
  planName: string
  price: number | null
  currency: string
  billingPeriod: string | null
}

export interface PromotionRow {
  id: string
  planId: string
  appName: string
  planName: string
  currency: string
  billingPeriod: string | null
  promoPrice: number
  originalPrice: number | null
  discountPercentage: number | null
  startsAt: string
  endsAt: string
  isApproved: boolean
  isActive: boolean
  cancelledAt: string | null
  pausedAt: string | null
  rejectedAt: string | null
  rejectionReason: string | null
}

const STATUS_LABEL_OVERRIDE: Record<string, string> = { rascunho: 'Aguardando aprovação' }

interface Props {
  plans: PlanOption[]
  promotions: PromotionRow[]
  loadError: boolean
}

export default function OfertasPromocoesClient({ plans, promotions: initialPromotions, loadError }: Props) {
  const [promotions, setPromotions] = useState(initialPromotions)
  const [showForm, setShowForm] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?.id ?? '')
  const [discountPercent, setDiscountPercent] = useState('')
  const [promoPrice, setPromoPrice] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [unitLimit, setUnitLimit] = useState('')
  const [eligibleForDailyDeals, setEligibleForDailyDeals] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedPlan = plans.find(p => p.id === selectedPlanId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPlanId) { setError('Selecione um plano.'); return }
    if (!startsAt || !endsAt) { setError('Informe início e término.'); return }
    if (!discountPercent && !promoPrice) { setError('Informe um desconto percentual ou um preço promocional.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/apps/plans/${selectedPlanId}/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discountPercent: discountPercent ? Number(discountPercent) : undefined,
          promoPrice: promoPrice ? Number(promoPrice) : undefined,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          unitLimit: unitLimit ? Number(unitLimit) : undefined,
          eligibleForDailyDeals,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Não foi possível enviar o pedido.')
      toast.success('Pedido de promoção enviado pra aprovação.')
      setShowForm(false)
      setDiscountPercent(''); setPromoPrice(''); setStartsAt(''); setEndsAt(''); setUnitLimit(''); setEligibleForDailyDeals(false)
      setPromotions(prev => [{
        id: data.id, planId: selectedPlanId,
        appName: selectedPlan?.appName ?? '—', planName: selectedPlan?.planName ?? '—',
        currency: selectedPlan?.currency ?? 'BRL', billingPeriod: selectedPlan?.billingPeriod ?? null,
        promoPrice: discountPercent ? 0 : Number(promoPrice), originalPrice: selectedPlan?.price ?? null,
        discountPercentage: discountPercent ? Number(discountPercent) : null,
        startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
        isApproved: false, isActive: false, cancelledAt: null, pausedAt: null, rejectedAt: null, rejectionReason: null,
      }, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {loadError && (
        <p className="mb-4 text-sm" style={{ color: '#EF4444' }}>Não foi possível carregar suas promoções agora. Recarregue a página.</p>
      )}

      {plans.length === 0 ? (
        <p className="text-sm" style={{ color: colors.textSecondary }}>Cadastre um plano com preço definido antes de pedir uma promoção.</p>
      ) : (
        <>
          {!showForm ? (
            <button type="button" onClick={() => setShowForm(true)}
              className="mb-5 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: colors.primary }}>
              <Plus size={14} aria-hidden="true" /> Pedir promoção
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="mb-5 space-y-3 rounded-2xl border p-5" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Plano</label>
                <select value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }}>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.appName} — {p.planName} ({p.price != null ? formatOfferPrice(p.price, p.currency, p.billingPeriod) : 'sem preço'})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Desconto percentual</label>
                  <input type="number" min={1} max={99} value={discountPercent} onChange={e => { setDiscountPercent(e.target.value); setPromoPrice('') }} placeholder="Ex: 30" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Ou preço promocional</label>
                  <input type="number" min={0} step="0.01" value={promoPrice} onChange={e => { setPromoPrice(e.target.value); setDiscountPercent('') }} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Início</label>
                  <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Término</label>
                  <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
                </div>
              </div>
              <p className="text-[11px]" style={{ color: colors.textMuted }}>Fuso: America/Sao_Paulo · início inclusivo, término exclusivo.</p>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>Limite de unidades (opcional)</label>
                <input type="number" min={1} value={unitLimit} onChange={e => setUnitLimit(e.target.value)} placeholder="Sem limite" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
              </div>
              <label className="flex items-start gap-2 text-xs" style={{ color: colors.text }}>
                <input type="checkbox" checked={eligibleForDailyDeals} onChange={e => setEligibleForDailyDeals(e.target.checked)} className="mt-0.5" />
                <span>Elegível para promoções do dia<br /><span style={{ color: colors.textSecondary }}>Não garante exibição — depende de disponibilidade na curadoria.</span></span>
              </label>
              {error && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.border, color: colors.text }}>Cancelar</button>
                <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: colors.primary }}>
                  {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {saving ? 'Enviando…' : 'Enviar pedido'}
                </button>
              </div>
            </form>
          )}

          {promotions.length === 0 ? (
            <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhuma promoção pedida ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {promotions.map(p => {
                const status = getPromotionStatus({ is_approved: p.isApproved, is_active: p.isActive, starts_at: p.startsAt, ends_at: p.endsAt, cancelled_at: p.cancelledAt, paused_at: p.pausedAt })
                const label = STATUS_LABEL_OVERRIDE[status.key] ?? status.label
                return (
                  <div key={p.id} className="rounded-2xl border p-4" style={{ borderColor: colors.border, background: colors.card, boxShadow: shadows.card }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: colors.text }}>{p.appName} — {p.planName}</p>
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: status.color, background: `${status.color}1A` }}>{label}</span>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                      {formatOfferPrice(p.promoPrice, p.currency, p.billingPeriod)}{p.discountPercentage != null && ` (-${p.discountPercentage}%)`} · {new Date(p.startsAt).toLocaleDateString('pt-BR')} → {new Date(p.endsAt).toLocaleDateString('pt-BR')}
                    </p>
                    {p.rejectedAt && p.rejectionReason && (
                      <p className="mt-1 text-xs" style={{ color: '#EF4444' }}>Motivo da rejeição: {p.rejectionReason}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
