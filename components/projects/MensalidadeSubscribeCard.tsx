'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/finance'
import type { ClientProject } from '@/types'

interface Props {
  project: ClientProject
}

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due']

/**
 * Card "assinar mensalidade" — só renderiza quando o líder definiu
 * monthly_fee (nullable, sem catálogo — cada projeto tem seu próprio
 * valor). Redireciona pro checkout de assinatura (Stripe Billing);
 * confirmação real vem do webhook (checkout.session.completed +
 * invoice.paid), não daqui.
 */
export default function MensalidadeSubscribeCard({ project }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [hasActive, setHasActive] = useState(false)

  useEffect(() => {
    createClient()
      .from('subscriptions')
      .select('status')
      .eq('client_project_id', project.id)
      .in('status', ACTIVE_STATUSES)
      .maybeSingle()
      .then(({ data }) => setHasActive(!!data))
  }, [project.id])

  if (!project.monthly_fee || project.monthly_fee <= 0) return null

  const isActive = hasActive

  const handleSubscribe = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'mensalidade', client_project_id: project.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao iniciar assinatura')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar a assinatura.')
      setLoading(false)
    }
  }

  return (
    <section aria-label="Mensalidade do projeto">
      <div className="rounded-2xl border border-[#93C5FD]/40 bg-[#EFF6FF] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#005BFF]/12">
              <RefreshCw size={18} className="text-[#005BFF]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#0B1020]">Mensalidade deste projeto</p>
              <p className="mt-0.5 text-xs text-[#1D4ED8]">{formatCurrencyBRL(project.monthly_fee)}/mês, cobrado automaticamente via Stripe</p>
            </div>
          </div>

          {isActive ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#10B981]/12 px-4 py-2.5 text-xs font-bold text-[#10B981]">
              <CheckCircle2 size={14} aria-hidden="true" />Assinatura ativa
            </span>
          ) : (
            <button type="button" onClick={handleSubscribe} disabled={loading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-60">
              {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
              {loading ? 'Redirecionando...' : 'Assinar mensalidade'}
            </button>
          )}
        </div>
        {error && <p role="alert" className="mt-3 text-xs font-medium text-red-500">{error}</p>}
      </div>
    </section>
  )
}
