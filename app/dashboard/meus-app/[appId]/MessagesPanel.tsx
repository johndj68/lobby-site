'use client'

import Link from 'next/link'
import { MessageSquare, HelpCircle } from 'lucide-react'
import { colors as C } from '@/lib/design-tokens'
import { formatDateTimeBR, SUBMISSION_STATUS_LABELS } from '@/lib/marketplace'

export interface MessageItem { id: string; text: string; at: string; status: string; submittedAt: string }

const KIND_LABEL: Record<string, { label: string; color: string }> = {
  changes_requested: { label: 'Pedido de ajuste', color: '#B45309' },
  rejected: { label: 'Decisão: rejeitado', color: '#B91C1C' },
  approved: { label: 'Decisão: aprovado', color: '#15803D' },
  pending: { label: 'Informação sobre a análise', color: C.primary },
}

/** Aba "Mensagens da equipe" — cada mensagem é o public_feedback real de UMA
 *  submissão específica (não existe um chat/thread separado no sistema hoje).
 *  Isso já distingue naturalmente pedido de ajuste / decisão / info, porque
 *  vem do status real daquela versão — nunca inventa uma categoria à parte. */
export default function MessagesPanel({ messages, appId, isLatest }: { messages: MessageItem[]; appId: string; isLatest: (submittedAt: string) => boolean }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center" style={{ borderColor: C.border }}>
        <MessageSquare size={28} className="mx-auto mb-3" style={{ color: C.textMuted }} aria-hidden="true" />
        <p className="text-sm font-semibold" style={{ color: C.text }}>Quando a equipe enviar orientações, elas aparecerão aqui.</p>
        <Link href="/dashboard/suporte" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.primary }}>
          <HelpCircle size={14} aria-hidden="true" /> Contatar suporte
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {messages.map(m => {
        const kind = KIND_LABEL[m.status] ?? KIND_LABEL.pending
        const current = isLatest(m.submittedAt)
        return (
          <div key={m.id} className="rounded-2xl border bg-white p-5" style={{ borderColor: C.border }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}>L</div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: C.text }}>Equipe LOBBY</p>
                  <p className="text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(m.at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {!current && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: C.backgroundAlt, color: C.textMuted }}>
                    Versão anterior
                  </span>
                )}
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${kind.color}18`, color: kind.color }}>
                  {kind.label}
                </span>
              </div>
            </div>
            <p className="mt-3 rounded-xl p-3 text-sm" style={{ background: C.backgroundAlt, color: C.text }}>{m.text}</p>
            <p className="mt-2 text-xs" style={{ color: C.textMuted }}>
              Referente à versão enviada em {formatDateTimeBR(m.submittedAt)} · {SUBMISSION_STATUS_LABELS[m.status] ?? m.status}
            </p>
            {current && (m.status === 'changes_requested' || m.status === 'rejected') && (
              <Link href={`/dashboard/meus-app/novo/${appId}/editar`}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: C.primary }}>
                Corrigir pelo cadastro
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}
