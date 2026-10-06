'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { colors } from '@/lib/design-tokens'
import { formatOfferPrice, computePromoPriceFromPercent, computeDiscountPercent, roundCents } from '@/lib/services/offers'
import { DEFAULT_COMMISSION_PERCENT } from '@/lib/services/commission'
import { createClient } from '@/lib/supabase'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import type { PlanOption } from './types'

export interface PrefillValues {
  planId?: string
  name?: string
  discountPercent?: number
  promoPrice?: number
  discountDurationType?: 'primeira_cobranca' | 'ciclos_fixos'
  discountCycles?: number
  rejectionContext?: string
  /** Presente = isto não é um pedido novo, é uma proposta de NOVA VERSÃO
   *  pra uma promoção já aprovada (versionamento) — nunca sobrescreve a
   *  vigente, ela continua valendo até esta ser aprovada. */
  editsPromotionId?: string
}

interface Props {
  open: boolean
  plans: PlanOption[]
  partnerId: string | null
  prefill: PrefillValues | null
  onClose: () => void
  onCreated: () => void
}

const isRecurring = (bp: PlanOption['billingPeriod']) => bp === 'monthly' || bp === 'yearly'

export default function PromocaoFormSheet({ open, plans, partnerId, prefill, onClose, onCreated }: Props) {
  const eligiblePlans = useMemo(() => plans.filter(p => p.price != null && p.planStatus !== 'archived'), [plans])

  const [name, setName] = useState('')
  const [planId, setPlanId] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [promoPrice, setPromoPrice] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [unitLimit, setUnitLimit] = useState('')
  const [eligibleForDailyDeals, setEligibleForDailyDeals] = useState(false)
  const [durationType, setDurationType] = useState<'primeira_cobranca' | 'ciclos_fixos'>('primeira_cobranca')
  const [cycles, setCycles] = useState('3')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [commissionPercent, setCommissionPercent] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setName(prefill?.name ?? '')
    setPlanId(prefill?.planId ?? eligiblePlans[0]?.id ?? '')
    setDiscountPercent(prefill?.discountPercent != null ? String(prefill.discountPercent) : '')
    setPromoPrice(prefill?.promoPrice != null ? String(prefill.promoPrice) : '')
    setStartsAt(''); setEndsAt(''); setUnitLimit(''); setEligibleForDailyDeals(false); setNotes('')
    setDurationType(prefill?.discountDurationType ?? 'primeira_cobranca')
    setCycles(prefill?.discountCycles != null ? String(prefill.discountCycles) : '3')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill])

  const selectedPlan = eligiblePlans.find(p => p.id === planId)
  const recurring = isRecurring(selectedPlan?.billingPeriod ?? null)
  // Plano pode ter sido arquivado/perdido o preço depois que a promoção
  // original foi aprovada — sem checar isso, o <select> trancado (modo
  // edição) fica mostrando um valor que não existe em eligiblePlans, a
  // prévia some em silêncio e o parceiro não entende por quê.
  const planMissing = !!prefill?.planId && open && !eligiblePlans.some(p => p.id === prefill.planId)

  useEffect(() => {
    if (!open || !selectedPlan?.applicationId) { setCommissionPercent(null); return }
    let cancelled = false
    const supabase = createClient()
    supabase.rpc('get_partner_commission_percent', { p_partner_id: partnerId, p_category_id: selectedPlan.categoryId })
      .then(({ data, error: rpcError }: { data: number | null; error: unknown }) => {
        if (cancelled) return
        setCommissionPercent(!rpcError && data != null ? Number(data) : null)
      })
    return () => { cancelled = true }
  }, [open, selectedPlan?.applicationId, selectedPlan?.categoryId, partnerId])

  const previewPromoPrice = selectedPlan?.price != null
    ? (discountPercent
        ? computePromoPriceFromPercent(selectedPlan.price, Number(discountPercent))
        : promoPrice ? roundCents(Number(promoPrice)) : null)
    : null
  const previewDiscountPercent = selectedPlan?.price != null && previewPromoPrice != null
    ? computeDiscountPercent(previewPromoPrice, selectedPlan.price, discountPercent ? Number(discountPercent) : null)
    : null

  const effectiveCommission = commissionPercent ?? DEFAULT_COMMISSION_PERCENT
  const partnerShare = previewPromoPrice != null ? roundCents(previewPromoPrice * (1 - effectiveCommission / 100)) : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (planMissing) { setError('O plano desta promoção não está mais disponível para edição (foi arquivado ou ficou sem preço).'); return }
    if (!planId) { setError('Selecione um plano.'); return }
    if (!name.trim()) { setError('Dê um nome pra esta promoção.'); return }
    if (!startsAt || !endsAt) { setError('Informe início e término.'); return }
    if (!discountPercent && !promoPrice) { setError('Informe um desconto percentual ou um preço promocional.'); return }
    if (recurring && durationType === 'ciclos_fixos' && (!cycles || !Number.isInteger(Number(cycles)) || Number(cycles) < 1)) { setError('Informe um número inteiro de ciclos (1, 2, 3…).'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/apps/plans/${planId}/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          discountPercent: discountPercent ? Number(discountPercent) : undefined,
          promoPrice: promoPrice ? Number(promoPrice) : undefined,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          unitLimit: unitLimit ? Number(unitLimit) : undefined,
          eligibleForDailyDeals,
          discountDurationType: recurring ? durationType : undefined,
          discountCycles: recurring && durationType === 'ciclos_fixos' ? Number(cycles) : undefined,
          partnerId: partnerId ?? undefined,
          editsPromotionId: prefill?.editsPromotionId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Não foi possível enviar o pedido.')
      toast.success(prefill?.editsPromotionId ? 'Nova versão enviada pra aprovação — a promoção atual continua valendo até lá.' : 'Pedido de promoção enviado pra aprovação.')
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{prefill?.editsPromotionId ? 'Propor nova versão' : 'Criar promoção'}</SheetTitle>
          <SheetDescription>
            {prefill?.editsPromotionId
              ? 'A promoção atual continua valendo exatamente como está até esta nova versão ser aprovada — nada muda pro comprador até lá.'
              : 'Fica invisível pra compradores até o admin aprovar — salvar não muda o preço público.'}
          </SheetDescription>
        </SheetHeader>

        {prefill?.rejectionContext && (
          <div className="mx-4 mb-4 rounded-lg border p-3 text-xs" style={{ borderColor: '#EF4444', background: '#EF44440D', color: colors.text }}>
            Pedido anterior rejeitado — motivo: {prefill.rejectionContext}
          </div>
        )}

        {planMissing && (
          <div className="mx-4 mb-4 rounded-lg border p-3 text-xs" style={{ borderColor: '#EF4444', background: '#EF44440D', color: colors.text }}>
            O plano desta promoção não está mais disponível para edição (foi arquivado ou ficou sem preço definido) — não é possível propor uma nova versão agora.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 pb-6">
          {eligiblePlans.length === 0 ? (
            <div className="rounded-lg border p-4 text-sm" style={{ borderColor: colors.border, color: colors.text }}>
              Nenhum plano elegível ainda — cadastre um plano com preço definido antes de pedir uma promoção.
              <Link href="/dashboard/meus-app" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: colors.primary }}>
                Gerenciar aplicativos <ExternalLink size={12} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>1. Aplicativo e plano</h3>
                <Field label="Nome da promoção">
                  <input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="Ex: Semana da produtividade" className={inputCls} style={inputStyle} />
                </Field>
                <Field label="Plano elegível">
                  <select value={planId} onChange={e => setPlanId(e.target.value)} disabled={!!prefill?.editsPromotionId} className={inputCls} style={inputStyle}>
                    {eligiblePlans.map(p => (
                      <option key={p.id} value={p.id}>{p.appName} — {p.planName} ({p.price != null ? formatOfferPrice(p.price, p.currency, p.billingPeriod) : 'sem preço'})</option>
                    ))}
                  </select>
                </Field>
                {prefill?.editsPromotionId && (
                  <p className="text-xs" style={{ color: colors.textMuted }}>Nova versão de uma promoção aprovada — o plano não pode mudar.</p>
                )}
                {selectedPlan?.price != null && (
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Preço vigente: <strong>{formatOfferPrice(selectedPlan.price, selectedPlan.currency, selectedPlan.billingPeriod)}</strong> — só consulta, não é editado aqui.
                  </p>
                )}
              </section>

              <section className="space-y-3 border-t pt-4" style={{ borderColor: colors.border }}>
                <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>2. Desconto e vigência</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Desconto percentual">
                    <input type="number" min={1} max={99} value={discountPercent} onChange={e => { setDiscountPercent(e.target.value); setPromoPrice('') }} placeholder="Ex: 30" className={inputCls} style={inputStyle} />
                  </Field>
                  <Field label="Ou preço promocional">
                    <input type="number" min={0} step="0.01" value={promoPrice} onChange={e => { setPromoPrice(e.target.value); setDiscountPercent('') }} className={inputCls} style={inputStyle} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Início"><input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className={inputCls} style={inputStyle} /></Field>
                  <Field label="Término"><input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className={inputCls} style={inputStyle} /></Field>
                </div>
                <p className="text-[11px]" style={{ color: colors.textMuted }}>Fuso: America/Sao_Paulo · início inclusivo, término exclusivo.</p>

                {recurring && (
                  <div className="rounded-lg border p-3" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
                    <p className="mb-2 text-xs font-semibold" style={{ color: colors.text }}>Duração do benefício (assinatura)</p>
                    <div className="flex flex-col gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={durationType === 'primeira_cobranca'} onChange={() => setDurationType('primeira_cobranca')} />
                        Só na primeira cobrança
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={durationType === 'ciclos_fixos'} onChange={() => setDurationType('ciclos_fixos')} />
                        Nos primeiros
                        <input type="number" min={1} step={1} value={cycles} onChange={e => setCycles(e.target.value)} disabled={durationType !== 'ciclos_fixos'} className="w-16 rounded border px-2 py-1 text-sm" style={{ borderColor: colors.border }} />
                        ciclos
                      </label>
                    </div>
                    <p className="mt-2 text-[11px]" style={{ color: colors.textMuted }}>
                      A janela acima é quando o comprador pode CONTRATAR a oferta — isso aqui é por quanto tempo o desconto vale nas cobranças depois. Encerrar a janela de contratação não tira o benefício de quem já assinou.
                    </p>
                  </div>
                )}

                <Field label="Limite de unidades (opcional)">
                  <input type="number" min={1} value={unitLimit} onChange={e => setUnitLimit(e.target.value)} placeholder="Sem limite" className={inputCls} style={inputStyle} />
                </Field>
                <label className="flex items-start gap-2 text-xs" style={{ color: colors.text }}>
                  <input type="checkbox" checked={eligibleForDailyDeals} onChange={e => setEligibleForDailyDeals(e.target.checked)} className="mt-0.5" />
                  <span>Elegível para promoções do dia<br /><span style={{ color: colors.textSecondary }}>Não garante exibição — depende de disponibilidade na curadoria.</span></span>
                </label>
                <Field label="Observação para a equipe (opcional)">
                  <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} style={inputStyle} />
                </Field>
              </section>

              <section className="space-y-2 border-t pt-4" style={{ borderColor: colors.border }}>
                <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>3. Revisão da solicitação</h3>
                <PriceSummary
                  plan={selectedPlan}
                  promoPrice={previewPromoPrice}
                  discountPercent={previewDiscountPercent}
                  recurring={recurring}
                  durationType={durationType}
                  cycles={Number(cycles) || 1}
                  commissionPercent={commissionPercent}
                  effectiveCommission={effectiveCommission}
                  partnerShare={partnerShare}
                />
              </section>

              {error && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.border, color: colors.text }}>Cancelar</button>
                <button type="submit" disabled={saving || planMissing} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: colors.primary }}>
                  {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {saving ? 'Enviando…' : prefill?.editsPromotionId ? 'Enviar nova versão pra análise' : 'Enviar pra análise'}
                </button>
              </div>
            </>
          )}
        </form>
      </SheetContent>
    </Sheet>
  )
}

function PriceSummary({ plan, promoPrice, discountPercent, recurring, durationType, cycles, commissionPercent, effectiveCommission, partnerShare }: {
  plan: PlanOption | undefined
  promoPrice: number | null
  discountPercent: number | null
  recurring: boolean
  durationType: 'primeira_cobranca' | 'ciclos_fixos'
  cycles: number
  commissionPercent: number | null
  effectiveCommission: number
  partnerShare: number | null
}) {
  if (!plan || plan.price == null) return <p className="text-sm" style={{ color: colors.textSecondary }}>Selecione um plano pra ver a prévia.</p>
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: colors.primary, background: `${colors.primary}0D` }}>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.primary }}>Prévia da oferta — não publicada, não permite compra real</p>
      <div className="space-y-1 text-sm" style={{ color: colors.text }}>
        <p><span style={{ color: colors.textSecondary }}>Aplicativo/plano:</span> {plan.appName} — {plan.planName}</p>
        <p><span style={{ color: colors.textSecondary }}>Preço de referência:</span> {formatOfferPrice(plan.price, plan.currency, plan.billingPeriod)}</p>
        <p>
          <span style={{ color: colors.textSecondary }}>Preço final:</span>{' '}
          <strong className="tabular-nums">{promoPrice != null ? formatOfferPrice(promoPrice, plan.currency, plan.billingPeriod) : '—'}</strong>
          {discountPercent != null && <span style={{ color: '#10B981' }}> (-{discountPercent}%)</span>}
        </p>
        {recurring && promoPrice != null && (
          <p style={{ color: colors.textSecondary }}>
            {durationType === 'ciclos_fixos'
              ? `${formatOfferPrice(promoPrice, plan.currency, plan.billingPeriod)} nos primeiros ${cycles} ciclo${cycles === 1 ? '' : 's'}. Depois, ${formatOfferPrice(plan.price, plan.currency, plan.billingPeriod)}.`
              : `${formatOfferPrice(promoPrice, plan.currency, plan.billingPeriod)} só na primeira cobrança. Depois, ${formatOfferPrice(plan.price, plan.currency, plan.billingPeriod)}.`}
          </p>
        )}
      </div>

      {promoPrice != null && (
        <div className="mt-3 border-t pt-3 text-xs" style={{ borderColor: `${colors.primary}33` }}>
          <p className="mb-1 font-semibold" style={{ color: colors.text }}>Impacto estimado pra você (simulação)</p>
          <p style={{ color: colors.textSecondary }}>
            Comissão LOBBY estimada: {effectiveCommission}%{commissionPercent == null && ' (padrão — sem condição específica configurada)'}.
            Sua participação estimada no preço promocional: <strong style={{ color: colors.text }}>{partnerShare != null ? formatOfferPrice(partnerShare, plan.currency, null) : '—'}</strong>.
          </p>
          <p className="mt-1" style={{ color: colors.textMuted }}>Estimativa — não é lucro líquido, não inclui reserva de disputa nem outras deduções. A comissão real é calculada pelo servidor em cada venda.</p>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm'
const inputStyle = { borderColor: colors.border, color: colors.text }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>{label}</label>
      {children}
    </div>
  )
}
