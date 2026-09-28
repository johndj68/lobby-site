'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, ScanSearch, AlertTriangle } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import type { Divergence } from '@/app/api/admin/conciliacao/run/route'

interface Props {
  user:    SupabaseUser
  profile: { full_name?: string } | null
}

const TYPE_LABEL: Record<Divergence['type'], { label: string; color: string }> = {
  sem_correspondencia: { label: 'Sem correspondência local', color: '#DC2626' },
  status_divergente:   { label: 'Status divergente',         color: '#DC2626' },
  valor_divergente:    { label: 'Valor divergente',          color: '#F59E0B' },
  reembolso_divergente: { label: 'Reembolso divergente',      color: '#F59E0B' },
}

const TODAY = new Date().toISOString().slice(0, 10)
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)

export default function ConciliacaoClient({ user, profile }: Props) {
  const [startDate, setStartDate] = useState(THIRTY_DAYS_AGO)
  const [endDate, setEndDate]     = useState(TODAY)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [result, setResult]       = useState<{ checkedCount: number; divergences: Divergence[] } | null>(null)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/conciliacao/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao conciliar')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao conciliar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs text-[#5D6475]">
          <Link href="/admin/financeiro" className="hover:underline">Financeiro</Link> / Conciliação
        </p>
        <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Conciliação Stripe</h1>
        <p className="mb-6 text-sm text-[#5D6475]">
          Compara as cobranças bem-sucedidas do Stripe no período com o que está gravado localmente
          (compras de crédito, app, campanha e assinatura). Roda sob demanda — nada é agendado nem salvo automaticamente.
        </p>

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#E3E7F0] bg-white p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5D6475]">Data inicial</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-[#E3E7F0] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5D6475]">Data final</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-[#E3E7F0] px-3 py-2 text-sm" />
          </div>
          <button onClick={handleRun} disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-[#005BFF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} />}
            Conciliar
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {result && (
          <div className="rounded-2xl border border-[#E3E7F0] bg-white p-5">
            <p className="mb-4 text-sm text-[#5D6475]">
              {result.checkedCount} cobrança(s) verificada(s) no período · {result.divergences.length} divergência(s) encontrada(s)
            </p>

            {result.divergences.length === 0 ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-green-700">Tudo conciliado — nenhuma divergência.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E3E7F0] text-left text-xs text-[#5D6475]">
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Cobrança Stripe</th>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Valor Stripe</th>
                      <th className="px-3 py-2">Local</th>
                      <th className="px-3 py-2">Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.divergences.map((d, i) => {
                      const meta = TYPE_LABEL[d.type]
                      return (
                        <tr key={`${d.stripeChargeId}-${i}`} className="border-b border-[#E3E7F0] last:border-0">
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1.5 font-semibold" style={{ color: meta.color }}>
                              <AlertTriangle size={13} /> {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-[#5D6475]">{d.stripeChargeId}</td>
                          <td className="px-3 py-2 text-[#5D6475]">{formatDateBR(d.createdAt)}</td>
                          <td className="px-3 py-2">
                            {formatCurrencyBRL(d.stripeAmount)}
                            {d.stripeRefunded > 0 && <span className="text-xs text-[#5D6475]"> (reemb. {formatCurrencyBRL(d.stripeRefunded)})</span>}
                          </td>
                          <td className="px-3 py-2">
                            {d.localAmount != null ? formatCurrencyBRL(d.localAmount) : '—'}
                            {d.localStatus && <span className="text-xs text-[#5D6475]"> · {d.localStatus}</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-[#5D6475]">{d.table ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
