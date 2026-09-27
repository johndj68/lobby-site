'use client'

import { useState } from 'react'
import { X, Loader2, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/finance'
import { formatCredits } from '@/lib/credits'
import type { CreditPurchase } from '@/types'

interface Props {
  purchase:    CreditPurchase | null
  onClose:     () => void
  onConfirmed: (purchaseId: string) => void
}

/**
 * Confirmação manual de compra de créditos. A RPC confirm_credit_purchase
 * agora bloqueia qualquer compra com stripe_session_id preenchido (toda
 * compra nascida em /api/stripe/checkout tem esse campo) — essa ação só
 * completa de verdade para um recebimento genuinamente fora do Stripe.
 * Pra uma compra Stripe travada por webhook falho, a mensagem de erro da
 * RPC orienta a conferir o evento no próprio Stripe Dashboard em vez de
 * contornar por aqui.
 */
export default function ConfirmCreditPurchaseModal({ purchase, onClose, onConfirmed }: Props) {
  const [reference, setReference] = useState('')
  const [notes,     setNotes]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  if (!purchase) return null

  const reset = () => { setReference(''); setNotes(''); setError('') }
  const handleClose = () => { if (saving) return; reset(); onClose() }

  const handleSubmit = async () => {
    if (!notes.trim()) { setError('Informe a justificativa do recebimento manual.'); return }
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: err } = await supabase.rpc('confirm_credit_purchase', {
        p_purchase_id:       purchase.id,
        p_payment_reference: reference.trim() || null,
        p_notes:             notes.trim(),
      })
      if (err) throw err
      onConfirmed(purchase.id)
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar o pagamento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!purchase} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-md rounded-2xl border border-white/[0.09] bg-[#0D1428] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.50)]">
        <div className="mb-4 flex items-center justify-between">
          <DialogTitle className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Confirmar recebimento
          </DialogTitle>
          <button type="button" onClick={handleClose} disabled={saving} className="text-white/40 hover:text-white transition-colors" aria-label="Fechar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="truncate text-sm font-semibold text-white">
            {purchase.buyer_name || purchase.buyer_email || 'Cliente'} · {formatCredits(purchase.credits_amount)}
          </p>
          <p className="text-xs text-white/40">{purchase.package?.name} · {formatCurrencyBRL(purchase.amount_paid)}</p>
        </div>

        <p className="mb-4 rounded-xl bg-[#F59E0B]/10 px-3 py-2 text-[11px] leading-relaxed text-[#FBBF24]">
          Use isto só para recebimento fora do Stripe. Se esta compra foi iniciada no checkout do site e o pagamento não confirmou, a ação será bloqueada — confira o evento no Stripe Dashboard.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="credit-confirm-ref">
              Referência/comprovante <span className="text-white/30 font-normal">(opcional)</span>
            </label>
            <input id="credit-confirm-ref" type="text" placeholder="Ex: código Pix, nº do comprovante" value={reference}
              onChange={e => setReference(e.target.value)} disabled={saving}
              className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="credit-confirm-notes">
              Justificativa <span className="text-[#FBBF24]">*</span>
            </label>
            <textarea id="credit-confirm-notes" rows={3} placeholder="Ex: Cliente pagou via Pix direto, confirmado por print no WhatsApp."
              value={notes} onChange={e => setNotes(e.target.value)} disabled={saving}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
          </div>

          {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose} disabled={saving}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-sm font-semibold text-white/60 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
              Cancelar
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981]/12 py-2.5 text-sm font-bold text-[#34D399] hover:bg-[#10B981]/20 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
              {saving ? 'Confirmando...' : 'Confirmar pagamento'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
