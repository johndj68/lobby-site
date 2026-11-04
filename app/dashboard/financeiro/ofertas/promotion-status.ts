/**
 * Status efetivo de uma promoção pra exibição no parceiro — reaproveita
 * getPromotionStatus() de lib/services/offers.ts (nunca reimplementado),
 * só resolve ANTES o caso que a função compartilhada não conhece:
 * rejected_at (coluna adicionada depois que getPromotionStatus() foi
 * escrita — ver comentário original em OfertasPromocoesClient.tsx).
 *
 * Cores aqui são as do tema CLARO do dashboard do parceiro — getPromotionStatus()
 * devolve cores de MARKETPLACE_COLORS, que é a paleta ESCURA do admin
 * (textSecondary='#A9B5C8', cinza pensado pra fundo escuro — por isso
 * "Cancelada" ficava quase invisível sobre fundo branco). Usamos só
 * status.key (a lógica), nunca status.color, daqui pra baixo.
 */
import { getPromotionStatus, type PromotionStatusInput } from '@/lib/services/offers'
import { colors } from '@/lib/design-tokens'
import type { PromotionRow } from './types'

export type EffectiveStatusKey = 'rascunho' | 'programada' | 'ativa' | 'pausada' | 'encerrada' | 'cancelada' | 'rejeitada' | 'substituida'

export interface EffectiveStatus {
  key: EffectiveStatusKey
  label: string
  color: string
  bg: string
}

const STATUS_STYLE: Record<EffectiveStatusKey, { label: string; color: string; bg: string }> = {
  rascunho:   { label: 'Em análise',  color: colors.primary,    bg: `${colors.primary}14` },
  programada: { label: 'Agendada',    color: colors.primary,    bg: `${colors.primary}14` },
  ativa:      { label: 'Ativa',       color: '#10B981',         bg: '#10B9811A' },
  pausada:    { label: 'Pausada',     color: '#F59E0B',         bg: '#F59E0B1A' },
  // "Encerrada"/"Cancelada" usam texto escuro sólido (colors.text), não o
  // cinza claro-sobre-claro do admin — legível sem parecer desabilitado.
  encerrada:  { label: 'Encerrada',   color: colors.text,       bg: colors.backgroundAlt2 },
  cancelada:  { label: 'Cancelada',   color: colors.text,       bg: '#EF44441A' },
  rejeitada:  { label: 'Rejeitada',   color: '#EF4444',         bg: '#EF44441A' },
  substituida: { label: 'Substituída', color: colors.primary,  bg: `${colors.primary}14` },
}

export function resolvePromotionStatus(p: PromotionStatusInput & { rejected_at: string | null }, now: Date = new Date()): EffectiveStatus {
  // cancelled_at/paused_at têm prioridade sobre rejected_at dentro da
  // própria getPromotionStatus() — replicamos a mesma ordem aqui: só
  // tratamos como "rejeitada" quando não há cancelamento nem pausa.
  if (p.rejected_at && !p.is_approved && !p.cancelled_at && !p.paused_at) {
    return { key: 'rejeitada', ...STATUS_STYLE.rejeitada }
  }
  const key = getPromotionStatus(p, now).key as EffectiveStatusKey
  return { key, ...STATUS_STYLE[key] }
}

/** Mesma coisa que resolvePromotionStatus, mas recebendo o shape camelCase
 *  de PromotionRow (OfertasPromocoesClient/PromocoesTable) — evita repetir
 *  o mapeamento de campos em cada chamador. */
export function resolveRowStatus(row: PromotionRow, now: Date = new Date()): EffectiveStatus {
  return resolvePromotionStatus({
    is_approved: row.isApproved,
    is_active: row.isActive,
    starts_at: row.startsAt,
    ends_at: row.endsAt,
    cancelled_at: row.cancelledAt,
    paused_at: row.pausedAt,
    rejected_at: row.rejectedAt,
    superseded_at: row.supersededAt,
  }, now)
}

/** Drift de preço (seção pedida: avisar, nunca recalcular sozinho) — só
 *  faz sentido pra pedido pendente ou promoção ainda vigente (aprovada,
 *  não superseded/cancelada/encerrada): se já terminou/foi substituída, o
 *  preço atual do plano não é mais relevante pra ela. */
export function hasPriceDrift(row: PromotionRow): boolean {
  if (row.originalPrice == null || row.planCurrentPrice == null) return false
  if (row.originalPrice === row.planCurrentPrice) return false
  const key = resolveRowStatus(row).key
  return key === 'rascunho' || key === 'programada' || key === 'ativa' || key === 'pausada'
}

/** Indicador (1 dos 4 cards) de cada status — "Encerradas" NUNCA inclui
 *  cancelada/rejeitada/substituída (ficam só acessíveis por filtro: motivo
 *  de ter parado é diferente de "terminou pelo prazo normal"). */
export function indicatorBucket(key: EffectiveStatusKey): 'em_analise' | 'agendadas' | 'ativas' | 'encerradas' | null {
  if (key === 'rascunho') return 'em_analise'
  if (key === 'programada') return 'agendadas'
  if (key === 'ativa' || key === 'pausada') return 'ativas'
  if (key === 'encerrada') return 'encerradas'
  return null // cancelada/rejeitada — só via filtro
}
