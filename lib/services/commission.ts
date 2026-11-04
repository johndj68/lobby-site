/**
 * Comissão sobre venda de app de parceiro. Regras de verdade vivem no banco
 * (get_partner_commission_percent — mais específico vence: parceiro+
 * categoria > parceiro > categoria > este fallback). Este arquivo só
 * espelha o fallback pra exibição no client antes de qualquer resolução
 * real acontecer no servidor — nunca use este valor pra calcular comissão
 * de uma venda de verdade, sempre chame a função do banco.
 */
export const DEFAULT_COMMISSION_PERCENT = 20

export interface CommissionTerm {
  id:             string
  partner_id:     string | null
  category_id:    string | null
  percent:        number
  is_active:      boolean
  created_by:     string | null
  created_at:     string
  deactivated_at: string | null
  deactivated_by: string | null
  // Anexados client-side via join manual, não são colunas.
  partner_name?:  string | null
  category_name?: string | null
}

export function commissionScopeLabel(term: Pick<CommissionTerm, 'partner_id' | 'category_id' | 'partner_name' | 'category_name'>): string {
  const partnerPart  = term.partner_id  ? (term.partner_name  ?? 'Parceiro removido')  : 'Todos os parceiros'
  const categoryPart = term.category_id ? (term.category_name ?? 'Categoria removida') : 'Todas as categorias'
  return `${partnerPart} · ${categoryPart}`
}
