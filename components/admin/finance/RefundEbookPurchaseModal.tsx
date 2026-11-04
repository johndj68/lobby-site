'use client'

import { useState } from 'react'
import { X, Loader2, Undo2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/finance'

export interface PaidEbookPurchase {
  id:                string
  ebook_title:       string
  amount:            number
  payment_provider:  string | null
  buyer_name?:       string | null
  buyer_email?:      string | null
}

interface Props {
  purchase:   PaidEbookPurchase | null
  onClose:    () => void
  onRefunded: (purchaseId: string) => void
}

/**
 * Reembolso de e-book — sempre total (bem digital indivisível, sem
 * "metade" pra reembolsar). A RPC refund_ebook_purchase já sabe reverter
 * o jeito certo de pagamento (crédito devolvido à carteira, ou
 * financial_transactions marcado reembolsado se foi manual/BRL) e revoga
 * o acesso de download junto — uma ação só, não duas.
 */
export default function RefundEbookPurchaseModal({ purchase, onClose, onRefunded }: Props) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  if (!purchase) return null

  const reset = () => { setReason(''); setError('') }
  const handleClose = () => { if (saving) return; reset(); onClose() }

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Informe o motivo do reembolso.'); return }
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: err } = await supabase.rpc('refund_ebook_purchase', {
        p_purchase_id: purchase.id,
        p_reason:      reason.trim(),
      })
      if (err) throw err
      onRefunded(purchase.id)
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
            Reembolsar e-book
          </DialogTitle>
          <button type="button" onClick={handleClose} disabled={saving} className="text-white/40 hover:text-white transition-colors" aria-label="Fechar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 space-y-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-white/60">
          <p className="truncate text-sm font-semibold text-white">{purchase.ebook_title}</p>
          <p>{purchase.buyer_name || purchase.buyer_email || 'Comprador desconhecido'}</p>
          <p>Valor: <span className="font-semibold text-white">{formatCurrencyBRL(purchase.amount)}</span> · Pago via {purchase.payment_provider === 'credits' ? 'créditos' : 'manual'}</p>
          <p className="text-[#FBBF24]">Reembolso total — {purchase.payment_provider === 'credits' ? 'devolve os créditos à carteira' : 'marca o lançamento financeiro como reembolsado'} e revoga o download.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-refund-reason">
              Motivo <span className="text-[#FBBF24]">*</span>
            </label>
            <textarea id="ebook-refund-reason" rows={3} placeholder="Ex: Cliente desistiu, conteúdo não atendeu."
              value={reason} onChange={e => setReason(e.target.value)} disabled={saving}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
          </div>

          {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose} disabled={saving}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-sm font-semibold text-white/60 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
              Cancelar
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}
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
