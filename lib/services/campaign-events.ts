/**
 * Rótulos/categorias/tons do histórico de auditoria de campanhas
 * (app_admin_events) — puro, sem dependência de servidor (mesma regra de
 * campaign-labels.ts: seguro de importar de um componente client). A
 * construção da query (filtros/paginação) fica em campaign-events-query.ts,
 * que só roda no servidor.
 */

import { MARKETPLACE_COLORS } from '@/lib/marketplace'

export type EventCategory = 'campanha' | 'criativo' | 'configuracao' | 'reserva' | 'financeiro'
export type EventTone = 'blue' | 'green' | 'yellow' | 'red' | 'neutral'

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  campanha: 'Campanha',
  criativo: 'Criativo e revisão',
  configuracao: 'Configuração',
  reserva: 'Reserva e veiculação',
  financeiro: 'Financeiro',
}

export const CATEGORY_OPTIONS: { key: 'todos' | EventCategory; label: string }[] = [
  { key: 'todos', label: 'Todos os tipos' },
  { key: 'campanha', label: CATEGORY_LABEL.campanha },
  { key: 'criativo', label: CATEGORY_LABEL.criativo },
  { key: 'configuracao', label: CATEGORY_LABEL.configuracao },
  { key: 'reserva', label: CATEGORY_LABEL.reserva },
  { key: 'financeiro', label: CATEGORY_LABEL.financeiro },
]

export interface ActionMeta { label: string; category: EventCategory; tone: EventTone }

/** Ação → rótulo/categoria/tom. `cancel_campaign` = "Campanha cancelada"
 *  (nunca "encerrada" — "encerrada" é o fim natural do período contratado,
 *  um estado diferente de elegibilidade; ver isLegacyCancelMislabel). */
export const ACTION_META: Record<string, ActionMeta> = {
  create_campaign: { label: 'Campanha criada', category: 'campanha', tone: 'neutral' },
  submit_creative: { label: 'Anúncio enviado para revisão', category: 'criativo', tone: 'yellow' },
  review_creative_approve: { label: 'Anúncio aprovado', category: 'criativo', tone: 'green' },
  review_creative_changes: { label: 'Ajustes solicitados no anúncio', category: 'criativo', tone: 'yellow' },
  review_creative_reject: { label: 'Anúncio rejeitado', category: 'criativo', tone: 'red' },
  promote_creative: { label: 'Versão promovida', category: 'criativo', tone: 'blue' },
  reserve_capacity: { label: 'Espaço reservado', category: 'reserva', tone: 'blue' },
  confirm_payment: { label: 'Pagamento confirmado', category: 'financeiro', tone: 'green' },
  payment_capacity_conflict: { label: 'Pagamento confirmado com pendência de conciliação', category: 'financeiro', tone: 'yellow' },
  grant_exemption: { label: 'Isenção concedida', category: 'financeiro', tone: 'blue' },
  refund_campaign: { label: 'Reembolso solicitado', category: 'financeiro', tone: 'yellow' },
  pause_campaign: { label: 'Exibição pausada', category: 'campanha', tone: 'yellow' },
  resume_campaign: { label: 'Exibição retomada', category: 'campanha', tone: 'green' },
  cancel_campaign: { label: 'Campanha cancelada', category: 'campanha', tone: 'red' },
  reschedule_campaign: { label: 'Período reagendado', category: 'campanha', tone: 'blue' },
  duplicate_campaign: { label: 'Campanha duplicada', category: 'campanha', tone: 'neutral' },
  update_campaign_config: { label: 'Configuração atualizada', category: 'configuracao', tone: 'blue' },
  update_space: { label: 'Espaço atualizado', category: 'configuracao', tone: 'blue' },
  update_package: { label: 'Pacote atualizado', category: 'configuracao', tone: 'blue' },
}

export function getActionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? { label: humanize(action), category: 'campanha', tone: 'neutral' }
}

/** Ações de cada categoria — usado tanto pelo filtro do backend (action IN
 *  (...)) quanto, indiretamente, pela UI (CATEGORY_OPTIONS acima). */
export const CATEGORY_ACTIONS: Record<EventCategory, string[]> = Object.entries(ACTION_META).reduce((acc, [action, meta]) => {
  (acc[meta.category] ??= []).push(action)
  return acc
}, {} as Record<EventCategory, string[]>)

export const TONE_COLOR: Record<EventTone, string> = {
  blue: MARKETPLACE_COLORS.primary,
  green: MARKETPLACE_COLORS.success,
  yellow: MARKETPLACE_COLORS.warning,
  red: MARKETPLACE_COLORS.error,
  neutral: MARKETPLACE_COLORS.textSecondary,
}

/** Compõe/decompõe o par (antes → depois) de status registrado no evento.
 *  Cobre os códigos realmente gravados por app-publish.ts nas rotas de
 *  /admin/marketplace/destaques — nunca inventa um código que não existe. */
const STATUS_LABEL: Record<string, string> = {
  em_revisao: 'Em revisão', aprovado: 'Aprovado', ajustes_solicitados: 'Ajustes solicitados', rejeitado: 'Rejeitado',
  sem_pagamento: 'Sem pagamento', isento: 'Isento', isento_com_pendencia_de_conciliacao: 'Isento (pendência de conciliação)',
  pendente: 'Pendente', pago: 'Pago', pago_com_pendencia_de_conciliacao: 'Pago (pendência de conciliação)',
  reembolso_solicitado: 'Reembolso solicitado',
  sem_reserva: 'Sem reserva', reservada_temporariamente: 'Reserva temporária',
  ativa: 'Ativa', pausada: 'Pausada', encerrada: 'Encerrada', cancelada: 'Cancelada',
  inexistente: 'Inexistente', rascunho: 'Rascunho',
  // Registro legado: gravado antes de a rota de cancelamento passar a
  // verificar paused_at — nunca soubemos, e nunca vamos inventar, se era
  // "ativa" ou "pausada" no instante exato (seção 7).
  ativa_ou_pausada: 'Ativa ou pausada (registro legado)',
}

function humanize(code: string): string {
  return code.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

/** Nunca quebra a tela por um código desconhecido — mostra uma versão
 *  legível dele e sinaliza que não é um dos rótulos mapeados (o código bruto
 *  original continua disponível em `raw` pra quem tem permissão de ver). */
export function getStatusLabel(code: string | null): { label: string; raw: string | null; known: boolean } {
  if (!code) return { label: '—', raw: null, known: true }
  const known = STATUS_LABEL[code]
  return known ? { label: known, raw: code, known: true } : { label: humanize(code), raw: code, known: false }
}

/** `reschedule_campaign` grava "ISO → ISO" nos dois campos de status em vez
 *  de um código — formata como intervalo de datas em vez de tentar traduzir
 *  como se fosse um status. */
export function isDateRangeStatus(action: string): boolean {
  return action === 'reschedule_campaign'
}

/** Único evento cujo `new_status` ficou gravado errado pelo código antigo:
 *  cancelar sempre escrevia "encerrada" (ambíguo com o fim natural do
 *  período). Corrigido nas gravações novas — eventos antigos continuam como
 *  estavam (nunca reescritos), só sinalizados como registro legado (seção 3/7). */
export function isLegacyCancelMislabel(action: string, newStatus: string | null): boolean {
  return action === 'cancel_campaign' && newStatus === 'encerrada'
}

export interface FieldChange { field: string; label: string; before: string | null; after: string | null }

/** Fallback só pra eventos GRAVADOS ANTES desta coluna existir — `reason`
 *  tinha só os NOMES dos campos alterados ("Campos alterados: espaço,
 *  pacote."), nunca os valores antes/depois (seção 9). Eventos novos usam
 *  `field_changes` (real, ver app-publish.ts) — isto aqui nunca reconstrói
 *  valor nenhum, só lista os nomes dos campos que mudaram. Retorna null
 *  quando o texto não segue esse formato (outro tipo de evento). */
export function parseChangedFields(reason: string | null): string[] | null {
  if (!reason) return null
  const m = reason.match(/^Campos alterados:\s*(.+)\.$/)
  if (!m) return null
  return m[1].split(',').map(s => s.trim()).filter(Boolean)
}

/** `duplicate_campaign` grava "Duplicada a partir de <uuid>" em `reason` —
 *  extrai o id da campanha original pra virar uma referência clicável. */
export function parseDuplicateSource(reason: string | null): string | null {
  if (!reason) return null
  const m = reason.match(/^Duplicada a partir de ([0-9a-f-]{36})$/i)
  return m ? m[1] : null
}

export type EventOrigin = 'admin' | 'parceiro' | 'sistema'

export function originLabel(origin: EventOrigin): string {
  return origin === 'sistema' ? 'Sistema' : origin === 'admin' ? 'Administrador' : 'Parceiro'
}
