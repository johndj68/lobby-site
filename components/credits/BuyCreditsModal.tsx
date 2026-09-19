'use client'

import { useState } from 'react'
import { X, ShoppingCart, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatCurrencyBRL } from '@/lib/finance'
import { formatCredits } from '@/lib/credits'
import type { CreditPackage } from '@/types'

interface Props {
  pkg:     CreditPackage | null
  userId:  string
  onClose: () => void
}

export default function BuyCreditsModal({ pkg, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (!pkg) return null

  const handleContinue = async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ package_id: pkg.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao iniciar pagamento')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar o pagamento. Tente novamente.')
      setLoading(false)
    }
    // Note: setLoading(false) is intentionally omitted on success —
    // the browser navigates away so the component unmounts.
  }

  return (
    <Dialog open={!!pkg} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md rounded-3xl border border-[#E3E7F0] bg-white p-6 shadow-[0_32px_80px_rgba(0,0,0,0.18)]"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <DialogTitle className="text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Comprar créditos
          </DialogTitle>
          <button type="button" disabled={loading} onClick={onClose}
            className="rounded-xl p-2 text-[#5D6475] transition-colors hover:bg-[#F7F8FC] hover:text-[#0B1020]" aria-label="Fechar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Package summary */}
        <div className="rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC] p-4">
          <p className="text-sm font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{pkg.name}</p>
          {pkg.description && <p className="mt-1 text-xs text-[#5D6475]">{pkg.description}</p>}
          <div className="mt-3 flex items-center justify-between border-t border-[#E3E7F0] pt-3">
            <span className="text-xs font-medium text-[#5D6475]">{formatCredits(pkg.credits_amount)}</span>
            <span className="text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {formatCurrencyBRL(pkg.price)}
            </span>
          </div>
        </div>

        {/* Info */}
        <p className="mt-4 rounded-xl bg-[#EFF6FF] px-4 py-3 text-xs leading-relaxed text-[#1D4ED8]">
          Você será redirecionado ao Stripe para concluir o pagamento com segurança.
          Os créditos são liberados automaticamente após a confirmação.
        </p>

        {error && <p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}

        {/* Actions */}
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} disabled={loading}
            className="flex-1 rounded-xl border border-[#E3E7F0] py-3 text-sm font-semibold text-[#5D6475] transition-colors hover:bg-[#F7F8FC] disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={handleContinue} disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
            {loading
              ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />Redirecionando…</>
              : <><ShoppingCart size={15} aria-hidden="true" />Ir para pagamento</>
            }
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
