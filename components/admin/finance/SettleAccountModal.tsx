'use client'

import { useRef, useState } from 'react'
import { X, Loader2, Paperclip } from 'lucide-react'
import type { AccountEntry } from '@/types'
import { formatCurrencyBRL, todaySaoPauloDateStr } from '@/lib/finance'
import { uploadAccountAttachment, AccountAttachmentError } from '@/lib/services/account-storage'

interface Props {
  account:   AccountEntry
  onClose:   () => void
  onSettled: () => void
}

const PAYMENT_METHODS = ['Pix', 'Transferência', 'Cartão', 'Boleto', 'Dinheiro', 'Outro']

/** Liquidação total ou parcial — mostra o efeito antes de confirmar (seção 10). */
export default function SettleAccountModal({ account, onClose, onSettled }: Props) {
  const balance = account.amount - account.amountSettled
  const [amount, setAmount] = useState(balance.toFixed(2).replace('.', ','))
  const [effectiveDate, setEffectiveDate] = useState(todaySaoPauloDateStr())
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submittedRef = useRef(false)

  const parsedAmount = Number(amount.replace(',', '.'))
  const remainingAfter = balance - (Number.isFinite(parsedAmount) ? parsedAmount : 0)

  const handleSubmit = async () => {
    if (submittedRef.current) return
    setError(null)
    if (!parsedAmount || parsedAmount <= 0) { setError('Informe um valor válido.'); return }
    if (parsedAmount > balance + 0.001) { setError(`Valor maior que o saldo em aberto (${formatCurrencyBRL(balance)}).`); return }
    if (!effectiveDate) { setError('Informe a data efetiva.'); return }

    submittedRef.current = true
    setSaving(true)
    try {
      let receiptPath: string | null = null
      if (receipt) {
        try { receiptPath = await uploadAccountAttachment(receipt) }
        catch (err) { throw new Error(err instanceof AccountAttachmentError ? err.message : 'Falha ao enviar comprovante.') }
      }

      const res = await fetch(`/api/admin/accounts/${account.kind}/${account.id}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsedAmount, effectiveDate, paymentMethod, reference: reference || null, notes: notes || null, receiptPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao registrar liquidação.')
      onSettled()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar liquidação.')
      submittedRef.current = false
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="settle-title">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#111827] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="settle-title" className="text-lg font-bold text-white">
            Registrar {account.kind === 'payable' ? 'pagamento' : 'recebimento'}
          </h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
          <span className="text-white/40">Valor original</span><span className="text-right text-white/70">{formatCurrencyBRL(account.amount)}</span>
          <span className="text-white/40">Já liquidado</span><span className="text-right text-white/70">{formatCurrencyBRL(account.amountSettled)}</span>
          <span className="text-white/40">Saldo atual</span><span className="text-right font-semibold text-white">{formatCurrencyBRL(balance)}</span>
          <span className="text-white/40">Valor desta operação</span><span className="text-right text-[#60A5FA]">{Number.isFinite(parsedAmount) ? formatCurrencyBRL(parsedAmount) : '—'}</span>
          <span className="text-white/40">Saldo restante após</span>
          <span className={`text-right font-semibold ${remainingAfter < -0.001 ? 'text-[#F87171]' : 'text-white'}`}>{formatCurrencyBRL(Math.max(remainingAfter, 0))}</span>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="settle-amount" className="mb-1 block text-xs font-semibold text-white/40">Valor liquidado (R$)</label>
              <input id="settle-amount" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
            </div>
            <div>
              <label htmlFor="settle-date" className="mb-1 block text-xs font-semibold text-white/40">Data efetiva</label>
              <input id="settle-date" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
            </div>
          </div>
          <div>
            <label htmlFor="settle-method" className="mb-1 block text-xs font-semibold text-white/40">Meio de pagamento</label>
            <select id="settle-method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="settle-ref" className="mb-1 block text-xs font-semibold text-white/40">Referência (opcional)</label>
            <input id="settle-ref" value={reference} onChange={e => setReference(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
          </div>
          <div>
            <label htmlFor="settle-notes" className="mb-1 block text-xs font-semibold text-white/40">Observação (opcional)</label>
            <textarea id="settle-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white/40"><Paperclip size={12} aria-hidden="true" />Comprovante (opcional)</label>
            <input type="file" onChange={e => setReceipt(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-white/50 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:py-1.5 file:text-xs file:text-white/70" />
          </div>
          {error && <p className="text-xs text-[#F87171]">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/[0.10] px-4 py-2 text-sm font-semibold text-white/60 hover:text-white">Cancelar</button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="rounded-lg bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="inline animate-spin" aria-hidden="true" /> : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
