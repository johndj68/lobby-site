'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, Loader2, Ban } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { formatCurrencyBRL } from '@/lib/finance'
import { SUBSCRIPTION_STATUS_LABEL, BILLING_INTERVAL_LABEL, type Subscription } from '@/lib/services/subscriptions'

interface Props {
  user:          SupabaseUser
  profile:       { full_name?: string } | null
  subscriptions: Subscription[]
}

export default function AssinaturasClient({ subscriptions: initial }: Props) {
  const searchParams = useSearchParams()
  const [subscriptions, setSubscriptions] = useState(initial)
  const [canceling, setCanceling] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleCancel = async (sub: Subscription) => {
    if (!window.confirm(`Cancelar "${sub.plan_name}"? Continua ativa até o fim do ciclo atual (${sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('pt-BR') : '—'}), sem cobrar de novo depois.`)) return

    setCanceling(sub.id)
    setError('')
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/cancel`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao cancelar')
      setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, cancel_at_period_end: true } : s))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cancelar a assinatura.')
    } finally {
      setCanceling(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
        <RefreshCw size={22} className="text-[#005BFF]" aria-hidden="true" />
        Minhas assinaturas
      </h1>

      {searchParams.get('checkout') === 'success' && (
        <p className="mt-4 rounded-xl bg-[#F0FDF4] px-4 py-3 text-xs text-[#166534]">
          Assinatura confirmada! Assim que o webhook do Stripe processar, ela aparece abaixo.
        </p>
      )}
      {searchParams.get('checkout') === 'canceled' && (
        <p className="mt-4 rounded-xl bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E]">Assinatura cancelada antes de confirmar — nenhum valor foi cobrado.</p>
      )}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{error}</p>}

      {subscriptions.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#E3E7F0] p-10 text-center">
          <p className="text-sm text-[#5D6475]">Você ainda não tem nenhuma assinatura.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {subscriptions.map(sub => {
            const style = SUBSCRIPTION_STATUS_LABEL[sub.status]
            const canCancel = (sub.status === 'active' || sub.status === 'past_due' || sub.status === 'trialing') && !sub.cancel_at_period_end
            return (
              <div key={sub.id} className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#0B1020]">{sub.plan_name}</p>
                    <p className="text-xs text-[#5D6475]">
                      {formatCurrencyBRL(sub.amount)}{BILLING_INTERVAL_LABEL[sub.billing_interval]}
                      {sub.current_period_end && ` · Próxima cobrança: ${new Date(sub.current_period_end).toLocaleDateString('pt-BR')}`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: style.bg, color: style.color }}>{style.label}</span>
                </div>
                {sub.cancel_at_period_end && sub.status !== 'canceled' && (
                  <p className="mt-2 text-[11px] text-[#92400E]">Cancelamento agendado — ativa até o fim do ciclo atual, não renova.</p>
                )}
                {canCancel && (
                  <button type="button" disabled={canceling === sub.id} onClick={() => handleCancel(sub)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">
                    {canceling === sub.id ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Ban size={11} aria-hidden="true" />}
                    Cancelar assinatura
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
