'use client'

import { useState } from 'react'
import { X, Loader2, Undo2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/finance'
import type { FinancialTransaction } from '@/types'

interface Props {
  transaction: FinancialTransaction | null
  onClose:     () => void
  onRefunded:  (transaction: FinancialTransaction) => void
}

/**
 * Reembolso de lançamento financeiro geral — sem chamada a provedor
 * (a maioria dos lançamentos aqui é recebimento manual: PIX, dinheiro,
 * boleto). O líder atesta que devolveu o valor por fora; a RPC
 * refund_financial_transaction exige justificativa e nunca deixa
 * reembolsar mais do que o saldo ainda reembolsável.
 */
export default function RefundFinanceTransactionModal({ transaction, onClose, onRefunded }: Props) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  if (!transaction) return null

  const remaining = transaction.amount - transaction.refunded_amount

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
      const supabase = createClient()
      const { data, error: err } = await supabase.rpc('refund_financial_transaction', {
        p_transaction_id: transaction.id,
        p_amount: amountNum,
        p_reason: reason.trim(),
      })
      if (err) throw err
      onRefunded(data as FinancialTransaction)
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível processar o reembolso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!transaction} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-md rounded-2xl border border-white/[0.09] bg-[#0D1428] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.50)]">
        <div className="mb-4 flex items-center justify-between">
          <DialogTitle className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Reembolsar lançamento
          </DialogTitle>
          <button type="button" onClick={handleClose} disabled={saving} className="text-white/40 hover:text-white transition-colors" aria-label="Fechar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 space-y-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-white/60">
          <p className="truncate text-sm font-semibold text-white">{transaction.description}</p>
          <p>Valor: <span className="font-semibold text-white">{formatCurrencyBRL(transaction.amount)}</span></p>
          {transaction.refunded_amount > 0 && (
            <p>Já reembolsado: <span className="font-semibold text-[#FBBF24]">{formatCurrencyBRL(transaction.refunded_amount)}</span></p>
          )}
          <p>Ainda reembolsável: <span className="font-semibold text-white">{formatCurrencyBRL(remaining)}</span></p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="fin-refund-amount">
              Valor a reembolsar (R$) <span className="text-[#FBBF24]">*</span>
            </label>
            <input id="fin-refund-amount" type="text" inputMode="decimal" placeholder="0,00" value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9,.]/g, ''))} disabled={saving}
              className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="fin-refund-reason">
              Motivo <span className="text-[#FBBF24]">*</span>
            </label>
            <textarea id="fin-refund-reason" rows={3} placeholder="Ex: Cliente cancelou parte do escopo, devolvido via Pix."
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
