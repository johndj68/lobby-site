'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { PAYOUT_RETENTION_DAYS, DISPUTE_RESERVE_WINDOW_DAYS } from '@/lib/services/payouts'

interface Props { partnerId: string | null }

const STEPS = [
  { n: 1, title: 'Configure o recebimento', desc: 'Mantenha os dados atualizados.' },
  { n: 2, title: 'Acompanhe a liberação', desc: `Retenção de ${PAYOUT_RETENTION_DAYS} dias e reserva de segurança de ${DISPUTE_RESERVE_WINDOW_DAYS} dias, conforme a política de cada venda.` },
  { n: 3, title: 'Confira o repasse', desc: 'Veja a situação de cada pagamento em Repasses e extrato.' },
]

export default function ComoFuncionamRepasses({ partnerId }: Props) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: colors.border, background: colors.card }}>
      <p className="mb-4 text-sm font-bold" style={{ color: colors.text }}>Como funcionam os repasses</p>
      <div className="space-y-3">
        {STEPS.map(s => (
          <div key={s.n} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: `${colors.primary}14`, color: colors.primary }}>{s.n}</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: colors.text }}>{s.title}</p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px]" style={{ color: colors.textMuted }}>
        Mudanças no cadastro não alteram repasses já enviados — valem a partir do próximo registrado. As condições podem variar conforme a política aplicada a cada venda.
      </p>
      <Link href={`/dashboard/financeiro/repasses${partnerId ? `?parceiro=${partnerId}` : ''}`}
        className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-semibold" style={{ borderColor: colors.primary, color: colors.primary }}>
        Ver repasses e extrato <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </div>
  )
}
