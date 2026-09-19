'use client'

import { useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { AREA_CONFIG, DEFAULT_CFG, FILTERS } from './ContactCard'
import AreaDetailsDrawer from './AreaDetailsDrawer'
import type { Contact } from '@/app/admin/solicitacoes/page'

/**
 * Props do AreaSummaryCard.
 * - contacts: lista completa de contatos para calcular as métricas por área
 * - onViewArea: callback ao clicar em "filtrar por área" no drawer de detalhes
 * - onViewAll: callback ao clicar em "ver todos" no drawer de detalhes
 */
interface Props {
  contacts:   Contact[]
  onViewArea: (area: string) => void
  onViewAll:  () => void
}

/**
 * Card de resumo de leads agrupados por área de interesse.
 * Exibe um gráfico de donut com a distribuição percentual de cada área
 * e uma lista com contagem absoluta e percentual por categoria.
 * Ao clicar em "Ver detalhado", abre o AreaDetailsDrawer com informações
 * mais granulares sobre cada área.
 */
export default function AreaSummaryCard({ contacts, onViewArea, onViewAll }: Props) {
  // Controla a abertura do drawer de detalhamento por área
  const [open, setOpen] = useState(false)

  // Total de contatos — usado como denominador para calcular percentuais
  const total = contacts.length

  /**
   * Gera um array com contagem, percentual e configuração visual
   * para cada área de interesse (excluindo "Todos" da lista de filtros).
   */
  const areaCounts = FILTERS.slice(1).map(area => ({
    area,
    count: contacts.filter(c => c.interest_area === area).length,
    pct: total ? Math.round((contacts.filter(c => c.interest_area === area).length / total) * 100) : 0,
    cfg: AREA_CONFIG[area] ?? DEFAULT_CFG,
  }))

  // Área com maior número de contatos — usada para calcular a lacuna do donut
  const topArea = [...areaCounts].sort((a, b) => b.count - a.count)[0]
  const topPct  = topArea?.count && total ? Math.round((topArea.count / total) * 100) : 0

  /**
   * Constrói os segmentos do gráfico de donut como string de conic-gradient.
   * Cada área ocupa um arco proporcional ao seu percentual, posicionado
   * acumulando os percentuais anteriores como ponto de início.
   */
  const gradient = areaCounts.reduce<string[]>((acc, { pct, cfg }, i) => {
    const prev = areaCounts.slice(0, i).reduce((s, x) => s + x.pct, 0)
    if (pct > 0) acc.push(`${cfg.accent} ${prev}% ${prev + pct}%`)
    return acc
  }, [])

  // Estilo CSS do donut: conic-gradient quando há dados, cinza escuro quando vazio
  const donutStyle = gradient.length
    ? { background: `conic-gradient(${gradient.join(', ')}, #1E293B ${topPct}% 100%)` }
    : { background: '#1E293B' }

  return (
    <>
      <div className="rounded-3xl border border-white/[0.08] p-5" style={{ background: colors.card }}>
        {/* Cabeçalho com título e link para o drawer detalhado */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Resumo por área
          </h3>
          <button type="button" onClick={() => setOpen(true)} aria-label="Ver detalhamento por área"
            className="text-[11px] text-white/40 transition-colors hover:text-white"
            style={{ '&:hover': { color: colors.primaryLight } }}>
            Ver detalhado →
          </button>
        </div>

        {/* Gráfico de donut centralizado — anel colorido com total no centro */}
        <div className="mb-5 flex justify-center">
          <div className="relative">
            {/* Anel externo colorido gerado via conic-gradient */}
            <div className="h-24 w-24 rounded-full" style={donutStyle} />
            {/* Círculo interno que recorta o centro, criando o efeito "donut" */}
            <div className="absolute inset-0 m-3 flex flex-col items-center justify-center rounded-full" style={{ background: colors.card }}>
              <span className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{total}</span>
              <span className="text-[9px] text-white/40">total</span>
            </div>
          </div>
        </div>

        {/* Lista de áreas com indicador de cor, percentual e contagem */}
        <div className="space-y-2.5">
          {areaCounts.map(({ area, count, pct, cfg }) => (
            <div key={area} className="flex items-center gap-2">
              {/* Bolinha colorida que representa a área no gráfico */}
              <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: cfg.accent }} />
              <span className="flex-1 truncate text-[11px] text-white/60">{area}</span>
              <span className="text-[11px] font-semibold text-white/40">{pct}%</span>
              <span className="text-[11px] font-bold text-white/70">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Drawer lateral com detalhamento completo por área */}
      <AreaDetailsDrawer
        open={open}
        onClose={() => setOpen(false)}
        contacts={contacts}
        onViewArea={area => { setOpen(false); onViewArea(area) }}
        onViewAll={() => { setOpen(false); onViewAll() }}
      />
    </>
  )
}
