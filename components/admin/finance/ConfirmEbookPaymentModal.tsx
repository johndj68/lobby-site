'use client'

import { useState } from 'react'
import { X, Loader2, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL, PAYMENT_METHOD_LABEL } from '@/lib/finance'
import type { PendingEbookPurchase } from '@/lib/ebooks'
import type { FinancialTransaction, PaymentMethod } from '@/types'

interface Props {
  purchase:   PendingEbookPurchase | null
  onClose:    () => void
  /** Chamado com o lançamento financeiro criado pela RPC — o pai insere no
   *  topo da lista e remove `purchase` da fila de pendentes. */
  onConfirmed: (tx: FinancialTransaction, purchaseId: string) => void
}

const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]

/**
 * Confirmação de recebimento manual de e-book — substitui as 2 escritas
 * soltas (UPDATE ebook_purchases + INSERT financial_transactions em
 * chamadas client-side separadas) por uma única RPC atômica
 * (confirm_ebook_purchase_manual), que já embute o gate de líder, o lock
 * contra clique duplo e a exigência de método/data/justificativa.
 */
export default function ConfirmEbookPaymentModal({ purchase, onClose, onConfirmed }: Props) {
  const [method,    setMethod]    = useState<PaymentMethod>('pix')
  const [date,      setDate]      = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [notes,     setNotes]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  if (!purchase) return null

  const reset = () => { setMethod('pix'); setDate(new Date().toISOString().slice(0, 10)); setReference(''); setNotes(''); setError('') }
  const handleClose = () => { if (saving) return; reset(); onClose() }

  const handleSubmit = async () => {
    if (!notes.trim()) { setError('Informe a justificativa do recebimento manual.'); return }
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { data, error: err } = await supabase.rpc('confirm_ebook_purchase_manual', {
        p_purchase_id:      purchase.id,
        p_payment_method:   method,
        p_received_date:    date,
        p_payment_reference: reference.trim() || null,
        p_notes:            notes.trim(),
      })
      if (err) throw err
      onConfirmed(data as FinancialTransaction, purchase.id)
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
          <p className="truncate text-sm font-semibold text-white">{purchase.ebook_title}</p>
          <p className="truncate text-xs text-white/40">
            {purchase.buyer_name || purchase.buyer_email || 'Comprador desconhecido'} · {formatCurrencyBRL(purchase.amount)}
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-confirm-method">
                Forma de pagamento <span className="text-[#FBBF24]">*</span>
              </label>
              <select id="ebook-confirm-method" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} disabled={saving}
                className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#0D1428] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50">
                {METHODS.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-confirm-date">
                Data de recebimento <span className="text-[#FBBF24]">*</span>
              </label>
              <input id="ebook-confirm-date" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={saving}
                className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white outline-none focus:border-[#005BFF]/50" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-confirm-ref">
              Referência/comprovante <span className="text-white/30 font-normal">(opcional)</span>
            </label>
            <input id="ebook-confirm-ref" type="text" placeholder="Ex: código Pix, nº do comprovante" value={reference}
              onChange={e => setReference(e.target.value)} disabled={saving}
              className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="ebook-confirm-notes">
              Justificativa <span className="text-[#FBBF24]">*</span>
            </label>
            <textarea id="ebook-confirm-notes" rows={3} placeholder="Ex: Cliente pagou via Pix direto, confirmado por print no WhatsApp."
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
