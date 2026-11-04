'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import type { HistoryEvent } from './types'

const ACTOR_LABEL: Record<HistoryEvent['actorRole'], string> = { equipe_lobby: 'Equipe LOBBY', parceiro: 'Você', sistema: 'Automático' }

interface Props {
  events: HistoryEvent[]
  loading: boolean
}

export default function HistoricoRecebimento({ events, loading }: Props) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? events : events.slice(0, 2)

  return (
    <div className="mt-5 rounded-xl border p-5" style={{ borderColor: colors.border, background: colors.card }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: colors.text }}>Histórico de alterações</p>
        {events.length > 2 && (
          <button type="button" onClick={() => setExpanded(e => !e)} className="text-xs font-semibold" style={{ color: colors.primary }}>
            {expanded ? 'Ver menos' : 'Ver histórico'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: colors.borderLight }} />)}</div>
      ) : events.length === 0 ? (
        <p className="text-xs" style={{ color: colors.textMuted }}>Nenhuma alteração registrada ainda.</p>
      ) : (
        <div className="space-y-3 border-l-2 pl-3" style={{ borderColor: colors.border }}>
          {visible.map((e, i) => (
            <div key={i} className="relative">
              <span className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: colors.primary, background: colors.card }} />
              <p className="text-sm font-semibold" style={{ color: colors.text }}>{e.description}</p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                Por {ACTOR_LABEL[e.actorRole]} · {new Date(e.createdAt).toLocaleDateString('pt-BR')}, {new Date(e.createdAt).toTimeString().slice(0, 5)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-1.5 text-[11px]" style={{ color: colors.textMuted }}>
        <Lock size={11} aria-hidden="true" />O histórico preserva seus dados sensíveis — nunca mostra a chave ou conta completa.
      </div>
    </div>
  )
}
