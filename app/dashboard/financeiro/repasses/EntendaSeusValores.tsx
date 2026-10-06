'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, HelpCircle, Clock, ShieldCheck, Wallet, RefreshCw } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

const ITEMS = [
  { icon: Clock, color: '#F59E0B', title: 'Retenção', text: 'Parcela da venda que aguarda o prazo inicial antes de poder entrar num repasse.' },
  { icon: ShieldCheck, color: '#6D28D9', title: 'Reserva de segurança', text: 'Parcela separada preventivamente da sua participação, liberada depois de um prazo maior sem disputa na venda.' },
  { icon: Wallet, color: colors.primary, title: 'Disponível', text: 'Valor já elegível, pronto para ser incluído num repasse.' },
  { icon: RefreshCw, color: '#10B981', title: 'Repasse', text: 'Transferência feita pelo time LOBBY cobrindo uma ou mais vendas elegíveis — registrada aqui assim que confirmada.' },
]

export default function EntendaSeusValores() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.card }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: colors.text }}>
          <HelpCircle size={15} aria-hidden="true" />Entenda seus valores
        </span>
        {open ? <ChevronDown size={16} style={{ color: colors.textMuted }} aria-hidden="true" /> : <ChevronRight size={16} style={{ color: colors.textMuted }} aria-hidden="true" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {ITEMS.map(it => (
            <div key={it.title} className="flex items-start gap-2">
              <it.icon size={14} style={{ color: it.color }} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold" style={{ color: colors.text }}>{it.title}</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>{it.text}</p>
              </div>
            </div>
          ))}
          <p className="border-t pt-2 text-[11px]" style={{ borderColor: colors.border, color: colors.textMuted }}>
            As condições podem variar conforme a política aplicada à venda. Consulte os detalhes em cada venda ou repasse.
            Prazos e percentuais mostrados nesta página vêm sempre da venda em questão — nunca um calendário fixo.
          </p>
        </div>
      )}
    </div>
  )
}
