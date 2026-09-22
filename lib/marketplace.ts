/**
 * Helpers para o painel administrativo do Marketplace (/admin/marketplace).
 *
 * Reaproveita a paleta escura já usada em app/admin/marketplace/solicitacoes
 * (SubmissionsClient.tsx) para manter as duas telas consistentes entre si.
 *
 * Importante: o catálogo público real (tabela `applications`, que alimenta a
 * home) e o pipeline de submissão (`app_drafts`/`app_submissions`, usado pela
 * central de revisão) ainda não são conectados no banco — não existe rotina
 * que, ao aprovar uma submissão, publique de fato o app em `applications`.
 * Este arquivo trabalha em cima do pipeline de submissão (mesma fonte da
 * central de revisão), não do catálogo público, e essa distinção é
 * documentada na própria página.
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
  created_by: string
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
  key: 'rascunho' | 'aguardando_analise' | 'ajustes_solicitados' | 'rejeitado' | 'aprovado' | 'publicado'
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
