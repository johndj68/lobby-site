'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown, Eye, ExternalLink,
  Info, Loader2, MinusCircle, HelpCircle,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import MarketplaceTabs from '@/components/admin/MarketplaceTabs'
import AppLogo from '@/components/admin/AppLogo'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ProductPreview from '@/components/vendor/editor/preview/ProductPreview'
import {
  MARKETPLACE_COLORS as C, formatDateTimeBR, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_COLORS,
  isSubmissionDecidable, type PublicationStatus,
} from '@/lib/marketplace'
import { formatCurrencyBRL } from '@/lib/finance'

interface AppInfo {
  id: string; applicationId: string | null; name: string; shortDescription: string | null; fullDescription: string | null
  logoUrl: string | null; category: string; targetAudience: string | null; languages: string[]; platforms: string[]
  requirements: string | null; features: { name?: string; description?: string }[]; benefits: { title?: string; description?: string }[]
  integrations: { name?: string; url?: string }[]; mediaGallery: { url: string; alt_text?: string; type?: string }[]
  videoUrl: string | null; supportEmail: string | null; documentationUrl: string | null; setupInstructions: string | null
  partnerName: string
}
interface PlanInfo { id: string; name: string; price: number | null; currency: string; billing_period: string | null; features: string[]; users_limit: number | null; support_level: string | null }
interface ActivationInfo { method: string | null; link: string | null; supportEmail: string | null; instructions: { id?: string; position?: number; text: string }[] }
interface ChecklistItem { id: string; section: string; itemKey: string; itemLabel: string; itemDescription: string | null; status: string; note: string | null; blocked: boolean; markedAt: string | null }
interface WarningItem { id: string; section: string; severity: string | null; message: string; guidance: string | null; resolvedAt: string | null }
interface HistoryEntry { id: string; status: string; submittedAt: string; reviewedAt: string | null; reviewerName: string | null; submittedByName: string | null; isCurrent: boolean }

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  submission: {
    id: string; status: string; submittedAt: string; reviewedAt: string | null; reviewerName: string | null
    publicFeedback: string | null; internalNotes: string | null; draftMessage: string | null; draftInternalNotes: string | null
    previewData: Record<string, unknown>
  }
  app: AppInfo | null
  publication: PublicationStatus
  plans: PlanInfo[]
  activation: ActivationInfo | null
  checklistItems: ChecklistItem[]
  blockerCount: number
  warnings: WarningItem[]
  history: HistoryEntry[]
}

const REVIEW_TABS = [
  { key: 'visao-geral', label: 'Visão geral' },
  { key: 'conteudo', label: 'Conteúdo' },
  { key: 'oferta', label: 'Oferta' },
  { key: 'ativacao', label: 'Ativação' },
  { key: 'historico', label: 'Histórico' },
] as const
type ReviewTabKey = (typeof REVIEW_TABS)[number]['key']

const CHECKLIST_STATUS_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  checked: { label: 'Conferido', icon: CheckCircle2, color: C.success },
  adjustment_needed: { label: 'Requer ajuste', icon: AlertTriangle, color: C.warning },
  not_applicable: { label: 'Não aplicável', icon: MinusCircle, color: C.textSecondary },
  not_reviewed: { label: 'Não revisado', icon: HelpCircle, color: C.textSecondary },
}

const DECISION_LABEL: Record<'approve' | 'reject' | 'request_changes', string> = {
  approve: 'Aprovar solicitação', reject: 'Rejeitar solicitação', request_changes: 'Solicitar ajustes',
}

export default function SubmissionDetailClient({
  user, profile, submission, app, publication, plans, activation, checklistItems, blockerCount, warnings, history,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = (REVIEW_TABS.find(t => t.key === searchParams.get('tab'))?.key ?? 'visao-geral') as ReviewTabKey

  function setActiveTab(tab: ReviewTabKey) {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'visao-geral') params.delete('tab')
    else params.set('tab', tab)
    router.replace(`/admin/marketplace/solicitacoes/${submission.id}${params.toString() ? `?${params}` : ''}`, { scroll: false })
  }

  const decidable = isSubmissionDecidable(submission.status)

  const [messageTab, setMessageTab] = useState<'dev' | 'internal'>('dev')
  const [message, setMessage] = useState(submission.draftMessage ?? '')
  const [internalNotes, setInternalNotes] = useState(submission.draftInternalNotes ?? '')
  const [lastSaved, setLastSaved] = useState({ message: submission.draftMessage ?? '', internalNotes: submission.draftInternalNotes ?? '' })
  const isDirty = decidable && (message !== lastSaved.message || internalNotes !== lastSaved.internalNotes)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | 'request_changes' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [leaveGuard, setLeaveGuard] = useState(false)

  // Avisa antes de fechar a aba/recarregar com alterações de rascunho não salvas.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  function goToListing() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/admin/marketplace/solicitacoes')
  }
  function handleBackClick() {
    if (isDirty) setLeaveGuard(true)
    else goToListing()
  }

  async function handleSave() {
    setSaveState('saving')
    try {
      const res = await fetch(`/api/admin/submissions/${submission.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_analysis', public_feedback: message, internal_notes: internalNotes }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409) { setConflict(body.error); router.refresh() }
        setSaveState('error')
        toast.error(body.error || 'Não foi possível salvar a análise.')
        return
      }
      setLastSaved({ message, internalNotes })
      setSaveState('saved')
    } catch {
      setSaveState('error')
      toast.error('Falha de conexão ao salvar.')
    }
  }

  async function confirmDecision() {
    if (!pendingAction) return
    if (pendingAction !== 'approve' && !message.trim()) {
      toast.error('Informe o motivo — o parceiro verá essa mensagem.')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/submissions/${submission.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: pendingAction, public_feedback: message, internal_notes: internalNotes }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409) setConflict(body.error)
        toast.error(body.error || 'Não foi possível registrar a decisão.')
        return
      }
      toast.success('Decisão registrada.')
      setPendingAction(null)
      router.refresh()
    } catch {
      toast.error('Falha de conexão ao registrar a decisão.')
    } finally {
      setActionLoading(false)
    }
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const checkedCount = checklistItems.filter(c => c.status === 'checked').length
  const progressPct = checklistItems.length ? Math.round((checkedCount / checklistItems.length) * 100) : 0
  const activeBlockers = warnings.filter(w => w.severity === 'blocker' && !w.resolvedAt)

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
              <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> /{' '}
              <Link href="/admin/marketplace/solicitacoes" className="hover:underline">Solicitações</Link> / {app?.name ?? 'Solicitação'}
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Análise do aplicativo</h1>
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Confira a versão enviada e registre sua decisão.</p>
          </div>
          <button type="button" onClick={handleBackClick}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: C.border, color: C.text }}>
            Voltar às solicitações
          </button>
        </div>

        <MarketplaceTabs active="solicitacoes" />

        {conflict && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            {conflict}
          </div>
        )}

        {!app ? (
          <div className="rounded-2xl border p-6 text-sm" style={{ background: C.card, borderColor: C.border, color: C.textSecondary }}>
            O rascunho original deste aplicativo não foi encontrado — ele pode ter sido removido.
          </div>
        ) : (
          <>
            {/* Card de identificação */}
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between" style={{ background: C.card, borderColor: C.border }}>
              <div className="flex items-start gap-3.5">
                <AppLogo url={app.logoUrl} size={56} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{app.name}</h2>
                    <StatusBadge status={submission.status} />
                    <PublicationBadge publication={publication} />
                  </div>
                  <p className="mt-0.5 text-sm" style={{ color: C.textSecondary }}>{app.shortDescription || 'Sem descrição curta.'}</p>
                  <p className="mt-1.5 text-xs" style={{ color: C.textSecondary }}>
                    Parceiro: {app.partnerName} · {app.category} · Enviado em {formatDateTimeBR(submission.submittedAt)} · Versão {submission.id.slice(0, 8)}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setPreviewOpen(true)}
                className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border px-4 py-2 text-sm font-semibold sm:self-center"
                style={{ borderColor: C.primary, color: C.primary }}>
                <Eye size={14} aria-hidden="true" /> Visualizar prévia
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              {/* Coluna principal */}
              <div className="min-w-0">
                <nav aria-label="Seções da análise" className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
                  {REVIEW_TABS.map(tab => {
                    const active = tab.key === activeTab
                    return (
                      <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                        aria-current={active ? 'page' : undefined}
                        className="px-3 py-2.5 text-sm font-medium"
                        style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>
                        {tab.label}
                      </button>
                    )
                  })}
                </nav>

                {activeTab === 'visao-geral' && (
                  <ChecklistCard items={checklistItems} checkedCount={checkedCount} progressPct={progressPct} expanded={expanded} onToggle={toggleExpanded} />
                )}
                {activeTab === 'conteudo' && <ContentTab app={app} />}
                {activeTab === 'oferta' && <OfferTab plans={plans} previewPlans={(submission.previewData?.plans as PlanInfo[] | undefined)} />}
                {activeTab === 'ativacao' && <ActivationTab activation={activation} />}
                {activeTab === 'historico' && <HistoryTab submission={submission} history={history} />}

                {/* Mensagens / notas */}
                <div className="mt-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
                  <div className="mb-4 flex gap-4 border-b pb-3" style={{ borderColor: C.border }}>
                    <button type="button" onClick={() => setMessageTab('dev')}
                      className="pb-2 text-sm font-semibold"
                      style={{ color: messageTab === 'dev' ? C.text : C.textSecondary, borderBottom: messageTab === 'dev' ? `2px solid ${C.primary}` : 'none' }}>
                      Mensagem ao desenvolvedor
                    </button>
                    <button type="button" onClick={() => setMessageTab('internal')}
                      className="pb-2 text-sm font-semibold"
                      style={{ color: messageTab === 'internal' ? C.text : C.textSecondary, borderBottom: messageTab === 'internal' ? `2px solid ${C.primary}` : 'none' }}>
                      Nota interna
                    </button>
                  </div>

                  {decidable ? (
                    <>
                      <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
                        {messageTab === 'dev'
                          ? 'Este conteúdo será compartilhado ao confirmar uma ação de envio.'
                          : 'Visível somente para a equipe autorizada da LOBBY.'}
                      </p>
                      <textarea
                        value={messageTab === 'dev' ? message : internalNotes}
                        onChange={e => messageTab === 'dev' ? setMessage(e.target.value) : setInternalNotes(e.target.value)}
                        placeholder={messageTab === 'dev' ? 'Mensagem ao desenvolvedor…' : 'Nota interna (não será enviada)…'}
                        rows={5}
                        className="w-full rounded-xl border p-3 text-sm outline-none focus-visible:ring-2"
                        style={{ background: C.bg, borderColor: C.border, color: C.text }}
                      />
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <SaveStateLabel state={saveState} dirty={isDirty} />
                        <button type="button" onClick={handleSave} disabled={saveState === 'saving'}
                          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-60"
                          style={{ borderColor: C.border, color: C.text }}>
                          {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                          Salvar análise
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <SentMessagePanel
                        text={messageTab === 'dev' ? submission.publicFeedback : submission.internalNotes}
                        emptyLabel={messageTab === 'dev' ? 'Nenhuma mensagem foi enviada ao parceiro.' : 'Nenhuma nota interna foi registrada.'}
                        date={submission.reviewedAt} reviewerName={submission.reviewerName}
                      />
                      <p className="mt-3 text-xs" style={{ color: C.textSecondary }}>Histórico da decisão — somente leitura.</p>
                    </>
                  )}
                </div>
              </div>

              {/* Painel de decisão */}
              <div className="lg:sticky lg:top-6 lg:self-start">
                {decidable ? (
                  <DecisionPanel
                    blockerCount={blockerCount} blockers={activeBlockers}
                    setPendingAction={setPendingAction} actionLoading={actionLoading}
                  />
                ) : (
                  <DecidedPanel status={submission.status} reviewedAt={submission.reviewedAt} reviewerName={submission.reviewerName}
                    onViewHistory={() => setActiveTab('historico')} />
                )}
                <PublicationPanel publication={publication} appDraftId={app.id} submissionApproved={submission.status === 'approved'} />
              </div>
            </div>
          </>
        )}
      </div>

      {app && (
        <ConfirmDialog
          open={pendingAction !== null}
          onOpenChange={next => !actionLoading && !next && setPendingAction(null)}
          icon={pendingAction === 'approve' ? CheckCircle2 : pendingAction === 'reject' ? XCircle : AlertTriangle}
          variant={pendingAction === 'reject' ? 'destructive' : 'neutral'}
          title={pendingAction ? DECISION_LABEL[pendingAction] : ''}
          confirmLabel={pendingAction ? DECISION_LABEL[pendingAction] : 'Confirmar'}
          confirmingLabel="Enviando…"
          busy={actionLoading}
          onConfirm={confirmDecision}
          description={
            <div className="space-y-3 text-left">
              <p><strong style={{ color: C.text }}>{app.name}</strong> · versão {submission.id.slice(0, 8)}</p>
              <p>
                {pendingAction === 'approve' && 'Isso aprova esta submissão. Publicar o aplicativo (ou reativar se estiver suspenso) é uma etapa separada, feita em "Gerenciar aplicativo".'}
                {pendingAction === 'reject' && 'O parceiro será notificado por e-mail com o motivo abaixo. Esta decisão fica registrada e não pode ser desfeita por aqui.'}
                {pendingAction === 'request_changes' && 'O parceiro poderá ajustar e reenviar uma nova versão para análise.'}
              </p>
              <label className="block text-xs font-medium" style={{ color: C.text }}>
                Mensagem ao desenvolvedor {pendingAction !== 'approve' && '(obrigatória)'}
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                  className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }}
                  placeholder="Mensagem que será enviada por e-mail…" />
              </label>
              <label className="block text-xs font-medium" style={{ color: C.text }}>
                Nota interna (opcional, não enviada)
                <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2}
                  className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
              </label>
            </div>
          }
        />
      )}

      {app && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-md border" style={{ background: '#0D1428', borderColor: C.border }}>
            <DialogHeader>
              <DialogTitle style={{ color: C.text }}>Prévia da versão enviada</DialogTitle>
              <p className="text-xs" style={{ color: C.textSecondary }}>
                Como o parceiro descreveu o app ao enviar para análise em {formatDateTimeBR(submission.submittedAt)} — pode diferir do rascunho atual.
              </p>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto rounded-xl bg-white p-4">
              <ProductPreview data={submission.previewData} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      <LeaveGuardDialog
        open={leaveGuard} onOpenChange={setLeaveGuard}
        onDiscard={() => { setLeaveGuard(false); goToListing() }}
        onSaveAndLeave={async () => { await handleSave(); setLeaveGuard(false); goToListing() }}
      />
    </AdminShell>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = SUBMISSION_STATUS_LABELS[status]
  const color = SUBMISSION_STATUS_COLORS[status] ?? C.textSecondary
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}22`, color }}>
      {label ?? status}
    </span>
  )
}

function PublicationBadge({ publication }: { publication: PublicationStatus }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${publication.color}22`, color: publication.color }}>
      {publication.label}
    </span>
  )
}

function SaveStateLabel({ state, dirty }: { state: 'idle' | 'saving' | 'saved' | 'error'; dirty: boolean }) {
  if (state === 'saving') return <span className="text-xs" style={{ color: C.textSecondary }}>Salvando…</span>
  if (state === 'error') return <span className="text-xs" style={{ color: C.error }}>Falha ao salvar — tente novamente.</span>
  if (state === 'saved' && !dirty) return <span className="text-xs" style={{ color: C.success }}>Salvo.</span>
  if (dirty) return <span className="text-xs" style={{ color: C.warning }}>Alterações não salvas.</span>
  return <span className="text-xs" style={{ color: C.textSecondary }}>Sem alterações.</span>
}

function ChecklistCard({ items, checkedCount, progressPct, expanded, onToggle }: {
  items: ChecklistItem[]; checkedCount: number; progressPct: number; expanded: Set<string>; onToggle: (id: string) => void
}) {
  return (
    <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
      <h3 className="text-base font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Checklist de revisão</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: C.textSecondary }}>Nenhum item de checklist registrado nesta versão.</p>
      ) : (
        <>
          <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{checkedCount} de {items.length} itens obrigatórios conferidos nesta versão</p>
          <div className="mt-2 mb-4 h-1.5 w-full overflow-hidden rounded-full" style={{ background: C.border }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: C.success }} />
          </div>
          <div className="space-y-2">
            {items.map(item => {
              const meta = CHECKLIST_STATUS_META[item.status] ?? CHECKLIST_STATUS_META.not_reviewed
              const Icon = meta.icon
              const isOpen = expanded.has(item.id)
              return (
                <div key={item.id} className="rounded-xl" style={{ background: C.bg }}>
                  <button type="button" onClick={() => onToggle(item.id)} className="flex w-full items-center gap-3 p-3 text-left">
                    <Icon size={18} style={{ color: meta.color }} aria-hidden="true" />
                    <span className="flex-1 text-sm" style={{ color: C.text }}>{item.itemLabel}</span>
                    <span className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</span>
                    <ChevronDown size={14} style={{ color: C.textSecondary, transform: isOpen ? 'rotate(180deg)' : undefined }} aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <div className="border-t px-3 py-3 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
                      {item.itemDescription && <p className="mb-1">{item.itemDescription}</p>}
                      {item.note ? <p><strong style={{ color: C.text }}>Nota:</strong> {item.note}</p> : <p>Sem nota registrada.</p>}
                      {item.markedAt && <p className="mt-1">Marcado em {formatDateTimeBR(item.markedAt)}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>{label}</h4>
      <div className="text-sm" style={{ color: C.text }}>{children}</div>
    </div>
  )
}
const NOT_INFORMED = <span style={{ color: C.textSecondary }}>Não informado</span>

function ContentTab({ app }: { app: AppInfo }) {
  return (
    <div className="space-y-5 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
      <Field label="Descrição">{app.fullDescription || app.shortDescription || NOT_INFORMED}</Field>
      <Field label="Galeria">
        {app.mediaGallery.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {app.mediaGallery.map((m, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={m.url} alt={m.alt_text || ''} className="aspect-square w-full rounded-lg object-cover" style={{ background: C.bg }} />
            ))}
          </div>
        ) : NOT_INFORMED}
      </Field>
      <Field label="Funcionalidades">
        {app.features.length ? (
          <ul className="space-y-1">
            {app.features.map((f, i) => <li key={i}>• {f.name || f.description || '—'}</li>)}
          </ul>
        ) : NOT_INFORMED}
      </Field>
      <Field label="Público-alvo">{app.targetAudience || NOT_INFORMED}</Field>
      <Field label="Idiomas">{app.languages.length ? app.languages.join(', ') : NOT_INFORMED}</Field>
      <Field label="Plataformas">{app.platforms.length ? app.platforms.join(', ') : NOT_INFORMED}</Field>
    </div>
  )
}

function OfferTab({ plans, previewPlans }: { plans: PlanInfo[]; previewPlans?: PlanInfo[] }) {
  // A versão enviada pode ter congelado os planos no momento do envio
  // (submission.data.plans) — usa esse snapshot quando existe; senão cai
  // nos planos atuais do app_draft (melhor disponível).
  const list = previewPlans?.length ? previewPlans : plans
  return (
    <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
      <h3 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Planos</h3>
      {list.length === 0 ? (
        <p className="text-sm" style={{ color: C.textSecondary }}>Nenhum plano informado.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((plan, i) => (
            <div key={plan.id ?? i} className="rounded-xl border p-4" style={{ borderColor: C.border, background: C.bg }}>
              <p className="font-semibold" style={{ color: C.text }}>{plan.name || 'Plano sem nome'}</p>
              <p className="mt-1 text-lg font-bold" style={{ color: C.success }}>
                {plan.price != null ? (plan.currency === 'BRL' ? formatCurrencyBRL(plan.price) : `${plan.currency} ${plan.price}`) : 'Sem preço'}
                {plan.billing_period && <span className="text-xs font-normal" style={{ color: C.textSecondary }}> / {plan.billing_period}</span>}
              </p>
              {plan.features?.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs" style={{ color: C.textSecondary }}>
                  {plan.features.map((f, j) => <li key={j}>• {f}</li>)}
                </ul>
              )}
              {(plan.users_limit || plan.support_level) && (
                <p className="mt-2 text-xs" style={{ color: C.textSecondary }}>
                  {plan.users_limit ? `Até ${plan.users_limit} usuários` : ''}{plan.users_limit && plan.support_level ? ' · ' : ''}{plan.support_level ?? ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActivationTab({ activation }: { activation: ActivationInfo | null }) {
  const complete = !!activation?.method && (!!activation.link || (activation.instructions?.length ?? 0) > 0)
  return (
    <div className="space-y-5 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Configuração de ativação</h3>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${complete ? C.success : C.warning}22`, color: complete ? C.success : C.warning }}>
          {activation ? (complete ? 'Configuração completa' : 'Configuração pendente') : 'Não configurada'}
        </span>
      </div>
      {!activation ? (
        <p className="text-sm" style={{ color: C.textSecondary }}>Nenhuma configuração de ativação registrada.</p>
      ) : (
        <>
          <Field label="Método">{activation.method || NOT_INFORMED}</Field>
          <Field label="URL de ativação">
            {activation.link ? (
              <a href={activation.link} target="_blank" rel="noopener noreferrer" className="break-all underline" style={{ color: C.primary }}>{activation.link}</a>
            ) : NOT_INFORMED}
          </Field>
          <Field label="Instruções">
            {activation.instructions?.length ? (
              <ol className="list-decimal space-y-1 pl-4">
                {[...activation.instructions].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((step, i) => <li key={step.id ?? i}>{step.text}</li>)}
              </ol>
            ) : NOT_INFORMED}
          </Field>
          <Field label="Contato de suporte">{activation.supportEmail || NOT_INFORMED}</Field>
        </>
      )}
    </div>
  )
}

function HistoryTab({ submission, history }: {
  submission: Props['submission']; history: HistoryEntry[]
}) {
  type Event = { at: string; label: string; detail?: string }
  const events: Event[] = []
  for (const h of history) {
    events.push({ at: h.submittedAt, label: `Envio da versão ${h.id.slice(0, 8)}`, detail: h.submittedByName ? `por ${h.submittedByName}` : undefined })
    if (h.reviewedAt) {
      events.push({
        at: h.reviewedAt,
        label: `${SUBMISSION_STATUS_LABELS[h.status] ?? h.status} — versão ${h.id.slice(0, 8)}${h.isCurrent ? ' (esta análise)' : ''}`,
        detail: h.reviewerName ? `por ${h.reviewerName}` : undefined,
      })
    }
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return (
    <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
      <h3 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Histórico</h3>
      {events.length === 0 ? (
        <p className="text-sm" style={{ color: C.textSecondary }}>Envio registrado em {formatDateTimeBR(submission.submittedAt)}.</p>
      ) : (
        <ol className="space-y-3 border-l pl-4" style={{ borderColor: C.border }}>
          {events.map((e, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full" style={{ background: C.primary }} aria-hidden="true" />
              <p style={{ color: C.text }}>{e.label}</p>
              <p className="text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(e.at)}{e.detail ? ` · ${e.detail}` : ''}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function SentMessagePanel({ text, emptyLabel, date, reviewerName }: {
  text: string | null; emptyLabel: string; date: string | null; reviewerName: string | null
}) {
  if (!text) return <p className="text-sm" style={{ color: C.textSecondary }}>{emptyLabel}</p>
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}>L</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs" style={{ color: C.textSecondary }}>
          Mensagem enviada · Equipe LOBBY{reviewerName ? ` (${reviewerName})` : ''}
          {date ? ` · ${formatDateTimeBR(date)}` : ''}
        </p>
        <div className="mt-1.5 rounded-xl p-3 text-sm" style={{ background: C.bg, color: C.text }}>{text}</div>
      </div>
    </div>
  )
}

function DecisionPanel({ blockerCount, blockers, setPendingAction, actionLoading }: {
  blockerCount: number; blockers: WarningItem[]
  setPendingAction: (a: 'approve' | 'reject' | 'request_changes') => void
  actionLoading: boolean
}) {
  return (
    <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
      <h3 className="mb-4 text-base font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Decisão da análise</h3>

      {blockerCount > 0 && (
        <div className="mb-4 rounded-xl border p-3" style={{ borderColor: C.border, background: C.bg }}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} style={{ color: C.warning }} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-semibold" style={{ color: C.text }}>{blockerCount} pendência{blockerCount > 1 ? 's' : ''} impede{blockerCount > 1 ? 'm' : ''} a aprovação</p>
              <ul className="mt-1 space-y-0.5 text-xs" style={{ color: C.textSecondary }}>
                {blockers.slice(0, 4).map(b => <li key={b.id}>• {b.message}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <button type="button" onClick={() => setPendingAction('request_changes')} disabled={actionLoading}
          className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: C.primary }}>
          Solicitar ajustes
        </button>
        <button type="button" onClick={() => setPendingAction('reject')} disabled={actionLoading}
          className="w-full rounded-xl border py-2.5 text-sm font-bold disabled:opacity-60" style={{ borderColor: C.border, color: C.error }}>
          Rejeitar solicitação
        </button>
        <button type="button" onClick={() => setPendingAction('approve')} disabled={blockerCount > 0 || actionLoading}
          title={blockerCount > 0 ? 'Resolva as pendências bloqueantes do checklist para aprovar.' : undefined}
          className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: blockerCount > 0 ? C.border : C.success }}>
          Aprovar solicitação
        </button>
      </div>
    </div>
  )
}

function DecidedPanel({ status, reviewedAt, reviewerName, onViewHistory }: {
  status: string; reviewedAt: string | null; reviewerName: string | null; onViewHistory: () => void
}) {
  const color = SUBMISSION_STATUS_COLORS[status] ?? C.textSecondary
  const label = SUBMISSION_STATUS_LABELS[status] ?? status
  const Icon = status === 'approved' ? CheckCircle2 : status === 'rejected' ? XCircle : AlertTriangle
  const secondary = status === 'changes_requested'
    ? 'Aguardando o parceiro reenviar uma nova versão.'
    : 'Esta versão já foi analisada.'
  return (
    <div className="mb-4 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
      <h3 className="mb-4 text-base font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Decisão registrada</h3>
      <div className="rounded-xl border p-4" style={{ borderColor: color, background: `${color}14` }}>
        <div className="flex items-center gap-2 font-bold" style={{ color }}>
          <Icon size={18} aria-hidden="true" /> {label}
        </div>
        <p className="mt-1 text-xs" style={{ color: C.text }}>{secondary}</p>
        {(reviewedAt || reviewerName) && (
          <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
            {reviewerName ? `Por ${reviewerName}` : ''}{reviewerName && reviewedAt ? ' · ' : ''}{reviewedAt ? formatDateTimeBR(reviewedAt) : ''}
          </p>
        )}
      </div>
      <button type="button" onClick={onViewHistory}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold"
        style={{ borderColor: C.primary, color: C.primary }}>
        <Clock size={14} aria-hidden="true" /> Ver histórico
      </button>
    </div>
  )
}

function PublicationPanel({ publication, appDraftId, submissionApproved }: {
  publication: PublicationStatus; appDraftId: string; submissionApproved: boolean
}) {
  const manageHref = `/admin/marketplace/aplicativos/${appDraftId}`
  if (publication.key === 'suspenso') {
    return (
      <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
        <h3 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Publicação suspensa</h3>
        <div className="rounded-xl border p-4" style={{ borderColor: C.error, background: `${C.error}14` }}>
          <p className="font-bold" style={{ color: C.error }}>Aplicativo suspenso</p>
          <p className="mt-1 text-xs" style={{ color: C.text }}>A aprovação desta solicitação não remove a suspensão do aplicativo.</p>
        </div>
        <Link href={manageHref} className="mt-3 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white" style={{ background: C.primary }}>
          <ExternalLink size={14} aria-hidden="true" /> Gerenciar aplicativo
        </Link>
      </div>
    )
  }
  if (submissionApproved && publication.key === 'nao_publicado') {
    return (
      <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
        <h3 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Publicação</h3>
        <div className="rounded-xl border p-4" style={{ borderColor: C.primary, background: `${C.primary}14` }}>
          <p className="font-bold" style={{ color: C.primary }}>Aprovado, aguardando publicação</p>
          <p className="mt-1 text-xs" style={{ color: C.text }}>Publicar é feito no fluxo de gerenciamento do aplicativo, separado desta análise.</p>
        </div>
        <Link href={manageHref} className="mt-3 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white" style={{ background: C.primary }}>
          <ExternalLink size={14} aria-hidden="true" /> Gerenciar aplicativo
        </Link>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
      <h3 className="mb-2 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Publicação</h3>
      <p className="mb-3 text-xs" style={{ color: C.textSecondary }}>Situação atual: <span style={{ color: publication.color, fontWeight: 700 }}>{publication.label}</span></p>
      <Link href={manageHref} className="flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
        <ExternalLink size={14} aria-hidden="true" /> Gerenciar aplicativo
      </Link>
    </div>
  )
}

function LeaveGuardDialog({ open, onOpenChange, onDiscard, onSaveAndLeave }: {
  open: boolean; onOpenChange: (v: boolean) => void; onDiscard: () => void; onSaveAndLeave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-sm rounded-2xl border p-6" style={{ background: '#0D1428', borderColor: C.border, color: C.text }}>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${C.warning}22` }}>
          <Info size={22} style={{ color: C.warning }} aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Alterações não salvas</h2>
        <p className="mt-2 text-sm" style={{ color: C.textSecondary }}>Sua mensagem ou nota ainda não foi salva. O que deseja fazer?</p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={onSaveAndLeave} className="rounded-xl py-2.5 text-sm font-bold text-white" style={{ background: C.primary }}>Salvar e sair</button>
          <button type="button" onClick={onDiscard} className="rounded-xl border py-2.5 text-sm font-semibold" style={{ borderColor: C.border, color: C.error }}>Descartar alterações</button>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-xl border py-2.5 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>Continuar na página</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
