'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, ChevronDown, AlertTriangle, CheckCircle2, HelpCircle, Eye, Loader2,
  FileText, ImageIcon, ListChecks, Tag, Package, BookOpen, ShieldCheck, Users, LifeBuoy, Lock,
} from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import EditorChrome from '@/components/vendor/editor/EditorChrome'
import AppLogo from '@/components/admin/AppLogo'
import { computeSubmitGate, TERMS_DOCUMENTS_AVAILABLE, type Acceptances } from '@/lib/services/submission-gate'
import { formatDateTimeBR, SUBMISSION_STATUS_LABELS } from '@/lib/marketplace'
import type { ReviewResult } from '@/lib/validations/app-review'

const SECTION_ICON: Record<string, React.ElementType> = {
  basicInfo: FileText, media: ImageIcon, features: ListChecks, offer: Tag, activation: Package,
  history: BookOpen, signals: ShieldCheck, faq: HelpCircle, team: Users,
}

interface Props {
  draft: { id: string; name: string | null; category: string | null; logoUrl: string | null; lastEditedAt: string }
  vendorName: string | null
  review: ReviewResult
  completion: { 1: boolean; 2: boolean; 3: boolean }
  canEdit: boolean
  submissionStatus: { key: string; label: string; color: string }
  latestSubmission: { id: string; status: string; submittedAt: string; publicFeedback: string | null } | null
}

// A revisão só fica editável/enviável nesses dois estados — os mesmos que
// a página de acompanhamento já trata como "decidível". Qualquer outro
// (aguardando/em análise, aprovado, publicado, rejeitado) é consulta.
const EDITABLE_STATES = new Set(['rascunho', 'ajustes_solicitados'])

export default function ReviewClient({ draft, vendorName, review, completion, canEdit, submissionStatus, latestSubmission }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [acceptances, setAcceptances] = useState<Acceptances>({ authorized: false, reviewed: false, partnerTerms: false, commercialTerms: false })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  // ref (não state) pra bloquear cliques repetidos de verdade — o estado
  // 'submitting' só reflete depois de um re-render, um segundo clique bem
  // rápido ainda cabe entre o clique e esse re-render.
  const submittingRef = useRef(false)

  const editable = EDITABLE_STATES.has(submissionStatus.key)
  const gate = computeSubmitGate({ contentBlockers: review.blockers, acceptances, canEdit, uploadInFlight: false })

  function goToIssue(editRoute: string, editTab?: string, editField?: string) {
    const params = editTab ? `?tab=${editTab}` : ''
    const hash = editField ? `#${editField}` : ''
    router.push(`/dashboard/meus-app/novo/${draft.id}/${editRoute}${params}${hash}`)
  }

  function firstBlockingIssue() {
    for (const item of review.items) {
      const issue = item.issues.find(i => i.severity === 'blocked')
      if (issue) return issue
    }
    return null
  }

  async function handleSubmit() {
    if (submittingRef.current || !gate.canSubmit) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/apps/${draft.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptances: {
            authorized_to_commercialize: acceptances.authorized,
            reviewed_app_info: acceptances.reviewed,
            accepted_partner_terms: acceptances.partnerTerms,
            accepted_commercial_terms: acceptances.commercialTerms,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Resultado incerto (ex.: timeout) — confere se já foi enviado antes
        // de mostrar erro, pra não fazer o parceiro tentar de novo à toa.
        if (res.status === 409) {
          const check = await fetch(`/api/apps/${draft.id}/review/checklist`).catch(() => null)
          if (check?.ok) { router.refresh(); }
        }
        throw new Error(data.error || 'Não foi possível enviar. Tente novamente.')
      }

      router.push(`/dashboard/meus-app/novo/${draft.id}/revisao/enviado`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível enviar. Tente novamente.')
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  const firstIssue = firstBlockingIssue()

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden" style={{ background: colors.backgroundAlt }}>
      <EditorChrome appId={draft.id} appName={draft.name || 'Aplicativo sem nome'} breadcrumbLabel="Revisão" currentStep={4} completed={completion} />

      <div className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-8">
        {/* Título */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>Revise antes de enviar</h1>
            <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>Confira as informações do seu aplicativo e envie para análise da equipe LOBBY.</p>
          </div>
          <Link href={`/dashboard/meus-app/${draft.id}/previa?v=draft`}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: colors.primary, color: colors.primary }}>
            <Eye size={14} aria-hidden="true" /> Visualizar anúncio
          </Link>
        </div>

        {/* Identidade */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-5" style={{ borderColor: colors.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
          <div className="flex items-center gap-3.5">
            <AppLogo url={draft.logoUrl} size={48} theme="light" />
            <div>
              <p className="font-bold" style={{ color: colors.text }}>{draft.name || 'Aplicativo sem nome'}</p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                {vendorName ? `Por ${vendorName}` : 'Vendedor não identificado'} · {draft.category || 'Sem categoria'} · Atualizado em {formatDateTimeBR(draft.lastEditedAt)}
              </p>
            </div>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: `${submissionStatus.color}18`, color: submissionStatus.color }}>
            {submissionStatus.label}
          </span>
        </div>

        {!editable ? (
          <ConsultNotice status={submissionStatus} appId={draft.id} latestSubmission={latestSubmission} />
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-[68fr_32fr]">
            <div className="min-w-0 space-y-5">
              <PendencyBanner review={review} gate={gate} onFixFirst={() => firstIssue && goToIssue(firstIssue.editRoute!, firstIssue.editTab, firstIssue.editField)} />

              <div className="rounded-2xl border bg-white p-5" style={{ borderColor: colors.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
                <h2 className="mb-4 text-base font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>Confira seu cadastro</h2>
                <div className="space-y-2">
                  {review.items.map(item => (
                    <ChecklistRow key={item.id} item={item} isOpen={!!expanded[item.id]}
                      onToggle={() => setExpanded(e => ({ ...e, [item.id]: !e[item.id] }))}
                      onGoTo={(editTab, editField) => goToIssue(item.editRoute, editTab, editField)} />
                  ))}
                </div>
                <p className="mt-4 text-xs" style={{ color: colors.textSecondary }}>Itens opcionais não impedem o envio.</p>
              </div>

              <TermsCard acceptances={acceptances} setAcceptances={setAcceptances} error={submitError} />
            </div>

            <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
              <TimelineCard />
              <HelpCard />
            </div>
          </div>
        )}
      </div>

      {editable && (
        <div className="sticky bottom-0 z-10 border-t bg-white px-4 py-3 sm:px-8" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => router.push(`/dashboard/meus-app/novo/${draft.id}/planos`)}
              className="rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
              ← Voltar para oferta e planos
            </button>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              {!gate.canSubmit && gate.blockingReason && (
                <p className="text-xs font-medium sm:mr-2" style={{ color: '#D97706' }}>{gate.blockingReason}</p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => router.push(`/dashboard/meus-app/${draft.id}`)}
                  className="flex-1 rounded-lg border px-4 py-2 text-sm font-semibold sm:flex-none" style={{ borderColor: colors.border, color: colors.text }}>
                  Salvar e sair
                </button>
                <button type="button" onClick={handleSubmit} disabled={!gate.canSubmit || submitting}
                  aria-busy={submitting}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed sm:flex-none"
                  style={{ background: gate.canSubmit ? colors.primary : '#D1D5DB' }}>
                  {submitting ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Enviando…</> : <>Enviar para análise <ChevronRight size={16} aria-hidden="true" /></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PendencyBanner({ review, gate, onFixFirst }: { review: ReviewResult; gate: ReturnType<typeof computeSubmitGate>; onFixFirst: () => void }) {
  if (review.blockers > 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4" style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}>
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: '#D97706' }} aria-hidden="true" />
          <div>
            <p className="font-semibold" style={{ color: '#92400E' }}>
              Faltam {review.blockers} informaç{review.blockers === 1 ? 'ão obrigatória' : 'ões obrigatórias'} para enviar.
            </p>
            <p className="text-sm" style={{ color: '#92400E' }}>Confira os itens abaixo e acesse os campos que precisam de correção.</p>
          </div>
        </div>
        <button type="button" onClick={onFixFirst} className="shrink-0 text-sm font-semibold underline" style={{ color: '#92400E' }}>
          Corrigir primeira pendência →
        </button>
      </div>
    )
  }
  if (gate.acceptancesRemaining > 0 || !gate.termsAvailable) {
    return (
      <div className="rounded-2xl border p-4" style={{ borderColor: '#BFDBFE', background: '#EFF6FF' }}>
        <p className="font-semibold" style={{ color: colors.text }}>As informações obrigatórias estão completas.</p>
        <p className="text-sm" style={{ color: colors.textSecondary }}>Revise as confirmações e os termos para concluir o envio.</p>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border p-4" style={{ borderColor: '#BBF7D0', background: '#F0FDF4' }}>
      <CheckCircle2 size={18} style={{ color: '#16A34A' }} aria-hidden="true" />
      <p className="font-semibold" style={{ color: '#15803D' }}>Seu cadastro está pronto para envio.</p>
    </div>
  )
}

function ChecklistRow({ item, isOpen, onToggle, onGoTo }: {
  item: ReviewResult['items'][number]; isOpen: boolean; onToggle: () => void; onGoTo: (editTab?: string, editField?: string) => void
}) {
  const Icon = SECTION_ICON[item.id] ?? FileText
  const meta = item.status === 'complete'
    ? { label: 'Completo', color: '#16A34A', bg: '#F0FDF4' }
    : item.status === 'optional'
      ? { label: 'Opcional — não preenchido', color: colors.textMuted, bg: colors.backgroundAlt }
      : item.status === 'warning'
        ? { label: 'Recomendado', color: '#D97706', bg: '#FFFBEB' }
        : { label: `${item.issues.length} pendência${item.issues.length === 1 ? '' : 's'}`, color: '#DC2626', bg: '#FEF2F2' }

  return (
    <div className="rounded-xl border" style={{ borderColor: colors.border }}>
      <button type="button" onClick={onToggle} aria-expanded={isOpen}
        className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005BFF]">
        <Icon size={18} style={{ color: colors.textSecondary }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold" style={{ color: colors.text }}>{item.name}</p>
          <p className="truncate text-xs" style={{ color: colors.textSecondary }}>{item.summary}</p>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
        <ChevronDown size={16} style={{ color: colors.textSecondary, transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="border-t p-4" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
          {item.issues.length > 0 ? (
            <div className="mb-3 space-y-2.5">
              {item.issues.map((issue, idx) => (
                <div key={idx} className="text-sm">
                  <p className="font-medium" style={{ color: issue.severity === 'blocked' ? '#DC2626' : '#D97706' }}>{issue.message}</p>
                  {issue.editRoute && (
                    <button type="button" onClick={() => onGoTo(issue.editTab, issue.editField)} className="mt-0.5 text-xs font-semibold" style={{ color: colors.primary }}>
                      Corrigir →
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : item.status === 'optional' ? (
            <p className="mb-3 text-sm" style={{ color: colors.textSecondary }}>Seção opcional — nenhum conteúdo preenchido ainda.</p>
          ) : (
            <p className="mb-3 text-sm" style={{ color: '#16A34A' }}>Seção preenchida — dados presentes conforme validação automática.</p>
          )}
          <button type="button" onClick={() => onGoTo(item.editTab)}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: colors.border, color: colors.text }}>
            {item.status === 'optional' ? 'Completar informações' : 'Editar seção'}
          </button>
        </div>
      )}
    </div>
  )
}

function TermsCard({ acceptances, setAcceptances, error }: {
  acceptances: Acceptances; setAcceptances: (a: Acceptances) => void; error: string
}) {
  const disabled = !TERMS_DOCUMENTS_AVAILABLE
  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: colors.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
      <h3 className="text-base font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>Confirmações e termos</h3>
      <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>Leia os documentos e confirme as informações antes de enviar.</p>

      {disabled && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: '#FDE68A', background: '#FFFBEB', color: '#92400E' }}>
          <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          Os termos de parceiro e as condições comerciais ainda não foram publicados pela LOBBY — o envio fica bloqueado até esses documentos estarem disponíveis. Seu rascunho continua salvo normalmente.
        </div>
      )}

      <div className="mt-4 space-y-1">
        <CheckboxRow id="acc-authorized" checked={acceptances.authorized} disabled={disabled}
          onChange={v => setAcceptances({ ...acceptances, authorized: v })}
          label="Tenho autorização para comercializar este aplicativo." />
        <CheckboxRow id="acc-reviewed" checked={acceptances.reviewed} disabled={disabled}
          onChange={v => setAcceptances({ ...acceptances, reviewed: v })}
          label="Revisei as informações, imagens e condições da oferta." />
        <CheckboxRow id="acc-partner" checked={acceptances.partnerTerms} disabled={disabled}
          onChange={v => setAcceptances({ ...acceptances, partnerTerms: v })}
          label={<>Li e aceito os {disabled ? <span className="font-semibold" style={{ color: colors.textMuted }}>Termos de Parceiros da LOBBY (indisponível)</span> : <a href="/sobre#termos" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="font-semibold underline" style={{ color: colors.primary }}>Termos de Parceiros da LOBBY</a>}.</>} />
        <CheckboxRow id="acc-commercial" checked={acceptances.commercialTerms} disabled={disabled}
          onChange={v => setAcceptances({ ...acceptances, commercialTerms: v })}
          label={<>Li e aceito as {disabled ? <span className="font-semibold" style={{ color: colors.textMuted }}>condições comerciais aplicáveis (indisponível)</span> : <a href="/sobre#termos" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="font-semibold underline" style={{ color: colors.primary }}>condições comerciais aplicáveis</a>}.</>} />
      </div>

      <p className="mt-4 text-xs" style={{ color: colors.textSecondary }}>O destaque patrocinado é opcional e contratado separadamente.</p>
      {error && <p className="mt-3 text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>}
    </div>
  )
}

function CheckboxRow({ id, checked, disabled, onChange, label }: { id: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label htmlFor={id} className={`flex items-start gap-3 rounded-lg p-2.5 ${disabled ? '' : 'cursor-pointer hover:bg-gray-50'}`}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#005BFF]" />
      <span className="text-sm" style={{ color: disabled ? colors.textMuted : colors.text }}>{label}</span>
    </label>
  )
}

function TimelineCard() {
  const steps = [
    { num: 1, title: 'Envio para análise', desc: 'Seu cadastro entra na fila de revisão.' },
    { num: 2, title: 'Avaliação da equipe', desc: 'Conferimos o produto, o conteúdo e as condições da oferta.' },
    { num: 3, title: 'Retorno pelo painel', desc: 'Você acompanha a decisão ou as solicitações de ajuste.' },
    { num: 4, title: 'Publicação', desc: 'Após aprovação e conclusão das condições necessárias.' },
  ]
  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: colors.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
      <h3 className="mb-4 text-base font-bold" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>O que acontece depois?</h3>
      <ol className="space-y-4 border-l pl-4" style={{ borderColor: colors.border }}>
        {steps.map(s => (
          <li key={s.num} className="relative text-sm">
            <span className="absolute -left-[21px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: colors.primary }}>{s.num}</span>
            <p className="font-semibold" style={{ color: colors.text }}>{s.title}</p>
            <p style={{ color: colors.textSecondary }}>{s.desc}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-start gap-2 border-t pt-4 text-xs" style={{ borderColor: colors.border, color: colors.textSecondary }}>
        <ShieldCheck size={14} className="mt-0.5 shrink-0" style={{ color: colors.primary }} aria-hidden="true" />
        Enviar para análise não publica seu aplicativo.
      </div>
    </div>
  )
}

function HelpCard() {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: '#BFDBFE', background: '#EFF6FF' }}>
      <div className="mb-1 flex items-center gap-2">
        <LifeBuoy size={16} style={{ color: colors.primary }} aria-hidden="true" />
        <h3 className="text-base font-bold" style={{ color: colors.primary, fontFamily: 'Space Grotesk, sans-serif' }}>Precisa de ajuda?</h3>
      </div>
      <p className="mb-3 text-sm" style={{ color: colors.textSecondary }}>Fale com a equipe LOBBY sobre o cadastro do seu aplicativo.</p>
      <Link href="/dashboard/suporte" className="text-sm font-semibold" style={{ color: colors.primary }}>Contatar suporte →</Link>
    </div>
  )
}

function ConsultNotice({ status, appId, latestSubmission }: {
  status: { key: string; label: string; color: string }; appId: string
  latestSubmission: { id: string; status: string; submittedAt: string; publicFeedback: string | null } | null
}) {
  return (
    <div className="mt-5 space-y-5">
      <div className="rounded-2xl border p-5" style={{ borderColor: `${status.color}55`, background: `${status.color}0F` }}>
        <div className="flex items-center gap-2 font-bold" style={{ color: status.color }}>
          <Lock size={16} aria-hidden="true" /> {status.label}
        </div>
        <p className="mt-1 text-sm" style={{ color: colors.text }}>
          Esta versão já foi enviada e não pode ser reenviada por aqui — a página de acompanhamento mostra o estado real,
          a mensagem da equipe e o histórico completo.
        </p>
        {latestSubmission?.publicFeedback && (
          <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: '#fff', color: colors.text }}>
            “{latestSubmission.publicFeedback}”
          </div>
        )}
        <Link href={`/dashboard/meus-app/${appId}`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: colors.primary }}>
          Acompanhar análise <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <p className="text-xs" style={{ color: colors.textSecondary }}>
        Status da última submissão: {latestSubmission ? SUBMISSION_STATUS_LABELS[latestSubmission.status] ?? latestSubmission.status : '—'}
        {latestSubmission ? ` · enviada em ${formatDateTimeBR(latestSubmission.submittedAt)}` : ''}
      </p>
    </div>
  )
}
