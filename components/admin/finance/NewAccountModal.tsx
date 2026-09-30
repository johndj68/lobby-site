'use client'

import { useRef, useState } from 'react'
import { X, Loader2, Paperclip } from 'lucide-react'
import type { AccountKind } from '@/types'
import { uploadAccountAttachment, AccountAttachmentError } from '@/lib/services/account-storage'

interface Props {
  defaultKind: AccountKind
  onClose:     () => void
  onCreated:   () => void
}

/** Novo lançamento manual — nunca dispara cobrança/transferência real, só registra a previsão. */
export default function NewAccountModal({ defaultKind, onClose, onCreated }: Props) {
  const [kind, setKind] = useState<AccountKind>(defaultKind)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [reference, setReference] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submittedRef = useRef(false) // guarda contra duplo-clique

  const handleSubmit = async () => {
    if (submittedRef.current) return
    setError(null)
    const parsedAmount = Number(amount.replace(',', '.'))
    if (!description.trim() || !parsedAmount || parsedAmount <= 0) {
      setError('Informe descrição e valor válido.')
      return
    }
    submittedRef.current = true
    setSaving(true)
    try {
      let attachmentPath: string | null = null
      if (file) {
        try {
          attachmentPath = await uploadAccountAttachment(file)
        } catch (err) {
          throw new Error(err instanceof AccountAttachmentError ? err.message : 'Falha ao enviar anexo.')
        }
      }

      const res = await fetch(`/api/admin/accounts/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'payable'
            ? { description, amount: parsedAmount, category: category || null, reference: reference || null, dueDate: dueDate || null, notes: notes || null, attachmentPath }
            : { description, amount: parsedAmount, payerName: category || null, reference: reference || null, dueDate: dueDate || null, notes: notes || null, attachmentPath }
        ),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
      submittedRef.current = false
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="new-account-title">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#111827] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="new-account-title" className="text-lg font-bold text-white">Novo lançamento</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>

        <div className="mb-4 flex gap-2" role="group" aria-label="Tipo de lançamento">
          {(['payable', 'receivable'] as const).map(k => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
                kind === k ? 'border-[#005BFF]/40 bg-[#005BFF]/10 text-[#60A5FA]' : 'border-white/[0.08] text-white/40'
              }`}>
              {k === 'payable' ? 'Conta a pagar' : 'Conta a receber'}
            </button>
          ))}
        </div>

        <p className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[11px] text-white/40">
          Este lançamento registra uma previsão de pagamento ou recebimento — não executa transferência, não cobra cartão, não envia cobrança nem libera créditos/produtos.
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="acc-desc" className="mb-1 block text-xs font-semibold text-white/40">Descrição</label>
            <input id="acc-desc" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="acc-amount" className="mb-1 block text-xs font-semibold text-white/40">Valor (R$)</label>
              <input id="acc-amount" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
            </div>
            <div>
              <label htmlFor="acc-due" className="mb-1 block text-xs font-semibold text-white/40">Vencimento (opcional)</label>
              <input id="acc-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
            </div>
          </div>
          <div>
            <label htmlFor="acc-cat" className="mb-1 block text-xs font-semibold text-white/40">
              {kind === 'payable' ? 'Categoria / fornecedor (opcional)' : 'Cliente / pagador (opcional)'}
            </label>
            <input id="acc-cat" value={category} onChange={e => setCategory(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
          </div>
          <div>
            <label htmlFor="acc-ref" className="mb-1 block text-xs font-semibold text-white/40">Referência ou documento (opcional)</label>
            <input id="acc-ref" value={reference} onChange={e => setReference(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
          </div>
          <div>
            <label htmlFor="acc-notes" className="mb-1 block text-xs font-semibold text-white/40">Observações (opcional)</label>
            <textarea id="acc-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#005BFF]/50" />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white/40"><Paperclip size={12} aria-hidden="true" />Anexo (opcional)</label>
            <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-white/50 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:py-1.5 file:text-xs file:text-white/70" />
          </div>
          {error && <p className="text-xs text-[#F87171]">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/[0.10] px-4 py-2 text-sm font-semibold text-white/60 hover:text-white">Cancelar</button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="rounded-lg bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="inline animate-spin" aria-hidden="true" /> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
