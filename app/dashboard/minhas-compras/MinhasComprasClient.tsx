'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ShoppingBag, Loader2, ExternalLink, Mail } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/finance'
import type { AppPurchase } from '@/types'

interface Props {
  user:      SupabaseUser
  profile:   { full_name?: string } | null
  purchases: AppPurchase[]
}

interface AccessInfo {
  activation_link: string | null
  support_email:   string | null
  instructions:    unknown
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Aguardando pagamento', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  paid:     { label: 'Pago',                 color: '#16A34A', bg: 'rgba(22,163,74,0.1)'  },
  canceled: { label: 'Cancelado',            color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
  failed:   { label: 'Falhou',               color: '#DC2626', bg: 'rgba(220,38,38,0.1)'  },
  refunded: { label: 'Reembolsado',          color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
}

/** Instruções de acesso vêm sempre de app_activation_config, buscadas sob
 *  demanda (por compra) via RPC get_my_app_purchase_access — nunca um
 *  código de ativação automático (app_activation_codes nunca foi ligado
 *  de verdade no sistema, ver comentário em
 *  lib/notifications.ts:buildAppPurchaseReceiptEmailHtml). */
function AccessPanel({ purchaseId }: { purchaseId: string }) {
  const [access, setAccess] = useState<AccessInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    createClient().rpc('get_my_app_purchase_access', { p_purchase_id: purchaseId }).then(({ data }) => {
      if (!active) return
      const row = Array.isArray(data) ? data[0] : data
      setAccess(row ?? null)
      setLoading(false)
    })
    return () => { active = false }
  }, [purchaseId])

  if (loading) return <p className="text-xs text-[#5D6475]"><Loader2 size={12} className="mr-1 inline animate-spin" aria-hidden="true" />Carregando acesso...</p>

  const instructionsText = access?.instructions && typeof access.instructions === 'object'
    ? Object.values(access.instructions as Record<string, string>).filter(Boolean).join(' · ')
    : (typeof access?.instructions === 'string' ? access.instructions : null)

  if (!access || (!access.activation_link && !access.support_email && !instructionsText)) {
    return <p className="text-xs text-[#92400E]">O parceiro ainda não configurou instruções de acesso — recebeu um e-mail e nossa equipe vai liberar manualmente.</p>
  }

  return (
    <div className="mt-3 rounded-xl bg-[#F0FDF4] p-3 text-xs text-[#166534]">
      {instructionsText && <p className="mb-1.5">{instructionsText}</p>}
      {access.activation_link && (
        <a href={access.activation_link} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-1.5 font-semibold hover:underline">
          <ExternalLink size={12} aria-hidden="true" />{access.activation_link}
        </a>
      )}
      {access.support_email && (
        <p className="flex items-center gap-1.5 text-[#6B7280]"><Mail size={12} aria-hidden="true" />{access.support_email}</p>
      )}
    </div>
  )
}

export default function MinhasComprasClient({ purchases }: Props) {
  const searchParams = useSearchParams()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
        <ShoppingBag size={22} className="text-[#005BFF]" aria-hidden="true" />
        Minhas compras
      </h1>

      {searchParams.get('checkout') === 'success' && (
        <p className="mt-4 rounded-xl bg-[#F0FDF4] px-4 py-3 text-xs text-[#166534]">
          Pagamento confirmado! Assim que o webhook do Stripe processar (geralmente segundos), sua compra aparece abaixo com as instruções de acesso.
        </p>
      )}

      {purchases.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#E3E7F0] p-10 text-center">
          <p className="text-sm text-[#5D6475]">Você ainda não comprou nenhum app.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {purchases.map(p => {
            const style = STATUS_LABEL[p.status]
            return (
              <div key={p.id} className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#0B1020]">{p.application_name}</p>
                    <p className="text-xs text-[#5D6475]">{p.plan_name} · {formatCurrencyBRL(p.amount)}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: style.bg, color: style.color }}>{style.label}</span>
                </div>
                {p.status === 'paid' && <AccessPanel purchaseId={p.id} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
