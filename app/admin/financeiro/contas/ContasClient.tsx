'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Banknote, Receipt, CheckCircle2, X, Loader2 } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'

export interface AccountRow {
  id:          string
  description: string
  amount:      number
  category?:   string | null
  payer_name?: string | null
  due_date:    string | null
  status:      'pendente' | 'pago' | 'recebido' | 'cancelado'
  notes:       string | null
  created_at:  string
}

interface Props {
  user:                SupabaseUser
  profile:             { full_name?: string } | null
  payable:             AccountRow[]
  receivable:          AccountRow[]
  payoutPendingTotal:  number
  payoutPendingCount:  number
  chargesPendingTotal: number
  chargesPendingCount: number
}

type Kind = 'payable' | 'receivable'

function NewEntryModal({ kind, onClose, onCreated }: { kind: Kind; onClose: () => void; onCreated: () => void }) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    const parsedAmount = Number(amount.replace(',', '.'))
    if (!description.trim() || !parsedAmount || parsedAmount <= 0) {
      setError('Informe descrição e valor válido.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/accounts/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'payable'
            ? { description, amount: parsedAmount, category: category || null, dueDate: dueDate || null, notes: notes || null }
            : { description, amount: parsedAmount, payerName: category || null, dueDate: dueDate || null, notes: notes || null }
        ),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{kind === 'payable' ? 'Nova conta a pagar' : 'Nova conta a receber'}</h3>
          <button onClick={onClose} className="text-[#5D6475]"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5D6475]">Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-[#E3E7F0] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5D6475]">Valor (R$)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00"
              className="w-full rounded-lg border border-[#E3E7F0] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5D6475]">
              {kind === 'payable' ? 'Categoria/fornecedor (opcional)' : 'Pagador (opcional)'}
            </label>
            <input value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-[#E3E7F0] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5D6475]">Vencimento (opcional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-[#E3E7F0] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5D6475]">Observações (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border border-[#E3E7F0] px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[#E3E7F0] px-4 py-2 text-sm font-semibold">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-lg bg-[#005BFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="inline animate-spin" /> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AccountsTable({ rows, kind, onChanged }: { rows: AccountRow[]; kind: Kind; onChanged: () => void }) {
  const [updating, setUpdating] = useState<string | null>(null)
  const doneStatus = kind === 'payable' ? 'pago' : 'recebido'

  const handleStatusChange = async (id: string, status: string) => {
    setUpdating(id)
    try {
      await fetch(`/api/admin/accounts/${kind}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      onChanged()
    } finally {
      setUpdating(null)
    }
  }

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-[#5D6475]">Nenhum lançamento manual.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E3E7F0] text-left text-xs text-[#5D6475]">
            <th className="px-4 py-3">Descrição</th>
            <th className="px-4 py-3">Valor</th>
            <th className="px-4 py-3">Vencimento</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[#E3E7F0] last:border-0">
              <td className="px-4 py-3">
                <p className="font-semibold">{r.description}</p>
                {(r.category || r.payer_name) && <p className="text-xs text-[#5D6475]">{r.category || r.payer_name}</p>}
              </td>
              <td className="px-4 py-3 font-semibold">{formatCurrencyBRL(r.amount)}</td>
              <td className="px-4 py-3 text-[#5D6475]">{r.due_date ? formatDateBR(r.due_date) : '—'}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  r.status === doneStatus ? 'bg-green-100 text-green-700' : r.status === 'cancelado' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'
                }`}>
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-3">
                {r.status === 'pendente' && (
                  <div className="flex gap-2">
                    <button disabled={updating === r.id} onClick={() => handleStatusChange(r.id, doneStatus)}
                      className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline">
                      <CheckCircle2 size={13} /> Marcar {doneStatus}
                    </button>
                    <button disabled={updating === r.id} onClick={() => handleStatusChange(r.id, 'cancelado')}
                      className="text-xs font-semibold text-red-600 hover:underline">
                      Cancelar
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ContasClient({
  user, profile, payable, receivable, payoutPendingTotal, payoutPendingCount, chargesPendingTotal, chargesPendingCount,
}: Props) {
  const [modal, setModal] = useState<Kind | null>(null)
  const refresh = () => window.location.reload()

  return (
    <AdminShell user={user} profile={profile}>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs text-[#5D6475]">
          <Link href="/admin/financeiro" className="hover:underline">Financeiro</Link> / Contas a pagar e receber
        </p>
        <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Contas a pagar e receber</h1>
        <p className="mb-6 text-sm text-[#5D6475]">
          Lançamentos manuais (fornecedores, contratos) unificados com o que já é rastreado automaticamente
          no sistema — repasse pendente a parceiro e cobranças pendentes de crédito/e-book.
        </p>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold"><Banknote size={16} /> A pagar</h2>
              <button onClick={() => setModal('payable')}
                className="flex items-center gap-1 rounded-lg border border-[#E3E7F0] px-3 py-1.5 text-xs font-semibold hover:border-[#005BFF]">
                <Plus size={13} /> Novo
              </button>
            </div>
            {payoutPendingCount > 0 && (
              <Link href="/admin/marketplace/repasses"
                className="mb-3 block rounded-xl bg-amber-50 p-3 text-xs text-amber-800 hover:bg-amber-100">
                Repasse a parceiros: <strong>{formatCurrencyBRL(payoutPendingTotal)}</strong> em {payoutPendingCount} venda(s) elegível/retida — ver detalhes →
              </Link>
            )}
            <AccountsTable rows={payable} kind="payable" onChanged={refresh} />
          </div>

          <div className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold"><Receipt size={16} /> A receber</h2>
              <button onClick={() => setModal('receivable')}
                className="flex items-center gap-1 rounded-lg border border-[#E3E7F0] px-3 py-1.5 text-xs font-semibold hover:border-[#005BFF]">
                <Plus size={13} /> Novo
              </button>
            </div>
            {chargesPendingCount > 0 && (
              <Link href="/admin/financeiro"
                className="mb-3 block rounded-xl bg-amber-50 p-3 text-xs text-amber-800 hover:bg-amber-100">
                Cobranças pendentes (créditos/e-books): <strong>{formatCurrencyBRL(chargesPendingTotal)}</strong> em {chargesPendingCount} compra(s) — ver no financeiro →
              </Link>
            )}
            <AccountsTable rows={receivable} kind="receivable" onChanged={refresh} />
          </div>
        </div>
      </div>

      {modal && <NewEntryModal kind={modal} onClose={() => setModal(null)} onCreated={refresh} />}
    </AdminShell>
  )
}
