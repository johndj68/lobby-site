'use client'

import { Info } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaveAndLeave: () => void
  onDiscard: () => void
  busy?: boolean
}

/** Confirmação de saída com alterações não salvas — mesma decisão em toda
 *  a área de cadastro (editar/planos): salvar e sair, descartar, ou
 *  continuar na tela. Nunca descarta silenciosamente. */
export default function UnsavedChangesDialog({ open, onOpenChange, onSaveAndLeave, onDiscard, busy }: Props) {
  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent showCloseButton={false} className="max-w-sm rounded-2xl border p-6" style={{ borderColor: colors.border, background: '#fff' }}>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: '#FEF3C7' }}>
          <Info size={22} style={{ color: '#D97706' }} aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>Alterações não salvas</h2>
        <p className="mt-2 text-sm" style={{ color: colors.textSecondary }}>Você tem alterações que ainda não foram salvas. O que deseja fazer?</p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={onSaveAndLeave}
            className="rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: colors.primary }}>
            {busy ? 'Salvando…' : 'Salvar e sair'}
          </button>
          <button type="button" disabled={busy} onClick={onDiscard}
            className="rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.border, color: '#DC2626' }}>
            Descartar alterações
          </button>
          <button type="button" disabled={busy} onClick={() => onOpenChange(false)}
            className="rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.border, color: colors.text }}>
            Continuar editando
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
