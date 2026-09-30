'use client'

import { useState } from 'react'
import { X, Loader2, Undo2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatCurrencyBRL } from '@/lib/finance'

export interface PaidAppPurchase {
  id:               string
  application_name: string
  plan_name:        string
  amount:           number
  refunded_amount:  number
  refund_status:    'processing' | 'refunded' | null
  paid_at:          string
  buyer_name?:      string | null
  buyer_email?:     string | null
}

interface Props {
  purchase:   PaidAppPurchase | null
  onClose:    () => void
  onRefunded: (purchase: PaidAppPurchase) => void
}

const REFUND_WINDOW_DAYS = 15

/**
 * Reembolso de compra de app — parcial ou total, via Stripe. Chama a rota
 * admin (que chama o Stripe primeiro, depois a RPC refund_app_purchase).
 * O estado final (refunded_amount/status) só fica definitivo quando o
 * webhook charge.refunded confirmar — esta tela reflete o estado
 * 'processing' otimista devolvido pela rota.
 */
export default function RefundAppPurchaseModal({ purchase, onClose, onRefunded }: Props) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  if (!purchase) return null

  const remaining = purchase.amount - purchase.refunded_amount
  const daysSincePaid = (Date.now() - new Date(purchase.paid_at).getTime()) / 86400_000
  const withinWindow = daysSincePaid <= REFUND_WINDOW_DAYS

  const reset = () => { setAmount(''); setReason(''); setError('') }
  const handleClose = () => { if (saving) return; reset(); onClose() }

  const handleSubmit = async () => {
    const amountNum = Number(amount.replace(',', '.'))
    if (!amount || isNaN(amountNum) || amountNum <= 0) { setError('Informe um valor válido, maior que zero.'); return }
    if (amountNum > remaining) { setError(`Valor maior que o saldo ainda reembolsável (${formatCurrencyBRL(remaining)}).`); return }
    if (!reason.trim()) { setError('Informe o motivo do reembolso.'); return }

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/app-purchases/${purchase.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Não foi possível processar o reembolso.')
      onRefunded({ ...purchase, ...(data.purchase as Partial<PaidAppPurchase>) })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível processar o reembolso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!purchase} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-md rounded-2xl border border-white/[0.09] bg-[#0D1428] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.50)]">
        <div className="mb-4 flex items-center justify-between">
          <DialogTitle className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Reembolsar compra de app
          </DialogTitle>
          <button type="button" onClick={handleClose} disabled={saving} className="text-white/40 hover:text-white transition-colors" aria-label="Fechar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 space-y-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-white/60">
          <p className="truncate text-sm font-semibold text-white">{purchase.application_name} — {purchase.plan_name}</p>
          <p>{purchase.buyer_name || purchase.buyer_email || 'Comprador desconhecido'}</p>
          <p>Pago: <span className="font-semibold text-white">{formatCurrencyBRL(purchase.amount)}</span></p>
          {purchase.refunded_amount > 0 && (
            <p>Já reembolsado: <span className="font-semibold text-[#FBBF24]">{formatCurrencyBRL(purchase.refunded_amount)}</span></p>
          )}
          <p>Ainda reembolsável: <span className="font-semibold text-white">{formatCurrencyBRL(remaining)}</span></p>
          {!withinWindow && (
            <p className="text-red-400">Fora do prazo de reembolso — passaram mais de {REFUND_WINDOW_DAYS} dias desde o pagamento.</p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="app-refund-amount">
              Valor a reembolsar (R$) <span className="text-[#FBBF24]">*</span>
            </label>
            <input id="app-refund-amount" type="text" inputMode="decimal" placeholder="0,00" value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9,.]/g, ''))} disabled={saving || !withinWindow}
              className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="app-refund-reason">
              Motivo <span className="text-[#FBBF24]">*</span>
            </label>
            <textarea id="app-refund-reason" rows={3} placeholder="Ex: Cliente desistiu da compra."
              value={reason} onChange={e => setReason(e.target.value)} disabled={saving || !withinWindow}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
          </div>

          {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose} disabled={saving}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-sm font-semibold text-white/60 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
              Cancelar
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving || !withinWindow}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/12 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Undo2 size={14} aria-hidden="true" />}
              {saving ? 'Processando...' : 'Confirmar reembolso'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
