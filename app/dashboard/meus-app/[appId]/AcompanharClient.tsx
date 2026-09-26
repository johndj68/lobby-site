'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Eye, FileText, Image as ImageIcon, Tag, Package, ListChecks,
  ChevronRight, Copy, Check, HelpCircle, AlertTriangle, Rocket, Building2, Globe, Calendar, Hash,
  CircleDashed, Circle, CheckCircle2, History as HistoryIcon,
} from 'lucide-react'
import AppLogo from '@/components/admin/AppLogo'
import { colors as C } from '@/lib/design-tokens'
import { formatDateTimeBR, type PublicationStatus, type ReviewStatus } from '@/lib/marketplace'
import MessagesPanel, { type MessageItem } from './MessagesPanel'
import HistoryPanel, { buildTimelineEvents, type HistoryEntry } from './HistoryPanel'

export interface ChecklistGroup {
  id: string; label: string; icon: string
  state: 'not_started' | 'in_progress' | 'complete' | 'pending'
  summary: string
  editRoute: string; editTab?: string; editField?: string
}
interface ChecklistItem { section: string; itemKey: string; itemLabel: string; itemDescription: string | null; status: string }

interface AppInfo {
  id: string; name: string; shortDescription: string | null; logoUrl: string | null; category: string | null
  updatedAt: string; createdAt: string; applicationSlug: string | null; suspendedReason: string | null
  canEdit: boolean; isOwner: boolean; organizationName: string | null; websiteUrl: string | null
}

interface Props {
  app: AppInfo
  publication: PublicationStatus
  review: ReviewStatus
  latestSubmission: { id: string; submittedAt: string; status: string } | null
  messages: MessageItem[]
  history: HistoryEntry[]
  checklist: ChecklistItem[]
  checklistGroups: ChecklistGroup[]
  nextStep: 2 | 3 | 4
}

const GROUP_ICON: Record<string, React.ElementType> = { FileText, ImageIcon, Tag, Package, ListChecks }
const STEP_ROUTE: Record<2 | 3 | 4, string> = { 2: 'editar', 3: 'planos', 4: 'revisao' }

const REVIEW_BADGE: Record<ReviewStatus['key'], { bg: string; fg: string }> = {
  rascunho: { bg: '#E2E8F0', fg: '#334155' },
  aguardando_analise: { bg: '#DBEAFE', fg: '#1D4ED8' },
  em_analise: { bg: '#DBEAFE', fg: '#1D4ED8' },
  ajustes_solicitados: { bg: '#FEF3C7', fg: '#B45309' },
  rejeitado: { bg: '#FEE2E2', fg: '#B91C1C' },
  aprovado: { bg: '#DCFCE7', fg: '#15803D' },
  nova_versao_em_analise: { bg: '#DBEAFE', fg: '#1D4ED8' },
}
const PUBLICATION_BADGE: Record<PublicationStatus['key'], { bg: string; fg: string }> = {
  nao_publicado: { bg: '#E2E8F0', fg: '#334155' },
  publicado: { bg: '#DCFCE7', fg: '#15803D' },
  suspenso: { bg: '#FEE2E2', fg: '#B91C1C' },
}
const CHECKLIST_STATE_LABEL: Record<ChecklistGroup['state'], string> = {
  not_started: 'Não iniciado', in_progress: 'Em preenchimento', complete: 'Completo', pending: 'Requer ajuste',
}
const CHECKLIST_STATE_BADGE: Record<ChecklistGroup['state'], { bg: string; fg: string; Icon: React.ElementType }> = {
  not_started: { bg: '#E2E8F0', fg: '#334155', Icon: Circle },
  in_progress: { bg: '#DBEAFE', fg: '#1D4ED8', Icon: CircleDashed },
  complete: { bg: '#DCFCE7', fg: '#15803D', Icon: CheckCircle2 },
  pending: { bg: '#FEF3C7', fg: '#B45309', Icon: AlertTriangle },
}
const ADMIN_CHECKLIST_META: Record<string, { label: string; color: string }> = {
  checked: { label: 'Conferido', color: '#15803D' },
  adjustment_needed: { label: 'Requer ajuste', color: '#B45309' },
  not_applicable: { label: 'Não aplicável', color: C.textMuted },
  not_reviewed: { label: 'Não revisado', color: C.textMuted },
}

type Tab = 'visao' | 'mensagens' | 'historico'

function editHref(appId: string, route: string, tab?: string, field?: string) {
  const q = tab ? `?tab=${tab}` : ''
  const h = field ? `#${field}` : ''
  return `/dashboard/meus-app/novo/${appId}/${route}${q}${h}`
}

/** Qual versão "Visualizar anúncio" deve abrir — nunca a última submissão
 *  quando o rascunho é o que está realmente ativo agora (rascunho/ajustes/
 *  rejeitado voltam a ser editáveis), nunca o rascunho quando existe uma
 *  versão estável mais relevante (em análise/aprovada/publicada). */
function previewHref(appId: string, review: ReviewStatus, publication: PublicationStatus, latestSubmission: Props['latestSubmission']) {
  if (review.key === 'rascunho' || review.key === 'ajustes_solicitados' || review.key === 'rejeitado') {
    return `/dashboard/meus-app/${appId}/previa?v=draft`
  }
  if (publication.key === 'publicado') return `/dashboard/meus-app/${appId}/previa?v=published`
  if (latestSubmission) return `/dashboard/meus-app/${appId}/previa?v=submission&submissionId=${latestSubmission.id}`
  return `/dashboard/meus-app/${appId}/previa?v=draft`
}

function resumeHref(appId: string, nextStep: 2 | 3 | 4) {
  return `/dashboard/meus-app/novo/${appId}/${STEP_ROUTE[nextStep]}`
}

function statusExplanation(review: ReviewStatus, publication: PublicationStatus): string {
  if (publication.key === 'suspenso') return 'A aprovação de uma versão não reativa automaticamente um anúncio suspenso.'
  if (review.key === 'aprovado' && publication.key === 'nao_publicado') return 'A versão foi aprovada. A publicação ainda depende das condições indicadas nesta página.'
  if (review.key === 'nova_versao_em_analise' && publication.key === 'publicado') return 'Seu anúncio atual continua publicado. As novas alterações ainda estão em rascunho.'
  if (review.key === 'aprovado' && publication.key === 'publicado') return 'Esta versão foi aprovada e está publicada no marketplace.'
  if (review.key === 'ajustes_solicitados') return 'A equipe pediu ajustes nesta versão antes de aprovar.'
  if (review.key === 'rejeitado') return 'Esta versão não foi aprovada.'
  if (review.key === 'aguardando_analise' || review.key === 'em_analise') return 'Esta versão está em análise e ainda não foi publicada.'
  return 'Este aplicativo ainda não foi enviado para análise.'
}

export default function AcompanharClient({ app, publication, review, latestSubmission, messages, history, checklist, checklistGroups, nextStep }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Estado local é a fonte de verdade pra resposta imediata do clique —
  // router.replace() sozinho não reflete de forma confiável em
  // useSearchParams() nesta versão do Next (mesmo padrão já usado em
  // BuscaClient.tsx). router.replace aqui só existe pra manter a aba na URL
  // (compartilhável, sobrevive a um recarregamento).
  const [tab, setTabState] = useState<Tab>((searchParams.get('tab') as Tab) || 'visao')
  const [copied, setCopied] = useState(false)

  function setTab(t: Tab) {
    setTabState(t)
    router.replace(t === 'visao' ? pathname : `${pathname}?tab=${t}`, { scroll: false })
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(app.id)
      setCopied(true)
      toast.success('ID copiado.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar — selecione o texto manualmente.')
    }
  }

  const completeGroups = checklistGroups.filter(g => g.state === 'complete').length
  const showDraftChecklist = checklistGroups.length > 0
  const recentEvents = buildTimelineEvents(app.createdAt, history).slice(0, 3)
  // messages já vem ordenado por submitted_at desc (mesma ordem de history) —
  // o mais recente é o primeiro, não o último.
  const latestMessage = messages[0] ?? null

  const isLatestSubmission = (submittedAt: string) => latestSubmission?.submittedAt === submittedAt

  return (
    <div className="space-y-5">
      <p className="text-xs" style={{ color: C.textSecondary }}>
        <Link href="/dashboard/meus-app" className="hover:underline">Meus aplicativos</Link> / {app.name}
      </p>
      <Link href="/dashboard/meus-app" className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.textSecondary }}>
        <ArrowLeft size={12} aria-hidden="true" /> Voltar aos meus aplicativos
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <AppLogo url={app.logoUrl} size={56} theme="light" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold sm:text-2xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{app.name}</h1>
              <Badge {...REVIEW_BADGE[review.key]} label={review.label} />
              <Badge {...PUBLICATION_BADGE[publication.key]} label={publication.label} />
            </div>
            <p className="mt-1 text-sm" style={{ color: app.shortDescription ? C.text : C.textMuted }}>
              {app.shortDescription || 'Adicione uma descrição para apresentar seu aplicativo.'}
            </p>
            <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
              {app.category || 'Categoria não definida'} · Atualizado em {formatDateTimeBR(app.updatedAt)}
            </p>
          </div>
        </div>
        <Link href={previewHref(app.id, review, publication, latestSubmission)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.primary, color: C.primary }}>
          <Eye size={14} aria-hidden="true" /> Visualizar anúncio
        </Link>
      </div>

      {/* Navegação local */}
      <nav aria-label="Seções do acompanhamento" className="flex gap-1 border-b" style={{ borderColor: C.border }}>
        {([['visao', 'Visão geral'], ['mensagens', 'Mensagens da equipe'], ['historico', 'Histórico e versões']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined}
            className="relative px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: tab === key ? C.primary : C.textSecondary, outlineColor: C.primary }}>
            {label}
            {key === 'mensagens' && messages.length > 0 && (
              <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: C.backgroundAlt, color: C.textSecondary }}>{messages.length}</span>
            )}
            {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5" style={{ background: C.primary }} aria-hidden="true" />}
          </button>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[68fr_32fr]">
        {/* Coluna principal — muda por aba */}
        <div className="min-w-0 space-y-5">
          {tab === 'visao' && (
            <>
              <NextStepCard app={app} review={review} publication={publication} latestSubmission={latestSubmission} nextStep={nextStep} />

              {showDraftChecklist ? (
                <div id="preparacao" className="scroll-mt-6 rounded-2xl border bg-white p-5" style={{ borderColor: C.border }}>
                  <div className="mb-1 flex items-center justify-between">
                    <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Preparação do anúncio</h2>
                  </div>
                  <p className="mb-3 text-xs" style={{ color: C.textSecondary }}>{completeGroups} de {checklistGroups.length} grupos completos</p>
                  <div className="space-y-2">
                    {checklistGroups.map(g => {
                      const Icon = GROUP_ICON[g.icon] ?? FileText
                      const badge = CHECKLIST_STATE_BADGE[g.state]
                      return (
                        <div key={g.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: C.backgroundAlt }}>
                          <Icon size={16} style={{ color: C.textSecondary }} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold" style={{ color: C.text }}>{g.label}</p>
                            {g.state !== 'complete' && g.summary && <p className="truncate text-xs" style={{ color: C.textSecondary }}>{g.summary}</p>}
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: badge.bg, color: badge.fg }}>
                            <badge.Icon size={11} aria-hidden="true" /> {CHECKLIST_STATE_LABEL[g.state]}
                          </span>
                          {app.canEdit ? (
                            <Link href={editHref(app.id, g.editRoute, g.editTab, g.editField)}
                              className="shrink-0 text-xs font-semibold hover:underline" style={{ color: C.primary }}>
                              {g.state === 'complete' ? 'Ver' : 'Preencher'}
                            </Link>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-3 text-xs" style={{ color: C.textMuted }}>Seu cadastro pode ser salvo e concluído depois.</p>
                </div>
              ) : checklist.length > 0 && (
                <div className="rounded-2xl border bg-white p-5" style={{ borderColor: C.border }}>
                  <h2 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Checklist da versão enviada</h2>
                  <div className="space-y-2">
                    {checklist.map(item => {
                      const meta = ADMIN_CHECKLIST_META[item.status] ?? ADMIN_CHECKLIST_META.not_reviewed
                      return (
                        <div key={item.itemKey} className="rounded-xl p-3" style={{ background: C.backgroundAlt }}>
                          <div className="flex items-center gap-3">
                            <span className="flex-1 text-sm" style={{ color: C.text }}>{item.itemLabel}</span>
                            <span className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                          </div>
                          {item.itemDescription && <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{item.itemDescription}</p>}
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-3 text-xs" style={{ color: C.textMuted }}>Consulta da versão enviada — a edição só acontece pelo fluxo de rascunho.</p>
                </div>
              )}

              {latestMessage && (
                <div className="rounded-2xl border bg-white p-5" style={{ borderColor: C.border }}>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Mensagem mais recente</h2>
                    <button type="button" onClick={() => setTab('mensagens')} className="text-xs font-semibold hover:underline" style={{ color: C.primary }}>Ver todas</button>
                  </div>
                  <p className="rounded-xl p-3 text-sm" style={{ background: C.backgroundAlt, color: C.text }}>{latestMessage.text}</p>
                  <p className="mt-1.5 text-xs" style={{ color: C.textMuted }}>{formatDateTimeBR(latestMessage.at)}</p>
                </div>
              )}

              <div className="rounded-2xl border bg-white p-5" style={{ borderColor: C.border }}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Últimas atualizações</h2>
                  <button type="button" onClick={() => setTab('historico')} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: C.primary }}>
                    <HistoryIcon size={12} aria-hidden="true" /> Ver histórico completo
                  </button>
                </div>
                <ul className="space-y-2.5">
                  {recentEvents.map((e, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm" style={{ color: C.text }}>{e.label}</p>
                        <p className="text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(e.at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {tab === 'mensagens' && <MessagesPanel messages={messages} appId={app.id} isLatest={isLatestSubmission} />}
          {tab === 'historico' && <HistoryPanel appId={app.id} createdAt={app.createdAt} history={history} />}
        </div>

        {/* Coluna de apoio — persiste entre abas */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border bg-white p-5" style={{ borderColor: C.border }}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Situação do aplicativo</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span style={{ color: C.textSecondary }}>Revisão do cadastro</span>
                <Badge {...REVIEW_BADGE[review.key]} label={review.label} />
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: C.textSecondary }}>Marketplace</span>
                <Badge {...PUBLICATION_BADGE[publication.key]} label={publication.label} />
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg p-3 text-xs" style={{ background: publication.key === 'suspenso' ? '#FEF2F2' : C.backgroundAlt, color: publication.key === 'suspenso' ? '#991B1B' : C.textSecondary }}>
              {publication.key === 'suspenso' && <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />}
              <span>{statusExplanation(review, publication)}</span>
            </div>
            {publication.key === 'suspenso' && (
              <p className="mt-2 text-xs" style={{ color: C.textSecondary }}>Motivo: {app.suspendedReason || 'Nenhum motivo detalhado foi registrado.'}</p>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-5" style={{ borderColor: C.border }}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Informações do aplicativo</h2>
            <dl className="space-y-2.5 text-sm">
              <InfoRow icon={Building2} label="Organização" value={app.organizationName || 'Não informado'} />
              <InfoRow icon={Tag} label="Categoria" value={app.category || 'Não definida'} />
              <InfoRow icon={Globe} label="Origem" value={app.websiteUrl ? 'Importação por URL' : 'Cadastro manual'} />
              <InfoRow icon={Calendar} label="Criado em" value={formatDateTimeBR(app.createdAt)} />
              <InfoRow icon={Calendar} label="Última atualização" value={formatDateTimeBR(app.updatedAt)} />
              <InfoRow icon={Calendar} label="Último envio" value={latestSubmission ? formatDateTimeBR(latestSubmission.submittedAt) : 'Não informado'} />
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5" style={{ color: C.textSecondary }}><Hash size={13} aria-hidden="true" /> ID</dt>
                <dd className="flex items-center gap-1.5">
                  <span className="font-mono text-xs" style={{ color: C.text }}>{app.id.slice(0, 8)}…</span>
                  <button type="button" onClick={copyId} aria-label="Copiar identificador do aplicativo" className="rounded p-1 hover:bg-[#F1F5F9]">
                    {copied ? <Check size={13} style={{ color: '#15803D' }} aria-hidden="true" /> : <Copy size={13} style={{ color: C.textSecondary }} aria-hidden="true" />}
                  </button>
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border bg-white p-5" style={{ borderColor: C.border }}>
            <div className="flex items-center gap-2">
              <HelpCircle size={15} style={{ color: C.primary }} aria-hidden="true" />
              <h2 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Precisa de ajuda?</h2>
            </div>
            <p className="mt-1.5 text-xs" style={{ color: C.textSecondary }}>Fale com a equipe LOBBY sobre seu cadastro.</p>
            <Link href="/dashboard/suporte" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.primary }}>
              Contatar suporte <ChevronRight size={12} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Badge({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: bg, color: fg }}>
      {label}
    </span>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1.5" style={{ color: C.textSecondary }}><Icon size={13} aria-hidden="true" /> {label}</dt>
      <dd className="truncate text-right text-xs font-medium" style={{ color: C.text }} title={value}>{value}</dd>
    </div>
  )
}

function NextStepCard({ app, review, publication, latestSubmission, nextStep }: {
  app: AppInfo; review: ReviewStatus; publication: PublicationStatus; latestSubmission: Props['latestSubmission']; nextStep: 2 | 3 | 4
}) {
  let title = ''
  let text = ''
  let action: { label: string; href?: string; onClick?: () => void } | null = null
  let Icon: React.ElementType = FileText

  if (publication.key === 'suspenso') {
    title = 'Publicação suspensa'
    text = app.suspendedReason || 'A publicação deste aplicativo foi suspensa. Fale com o suporte para entender os próximos passos.'
    action = { label: 'Contatar suporte', href: '/dashboard/suporte' }
    Icon = AlertTriangle
  } else if (publication.key === 'publicado') {
    title = 'Seu aplicativo está no marketplace'
    text = review.key === 'nova_versao_em_analise'
      ? 'O anúncio publicado continua no ar. Uma nova versão enviada depois está em análise agora.'
      : 'Seu anúncio está disponível para os clientes da LOBBY.'
    action = app.applicationSlug ? { label: 'Ver anúncio publicado', href: `/app/${app.applicationSlug}` } : null
    Icon = Rocket
  } else {
    switch (review.key) {
      case 'rascunho':
        title = 'Continue preparando seu aplicativo'
        text = 'Complete as informações e revise sua oferta antes de enviar para análise.'
        action = app.canEdit ? { label: 'Continuar cadastro', href: resumeHref(app.id, nextStep) } : null
        Icon = FileText
        break
      case 'aguardando_analise':
        title = 'Seu aplicativo está na fila de análise'
        text = latestSubmission ? `Enviado em ${formatDateTimeBR(latestSubmission.submittedAt)}. Você será avisado aqui assim que houver retorno.` : 'Aguardando um analista iniciar a revisão.'
        action = latestSubmission ? { label: 'Visualizar versão enviada', href: `/dashboard/meus-app/${app.id}/previa?v=submission&submissionId=${latestSubmission.id}` } : null
        Icon = FileText
        break
      case 'em_analise':
        title = 'A equipe está avaliando seu aplicativo'
        text = 'Acompanhe o retorno por esta página.'
        action = latestSubmission ? { label: 'Visualizar versão enviada', href: `/dashboard/meus-app/${app.id}/previa?v=submission&submissionId=${latestSubmission.id}` } : null
        Icon = FileText
        break
      case 'ajustes_solicitados':
        title = 'Há ajustes para você revisar'
        text = 'A equipe pediu ajustes nesta versão antes de aprovar — veja o resumo abaixo.'
        action = { label: 'Revisar ajustes', onClick: () => document.getElementById('preparacao')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
        Icon = AlertTriangle
        break
      case 'rejeitado':
        title = 'Esta versão não foi aprovada'
        text = 'Veja o motivo na aba Mensagens da equipe.'
        action = app.canEdit ? { label: 'Corrigir e reenviar', href: `/dashboard/meus-app/novo/${app.id}/editar` } : null
        Icon = AlertTriangle
        break
      case 'aprovado':
        title = 'Sua versão foi aprovada'
        text = 'A publicação é feita pela equipe LOBBY após a aprovação — esta página é atualizada quando isso acontecer.'
        Icon = CheckCircle2
        break
      default:
        title = 'Continue preparando seu aplicativo'
        text = 'Complete as informações e revise sua oferta antes de enviar para análise.'
        action = app.canEdit ? { label: 'Continuar cadastro', href: resumeHref(app.id, nextStep) } : null
    }
  }

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: C.border, background: 'linear-gradient(135deg, #EFF6FF, #F7F8FC)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.primary }}>Próximo passo</p>
          <h2 className="text-lg font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h2>
          <p className="mt-1.5 max-w-lg text-sm" style={{ color: C.textSecondary }}>{text}</p>
          {action ? (
            action.href ? (
              <Link href={action.href} target={action.href.startsWith('/app/') ? '_blank' : undefined} rel={action.href.startsWith('/app/') ? 'noopener noreferrer' : undefined}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
                {action.label} <ChevronRight size={14} aria-hidden="true" />
              </Link>
            ) : (
              <button type="button" onClick={action.onClick} className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
                {action.label} <ChevronRight size={14} aria-hidden="true" />
              </button>
            )
          ) : !app.canEdit && (review.key === 'rascunho' || review.key === 'rejeitado') ? (
            <p className="mt-4 text-xs" style={{ color: C.textMuted }}>Você tem acesso de consulta a este aplicativo.</p>
          ) : null}
        </div>
        <Icon size={40} className="hidden shrink-0 sm:block" style={{ color: '#BFDBFE' }} aria-hidden="true" />
      </div>
    </div>
  )
}
