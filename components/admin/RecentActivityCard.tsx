'use client'

import { useState } from 'react'
import { Activity } from 'lucide-react'
import { colors, shadows } from '@/lib/design-tokens'
import { timeAgo } from './ContactCard'
import { buildActivityItems, ACTIVITY_KIND_CONFIG, type ActivityLead } from './activity'
import ActivitiesDrawer from './ActivitiesDrawer'
import type { Contact } from '@/app/admin/solicitacoes/page'

/**
 * Props do RecentActivityCard.
 * - contacts: lista de contatos/solicitações recebidos — fonte de eventos do tipo "solicitacao"
 * - leads: lista de leads de materiais baixados — fonte de eventos do tipo "lead"
 * - onViewArea: callback disparado ao clicar para filtrar por área no drawer de atividades
 */
interface Props {
  contacts:   Contact[]
  leads:      ActivityLead[]
  onViewArea: (area: string) => void
}

/**
 * Card de atividade recente no painel admin.
 * Combina contatos e leads em uma timeline unificada, exibindo os
 * 5 eventos mais recentes. Cada evento tem um ícone e cor conforme
 * seu tipo (solicitacao, lead, projeto, arquivo, sistema).
 * O botão "Ver todas" abre o ActivitiesDrawer com a lista completa
 * e filtros por período e tipo.
 */
export default function RecentActivityCard({ contacts, leads, onViewArea }: Props) {
  // Controla a abertura do drawer com todas as atividades
  const [open, setOpen] = useState(false)

  // Combina e ordena contatos + leads por data, limitando a 5 itens para o card
  const items = buildActivityItems(contacts, leads).slice(0, 5)

  return (
    <>
      <div className="rounded-3xl border border-white/[0.08] p-5" style={{ background: colors.card }}>
        {/* Cabeçalho com título e ícone decorativo */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Atividade recente
          </h3>
          <Activity size={13} className="text-white/30" aria-hidden="true" />
        </div>

        {items.length > 0 ? (
          <div className="relative space-y-4">
            {/* Linha vertical conectando os itens da timeline */}
            <div className="pointer-events-none absolute left-[13px] top-2 h-[calc(100%-16px)] w-px bg-white/[0.06]" aria-hidden="true" />

            {/* Cada item da timeline: ícone do tipo + título + categoria e data */}
            {items.map(item => {
              // Configuração visual (ícone e cores) baseada no tipo de atividade
              const cfg = ACTIVITY_KIND_CONFIG[item.kind]
              const Icon = cfg.icon
              return (
                <div key={item.id} className="flex items-start gap-3">
                  {/* Ícone do evento posicionado sobre a linha vertical (z-10) */}
                  <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: cfg.bg }}>
                    <Icon size={12} style={{ color: cfg.color }} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    {/* Título do evento, truncado para caber em uma linha */}
                    <p className="truncate text-xs font-semibold text-white/80">{item.title}</p>
                    {/* Categoria da área de interesse e tempo relativo */}
                    <p className="text-[10px] text-white/35">{item.category ?? 'Geral'} • {timeAgo(item.createdAt)}</p>
                  </div>
                  {/* Badge "Novo" para destacar eventos recentes */}
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: `${colors.primary}/15`, color: colors.primaryLight }}>
                    Novo
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          // Estado vazio quando não há atividades registradas
          <p className="text-center text-xs text-white/30">Nenhuma atividade.</p>
        )}

        {/* Botão para abrir o drawer com histórico completo de atividades */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ver todas as atividades"
          className="mt-4 w-full text-center text-[10px] text-white/30 transition-colors hover:text-white/60"
        >
          Ver todas as atividades →
        </button>
      </div>

      {/* Drawer lateral com todas as atividades, filtros por período e tipo */}
      <ActivitiesDrawer
        open={open}
        onClose={() => setOpen(false)}
        contacts={contacts}
        leads={leads}
        onViewArea={area => { setOpen(false); onViewArea(area) }}
      />
    </>
  )
}
