'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FilePlus2, Send, CheckCircle2, XCircle, AlertTriangle, Rocket, ChevronRight, ChevronDown } from 'lucide-react'
import { colors as C } from '@/lib/design-tokens'
import { formatDateTimeBR } from '@/lib/marketplace'

export interface HistoryEntry { id: string; status: string; submittedAt: string; reviewedAt: string | null; publishedAt: string | null }

export interface TimelineEvent {
  at: string; label: string; icon: React.ElementType; color: string
  submissionId?: string
}

const PAGE_SIZE = 8

/** Só eventos que realmente aconteceram (created_at do rascunho + cada
 *  submissão real). Autosave nunca vira evento aqui — não existe um
 *  registro de autosave pra virar um. Reaproveitado pela Visão geral
 *  ("Últimas atualizações", só os mais recentes) e por esta aba inteira. */
export function buildTimelineEvents(createdAt: string, history: HistoryEntry[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { at: createdAt, label: 'Cadastro criado', icon: FilePlus2, color: C.textSecondary },
  ]
  for (const h of [...history].reverse()) {
    events.push({ at: h.submittedAt, label: 'Versão enviada para análise', icon: Send, color: C.primary, submissionId: h.id })
    if (h.reviewedAt) {
      const meta = h.status === 'approved' ? { label: 'Versão aprovada', icon: CheckCircle2, color: '#15803D' }
        : h.status === 'rejected' ? { label: 'Versão rejeitada', icon: XCircle, color: '#B91C1C' }
        : h.status === 'changes_requested' ? { label: 'Ajustes solicitados', icon: AlertTriangle, color: '#B45309' }
        : { label: 'Análise concluída', icon: CheckCircle2, color: C.textSecondary }
      events.push({ at: h.reviewedAt, ...meta, submissionId: h.id })
    }
    if (h.publishedAt) {
      events.push({ at: h.publishedAt, label: 'Publicado no marketplace', icon: Rocket, color: '#15803D', submissionId: h.id })
    }
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return events
}

export default function HistoryPanel({ appId, createdAt, history }: { appId: string; createdAt: string; history: HistoryEntry[] }) {
  const [visible, setVisible] = useState(PAGE_SIZE)
  const events = buildTimelineEvents(createdAt, history)

  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: C.border }}>
      {history.length === 0 && (
        <p className="mb-4 text-sm" style={{ color: C.textSecondary }}>
          Nenhum envio para análise. Seu histórico será atualizado conforme você avançar.
        </p>
      )}
      <ol className="space-y-4 border-l pl-4" style={{ borderColor: C.border }}>
        {events.slice(0, visible).map((e, i) => {
          const Icon = e.icon
          return (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white" style={{ border: `2px solid ${e.color}` }} aria-hidden="true">
                <Icon size={8} style={{ color: e.color }} />
              </span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold" style={{ color: C.text }}>{e.label}</p>
                {e.submissionId && (
                  <Link href={`/dashboard/meus-app/${appId}/previa?v=submission&submissionId=${e.submissionId}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: C.primary }}>
                    Ver esta versão <ChevronRight size={11} aria-hidden="true" />
                  </Link>
                )}
              </div>
              <p className="text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(e.at)}</p>
            </li>
          )
        })}
      </ol>
      {visible < events.length && (
        <button type="button" onClick={() => setVisible(v => v + PAGE_SIZE)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
          Mostrar mais <ChevronDown size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
