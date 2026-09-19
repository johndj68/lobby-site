'use client'

import { Loader2, Save } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { FINANCE_TYPE_LABEL, FINANCE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/finance'
import type { FinancialTransaction, FinanceType, FinanceStatus, PaymentMethod } from '@/types'

export interface FinanceFormValues {
  type:            FinanceType
  client_name:     string
  company_name:    string
  description:     string
  amount:          string   // string no form pra aceitar digitação livre; convertido no submit
  status:          FinanceStatus
  payment_method:  PaymentMethod | ''
  sale_date:       string
  received_date:   string
  notes:           string
}

export const EMPTY_FINANCE_FORM: FinanceFormValues = {
  type: 'projeto', client_name: '', company_name: '', description: '', amount: '',
  status: 'pendente', payment_method: '', sale_date: new Date().toISOString().slice(0, 10),
  received_date: '', notes: '',
}

export function transactionToForm(t: FinancialTransaction): FinanceFormValues {
  return {
    type: t.type,
    client_name: t.client_name ?? '',
    company_name: t.company_name ?? '',
    description: t.description,
    amount: String(t.amount),
    status: t.status,
    payment_method: t.payment_method ?? '',
    sale_date: t.sale_date,
    received_date: t.received_date ?? '',
    notes: t.notes ?? '',
  }
}

const inputClass = 'h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15'
const labelClass = 'mb-1.5 block text-xs font-semibold text-white/60'

interface Props {
  open:       boolean
  onOpenChange: (open: boolean) => void
  editingTitle: string  // "Nova entrada financeira" | "Editar entrada financeira"
  form:       FinanceFormValues
  setForm:    (updater: (f: FinanceFormValues) => FinanceFormValues) => void
  saving:     boolean
  error:      string
  onSubmit:   () => void
}

export default function FinanceTransactionModal({
  open, onOpenChange, editingTitle, form, setForm, saving, error, onSubmit,
}: Props) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onOpenChange(false)}>
      <DialogContent
        showCloseButton
        className="max-w-lg rounded-2xl border border-white/[0.09] bg-[#0D1428] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.50)] max-h-[90vh] overflow-y-auto"
      >
        <DialogTitle className="mb-5 text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          {editingTitle}
        </DialogTitle>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="fin-type">Tipo <span className="text-[#F59E0B]">*</span></label>
              <select id="fin-type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as FinanceType }))}
                className={`${inputClass} bg-[#0D1428]`} disabled={saving}>
                {(Object.keys(FINANCE_TYPE_LABEL) as FinanceType[]).map(k => <option key={k} value={k}>{FINANCE_TYPE_LABEL[k]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="fin-status">Status <span className="text-[#F59E0B]">*</span></label>
              <select id="fin-status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as FinanceStatus }))}
                className={`${inputClass} bg-[#0D1428]`} disabled={saving}>
                {(Object.keys(FINANCE_STATUS_LABEL) as FinanceStatus[]).map(k => <option key={k} value={k}>{FINANCE_STATUS_LABEL[k]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="fin-client">Cliente</label>
              <input id="fin-client" type="text" placeholder="Nome do cliente" value={form.client_name}
                onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} className={inputClass} disabled={saving} />
            </div>
            <div>
              <label className={labelClass} htmlFor="fin-company">Empresa</label>
              <input id="fin-company" type="text" placeholder="Nome da empresa" value={form.company_name}
                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} className={inputClass} disabled={saving} />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="fin-desc">Descrição <span className="text-[#F59E0B]">*</span></label>
            <input id="fin-desc" type="text" placeholder="Ex: E-book Automação de Processos" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputClass} disabled={saving} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="fin-amount">Valor (R$) <span className="text-[#F59E0B]">*</span></label>
              <input id="fin-amount" type="text" inputMode="decimal" placeholder="0,00" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/[^0-9,.]/g, '') }))} className={inputClass} disabled={saving} />
            </div>
            <div>
              <label className={labelClass} htmlFor="fin-payment">Forma de pagamento</label>
              <select id="fin-payment" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod | '' }))}
                className={`${inputClass} bg-[#0D1428]`} disabled={saving}>
                <option value="">Não informado</option>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map(k => <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="fin-sale-date">Data da venda <span className="text-[#F59E0B]">*</span></label>
              <input id="fin-sale-date" type="date" value={form.sale_date}
                onChange={e => setForm(f => ({ ...f, sale_date: e.target.value }))} className={inputClass} disabled={saving} />
            </div>
            <div>
              <label className={labelClass} htmlFor="fin-received-date">Data de recebimento</label>
              <input id="fin-received-date" type="date" value={form.received_date}
                onChange={e => setForm(f => ({ ...f, received_date: e.target.value }))} className={inputClass} disabled={saving} />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="fin-notes">Observações</label>
            <textarea id="fin-notes" rows={3} placeholder="Notas internas sobre esta entrada..." value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50 focus:ring-2 focus:ring-[#005BFF]/15" disabled={saving} />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" disabled={saving} onClick={() => onOpenChange(false)}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-sm font-semibold text-white/60 transition-all hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-2.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,91,255,0.30)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <><Loader2 size={15} className="animate-spin" />Salvando...</> : <><Save size={15} />Salvar entrada</>}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
