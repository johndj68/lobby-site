'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import type { DestinationDetail } from './types'

const METODO_LABEL: Record<string, string> = { pix: 'Pix', bank_transfer: 'Transferência bancária' }

interface Props {
  open: boolean
  partnerId: string | null
  current: DestinationDetail | null
  onClose: () => void
  onCancelled: () => void
}

export default function PendingRequestSheet({ open, partnerId, current, onClose, onCancelled }: Props) {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState('')

  async function handleCancel() {
    if (!current?.pendingRequestId) return
    setCancelling(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: userData } = await supabase.auth.getUser()
      const { data, error: rpcError } = await supabase.rpc('cancel_partner_payout_destination_request', {
        p_partner_id: partnerId ?? userData.user?.id,
        p_request_id: current.pendingRequestId,
      })
      if (rpcError || !data) throw new Error(rpcError?.message || 'Não foi possível cancelar.')
      toast.success('Alteração pendente cancelada.')
      onCancelled()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cancelar. Tente novamente.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Alteração em análise</SheetTitle>
          <SheetDescription>Esta proposta ainda não foi aprovada — o destino vigente continua valendo até lá.</SheetDescription>
        </SheetHeader>

        {current?.pendingRequestId && (
          <div className="flex flex-col gap-5 px-4 pb-6">
            <div className="flex items-start gap-2 rounded-lg border p-3 text-xs" style={{ borderColor: '#F59E0B', background: '#F59E0B0D', color: colors.text }}>
              <Clock size={14} style={{ color: '#F59E0B' }} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>Enviada {current.pendingCreatedAt ? `em ${new Date(current.pendingCreatedAt).toLocaleDateString('pt-BR')}, ${new Date(current.pendingCreatedAt).toTimeString().slice(0, 5)}` : ''} — aguardando revisão da equipe LOBBY.</span>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Destino vigente (não mudou ainda)</p>
              <p className="text-sm" style={{ color: colors.text }}>
                {current.payoutMethod ? `${METODO_LABEL[current.payoutMethod]} — ${current.accountHolder ?? '—'}` : 'Nenhum cadastro anterior.'}
              </p>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: colors.primary, background: `${colors.primary}0D` }}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.primary }}>Proposta enviada</p>
              <div className="space-y-1 text-sm" style={{ color: colors.text }}>
                <p><span style={{ color: colors.textSecondary }}>Método:</span> {current.pendingMethod ? METODO_LABEL[current.pendingMethod] : '—'}</p>
                <p><span style={{ color: colors.textSecondary }}>Titular:</span> {current.pendingAccountHolder ?? '—'}</p>
                {current.pendingMethod === 'pix'
                  ? <p><span style={{ color: colors.textSecondary }}>Chave Pix:</span> {current.pendingMaskedPix ?? '—'}</p>
                  : <p><span style={{ color: colors.textSecondary }}>Conta:</span> {current.pendingBankName ?? '—'} {current.pendingMaskedBankAccount ?? ''}</p>}
              </div>
            </div>

            {error && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>}

            <button type="button" onClick={handleCancel} disabled={cancelling}
              className="inline-flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: '#EF4444', color: '#EF4444' }}>
              {cancelling && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {cancelling ? 'Cancelando…' : 'Cancelar esta alteração'}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
