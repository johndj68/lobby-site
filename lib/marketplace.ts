/**
 * Helpers para o painel administrativo do Marketplace (/admin/marketplace).
 *
 * Reaproveita a paleta escura já usada em app/admin/marketplace/solicitacoes
 * (SubmissionsClient.tsx) para manter as duas telas consistentes entre si.
 *
 * app_drafts (pipeline de submissão, dono = created_by) e applications
 * (catálogo público real, lido por app/page.tsx) são ligados por
 * app_drafts.application_id — populado por /api/admin/apps/[draftId]/publish.
 * Um draft sem application_id ainda nunca foi publicado de fato.
 */

export const MARKETPLACE_COLORS = {
  bg: '#10151F',
  header: '#131A26',
  card: '#171F2D',
  border: '#2B3547',
  text: '#F1F5F9',
  textSecondary: '#A9B5C8',
  primary: '#1765FF',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
}

export type AppDraftStatus = 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'published'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested'

export interface AppDraftRow {
  id: string
  name: string | null
  short_description: string | null
  logo_url: string | null
  category: string | null
  status: AppDraftStatus
  created_at: string
  updated_at?: string
  created_by: string
  application_id?: string | null
}

export interface ApplicationRow {
  id: string
  slug: string
  is_published: boolean
  suspended_at: string | null
  suspended_reason: string | null
  updated_at: string
}

export interface SubmissionRow {
  id: string
  app_draft_id: string
  status: SubmissionStatus
  submitted_at: string
  reviewed_at: string | null
  reviewer_id: string | null
  submitted_by: string
}

export interface PlanRow {
  id: string
  app_draft_id: string
  billing_period: string
  price: number | null
  currency: string
}

/** Status derivado exibido na UI — combina app_drafts.status com a submissão
 *  mais recente, porque a aprovação/rejeição hoje só é refletida com certeza
 *  em app_submissions.status (o endpoint de review só sincroniza
 *  app_drafts.status quando a decisão é "approve"). */
export interface DerivedAppStatus {
  key: 'rascunho' | 'aguardando_analise' | 'ajustes_solicitados' | 'rejeitado' | 'aprovado' | 'publicado' | 'suspenso'
  label: string
  color: string
}

export function deriveAppStatus(draftStatus: AppDraftStatus, latestSubmission: SubmissionRow | null): DerivedAppStatus {
  if (draftStatus === 'published') {
    return { key: 'publicado', label: 'Publicado', color: MARKETPLACE_COLORS.success }
  }
  if (!latestSubmission) {
    return { key: 'rascunho', label: 'Rascunho, não enviado', color: MARKETPLACE_COLORS.textSecondary }
  }
  switch (latestSubmission.status) {
    case 'pending':
      return { key: 'aguardando_analise', label: 'Aguardando análise', color: MARKETPLACE_COLORS.warning }
    case 'changes_requested':
      return { key: 'ajustes_solicitados', label: 'Ajustes solicitados', color: MARKETPLACE_COLORS.warning }
    case 'rejected':
      return { key: 'rejeitado', label: 'Rejeitado', color: MARKETPLACE_COLORS.error }
    case 'approved':
      return { key: 'aprovado', label: 'Aprovado, não publicado', color: MARKETPLACE_COLORS.primary }
    default:
      return { key: 'rascunho', label: 'Rascunho, não enviado', color: MARKETPLACE_COLORS.textSecondary }
  }
}

export interface PublicationStatus {
  key: 'nao_publicado' | 'publicado' | 'suspenso'
  label: string
  color: string
}

/** Estado de PUBLICAÇÃO — independente do estado de revisão (deriveAppStatus).
 *  Vem só de applications: sem linha = nunca publicado; suspended_at setado
 *  = suspenso (histórico preservado, applications continua existindo). */
export function derivePublicationStatus(application: Pick<ApplicationRow, 'is_published' | 'suspended_at'> | null): PublicationStatus {
  if (!application) return { key: 'nao_publicado', label: 'Não publicado', color: MARKETPLACE_COLORS.textSecondary }
  if (application.suspended_at) return { key: 'suspenso', label: 'Suspenso', color: MARKETPLACE_COLORS.error }
  if (application.is_published) return { key: 'publicado', label: 'Publicado', color: MARKETPLACE_COLORS.success }
  return { key: 'nao_publicado', label: 'Não publicado', color: MARKETPLACE_COLORS.textSecondary }
}

export interface ReviewStatus {
  key: 'rascunho' | 'aguardando_analise' | 'em_analise' | 'ajustes_solicitados' | 'rejeitado' | 'aprovado' | 'nova_versao_em_analise'
  label: string
  color: string
}

/** Estado de REVISÃO — status da submissão mais recente. Quando o app já
 *  está publicado e a submissão mais recente é posterior à que foi
 *  publicada (e ainda está em fluxo), mostra "Nova versão em análise" em
 *  vez do estado cru — a versão pública não muda só por isso (seção 8). */
export function deriveReviewStatus(
  latestSubmission: Pick<SubmissionRow, 'id' | 'status'> | null,
  isCurrentlyPublished: boolean,
  publishedSubmissionId: string | null,
): ReviewStatus {
  if (!latestSubmission) return { key: 'rascunho', label: 'Rascunho', color: MARKETPLACE_COLORS.textSecondary }

  const inFlight = latestSubmission.status === 'pending' || latestSubmission.status === 'changes_requested'
  if (isCurrentlyPublished && inFlight && latestSubmission.id !== publishedSubmissionId) {
    return { key: 'nova_versao_em_analise', label: 'Nova versão em análise', color: MARKETPLACE_COLORS.primary }
  }
  switch (latestSubmission.status) {
    case 'pending':
      return { key: 'aguardando_analise', label: 'Aguardando análise', color: MARKETPLACE_COLORS.warning }
    case 'changes_requested':
      return { key: 'ajustes_solicitados', label: 'Ajustes solicitados', color: MARKETPLACE_COLORS.warning }
    case 'rejected':
      return { key: 'rejeitado', label: 'Rejeitado', color: MARKETPLACE_COLORS.error }
    case 'approved':
      return { key: 'aprovado', label: 'Aprovado', color: MARKETPLACE_COLORS.success }
    default:
      return { key: 'rascunho', label: 'Rascunho', color: MARKETPLACE_COLORS.textSecondary }
  }
}

/** Status de uma app_submissions individual — usado tanto na listagem
 *  (/admin/marketplace/solicitacoes) quanto no detalhe de análise. Não é o
 *  mesmo domínio de ReviewStatus acima: aquele combina o app_draft inteiro
 *  (rascunho/publicado/nova versão); este é o status cru de UMA submissão.
 *  'in_review' nunca ocorre hoje — não está no CHECK constraint de
 *  app_submissions.status — mas existe na UI para quando for adotado. */
export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando análise',
  in_review: 'Em análise',
  changes_requested: 'Aguardando ajustes',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
}

export const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  pending: MARKETPLACE_COLORS.warning,
  in_review: MARKETPLACE_COLORS.primary,
  changes_requested: MARKETPLACE_COLORS.warning,
  approved: MARKETPLACE_COLORS.success,
  rejected: MARKETPLACE_COLORS.error,
}

/** Uma submissão só pode ser decidida (aprovar/rejeitar/pedir ajustes)
 *  enquanto está pending ou in_review. changes_requested/approved/rejected
 *  já carregam uma decisão registrada — reabrir não é algo o backend
 *  suporta hoje (sem coluna/estado para isso), então o detalhe de análise
 *  trata qualquer status fora desses dois como somente-consulta. */
export function isSubmissionDecidable(status: string): boolean {
  return status === 'pending' || status === 'in_review'
}

export const ORIGIN_LABEL = { lobby: 'LOBBY · Produto próprio', partner: 'Parceiro' } as const

/** Resume as ofertas (app_plans) de um app: nenhuma, uma (com rótulo do tipo
 *  de cobrança) ou "Múltiplas ofertas" quando há mais de um plano — nunca
 *  escolhe um plano arbitrário para representar o app. */
export function summarizeOffer(plans: PlanRow[]): string {
  if (plans.length === 0) return 'Sem oferta cadastrada'
  if (plans.length > 1) return 'Múltiplas ofertas'
  const label: Record<string, string> = {
    'one-time': 'Pagamento único',
    monthly: 'Assinatura mensal',
    yearly: 'Assinatura anual',
    lifetime: 'Vitalício',
  }
  return label[plans[0].billing_period] ?? plans[0].billing_period
}

export type PeriodKey = 'hoje' | '7d' | '30d' | 'mes' | 'custom'

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'custom', label: 'Período personalizado' },
]

const TIMEZONE = 'America/Sao_Paulo'

/** Início/fim (UTC) do período pedido, calculado no fuso America/Sao_Paulo
 *  (fuso assumido do projeto — não há configuração explícita de timezone no
 *  código-fonte hoje; BRL/pt-BR em todo o app aponta para este fuso). */
export function periodRange(period: PeriodKey, from?: string | null, to?: string | null): { start: Date; end: Date } {
  const now = new Date()
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }))
  const startOfDay = new Date(nowInTz.getFullYear(), nowInTz.getMonth(), nowInTz.getDate())
  const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1)

  switch (period) {
    case 'hoje':
      return { start: startOfDay, end: endOfDay }
    case '7d':
      return { start: new Date(startOfDay.getTime() - 6 * 86400000), end: endOfDay }
    case '30d':
      return { start: new Date(startOfDay.getTime() - 29 * 86400000), end: endOfDay }
    case 'mes':
      return { start: new Date(nowInTz.getFullYear(), nowInTz.getMonth(), 1), end: endOfDay }
    case 'custom': {
      if (from && to) {
        const s = new Date(`${from}T00:00:00`)
        const e = new Date(`${to}T23:59:59`)
        if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && s <= e) return { start: s, end: e }
      }
      // sem intervalo válido informado ainda — cai no padrão de 30 dias
      return { start: new Date(startOfDay.getTime() - 29 * 86400000), end: endOfDay }
    }
    default:
      return { start: new Date(startOfDay.getTime() - 29 * 86400000), end: endOfDay }
  }
}

export function formatPeriodLabel(period: PeriodKey, range: { start: Date; end: Date }, from?: string | null, to?: string | null): string {
  const opt = PERIOD_OPTIONS.find(o => o.value === period)
  if (period === 'custom' && from && to) {
    return `${formatDateShort(range.start)} – ${formatDateShort(range.end)}`
  }
  return opt?.label ?? 'Últimos 30 dias'
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: TIMEZONE })
}

export function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: TIMEZONE, dateStyle: 'short', timeStyle: 'short' })
}

export function formatRelativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)}min`
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`
  if (s < 2592000) return `há ${Math.floor(s / 86400)}d`
  return formatDateShort(new Date(iso))
}
