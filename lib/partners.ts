/**
 * Helpers para /admin/marketplace/parceiros.
 *
 * IMPORTANTE — leia antes de mexer aqui: o projeto NÃO tem um modelo de
 * "organização". Um parceiro é, hoje, o profile (usuário) dono de um ou
 * mais app_drafts via created_by. Não existe tabela de organizações,
 * membership de empresa, condição comercial versionada nem integração de
 * recebimento para vendas do marketplace. Esta tela é construída em cima
 * do modelo real — não inventa nenhuma dessas entidades. Ver relatório de
 * entrega para o que foi deliberadamente deixado como "não configurado"
 * em vez de simulado.
 */

import { MARKETPLACE_COLORS as C } from './marketplace'

export interface PartnerProfile {
  id: string
  full_name: string | null
  email: string | null
  company_name: string | null
  created_at: string
  onboarded: boolean
  marketplace_new_apps_blocked: boolean
  marketplace_blocked_at: string | null
  marketplace_blocked_reason: string | null
}

export interface RegistrationStatus { key: 'ativo' | 'pendente'; label: string; color: string }

/** "Ativo" vs "Cadastro pendente" — único sinal real disponível hoje é
 *  profiles.onboarded (setado pelo próprio fluxo de onboarding do usuário,
 *  não inventado aqui). Não existe "arquivado" no modelo de profiles. */
export function deriveRegistrationStatus(p: Pick<PartnerProfile, 'onboarded'>): RegistrationStatus {
  return p.onboarded
    ? { key: 'ativo', label: 'Ativo', color: C.success }
    : { key: 'pendente', label: 'Cadastro pendente', color: C.warning }
}

export interface TermsStatus { key: 'aceitos' | 'pendentes'; label: string; color: string }

/** Vem de app_review_acceptances (aceite real registrado ao enviar uma
 *  submissão) — não de um campo "aceito" marcável manualmente. */
export function deriveTermsStatus(hasAnyAcceptance: boolean): TermsStatus {
  return hasAnyAcceptance
    ? { key: 'aceitos', label: 'Termos aceitos', color: C.success }
    : { key: 'pendentes', label: 'Termos pendentes', color: C.warning }
}

export function partnerDisplayName(p: Pick<PartnerProfile, 'company_name' | 'full_name' | 'email'>): string {
  return p.company_name || p.full_name || p.email || 'Sem nome cadastrado'
}
