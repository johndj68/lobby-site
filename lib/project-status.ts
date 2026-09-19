import {
  FileSearch, AlertCircle, TrendingUp, Clock, CheckCircle, PauseCircle,
} from 'lucide-react'
import type { SecurityChecklistItem } from '@/types'

export interface StatusConfig {
  label:  string
  color:  string
  bg:     string
  border: string
  icon:   React.ElementType
}

export const STATUS_CFG: Record<string, StatusConfig> = {
  solicitado:         { label: 'Solicitado',        color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.25)',  icon: FileSearch  },
  em_analise:         { label: 'Em análise',         color: '#A78BFA', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', icon: AlertCircle },
  em_desenvolvimento: { label: 'Em desenvolvimento', color: '#005BFF', bg: 'rgba(0,91,255,0.10)',    border: 'rgba(0,91,255,0.25)',    icon: TrendingUp  },
  em_validacao:       { label: 'Em validação',       color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.25)',  icon: Clock       },
  concluido:          { label: 'Concluído',          color: '#10B981', bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.25)',  icon: CheckCircle },
  pausado:            { label: 'Pausado',            color: '#64748B', bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)', icon: PauseCircle },
}

export const DEFAULT_STATUS_CFG = STATUS_CFG['em_analise']

export const PHASE_STATUS_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  concluido:           { label: 'Concluído',          color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' },
  atual:                { label: 'Em andamento',       color: '#7B2CFF', bg: 'rgba(123,44,255,0.12)', border: 'rgba(123,44,255,0.35)' },
  proximo:              { label: 'Próximo',             color: '#94A3B8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
  aguardando_cliente:   { label: 'Aguardando cliente',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  bloqueado:            { label: 'Bloqueado',           color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)' },
}

export function getDeadlineBadge(deadline?: string): { label: string; color: string } {
  if (!deadline) return { label: 'Sem prazo definido', color: '#64748B' }
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  return days < 0 ? { label: 'Atrasado', color: '#EF4444' } : { label: 'No prazo', color: '#10B981' }
}

export function isDeadlineOverdue(deadline?: string): boolean {
  if (!deadline) return false
  return new Date(deadline).getTime() < Date.now()
}

export function getDeadlineOverdueDays(deadline?: string): number {
  if (!deadline) return 0
  return Math.max(0, Math.ceil((Date.now() - new Date(deadline).getTime()) / 86400000))
}

export const VISUAL_STATUS_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  planejado:             { label: 'Planejado',            color: '#94A3B8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
  em_desenvolvimento:    { label: 'Em desenvolvimento',   color: '#005BFF', bg: 'rgba(0,91,255,0.10)',    border: 'rgba(0,91,255,0.25)'    },
  em_validacao:          { label: 'Em validação',          color: '#7B2CFF', bg: 'rgba(123,44,255,0.10)', border: 'rgba(123,44,255,0.25)'  },
  aguardando_aprovacao:  { label: 'Aguardando aprovação',  color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)'  },
  aprovado:              { label: 'Aprovado',              color: '#10B981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)'  },
  ajuste_solicitado:     { label: 'Ajuste solicitado',     color: '#EF4444', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.25)'   },
}

export function getVisualStatusStyles(status: string): { label: string; color: string; bg: string; border: string } {
  return VISUAL_STATUS_STYLES[status] ?? VISUAL_STATUS_STYLES.planejado
}

export const MODULE_STATUS_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  nao_iniciado:         { label: 'Planejado',            color: '#94A3B8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
  em_andamento:         { label: 'Em andamento',         color: '#005BFF', bg: 'rgba(0,91,255,0.10)',    border: 'rgba(0,91,255,0.25)'    },
  aguardando_validacao: { label: 'Em validação',          color: '#7B2CFF', bg: 'rgba(123,44,255,0.10)', border: 'rgba(123,44,255,0.25)'  },
  concluido:            { label: 'Concluído',             color: '#10B981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)'  },
  aguardando_cliente:   { label: 'Aguardando cliente',    color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)'  },
  bloqueado:            { label: 'Bloqueado',             color: '#EF4444', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.25)'   },
}

export function getModuleStatusStyle(status: string): { label: string; color: string; bg: string; border: string } {
  return MODULE_STATUS_STYLE[status] ?? MODULE_STATUS_STYLE.nao_iniciado
}

export function normalizeSecurityItems(raw: (string | SecurityChecklistItem)[] | undefined): SecurityChecklistItem[] {
  if (!raw) return []
  return raw.map((it, i) => typeof it === 'string'
    ? { id: `sec-${i}`, label: it, checked: true, visibleToClient: true }
    : it)
}

export function getProgressStatusWarning(status: string, progress: number): string | null {
  if (status === 'em_desenvolvimento' && progress < 20) {
    return 'O progresso parece baixo para o status atual. Revise se o projeto realmente está no início do desenvolvimento.'
  }
  if (status === 'concluido' && progress < 100) {
    return 'O status está como Concluído, mas o progresso não está em 100%. Revise um dos dois campos.'
  }
  if (status === 'solicitado' && progress > 10) {
    return 'O progresso já avançou, mas o status ainda é Solicitado. Considere atualizar o status.'
  }
  return null
}
