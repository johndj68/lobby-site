'use client'

import Link from 'next/link'
import { ChevronRight, Globe, Building2, FileEdit, Calendar, PenLine, Wallet, ClipboardCheck, HelpCircle, CheckCircle2, Circle, AlertCircle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import EditorChrome, { stepHrefs } from '@/components/vendor/editor/EditorChrome'
import AppLogo from '@/components/admin/AppLogo'
import { formatDateTimeBR } from '@/lib/marketplace'

export type NextStepState = 'not_started' | 'in_progress' | 'complete' | 'pending'

interface Props {
  draft: {
    id: string; name: string | null; category: string | null; status: string
    logoUrl: string | null; websiteUrl: string | null; createdAt: string; lastEditedAt: string
  }
  isPublished: boolean
  organizationName: string | null
  completion: { 1: boolean; 2: boolean; 3: boolean }
  canEdit: boolean
  nextStep: 2 | 3 | 4
  stepStates: { step2: NextStepState; step3: NextStepState; step4: NextStepState }
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', submitted: 'Enviado', under_review: 'Em análise',
  changes_requested: 'Ajustes solicitados', approved: 'Aprovado', published: 'Publicado',
}
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#F1F5F9', fg: colors.textSecondary },
  submitted: { bg: '#EFF6FF', fg: colors.primary },
  under_review: { bg: '#EFF6FF', fg: colors.primary },
  changes_requested: { bg: '#FEF3C7', fg: '#B45309' },
  approved: { bg: '#DCFCE7', fg: '#15803D' },
  published: { bg: '#DCFCE7', fg: '#15803D' },
}

const STEP_STATE_LABEL: Record<NextStepState, string> = {
  not_started: 'Não iniciado', in_progress: 'Em preenchimento', complete: 'Completo', pending: 'Com pendências',
}
const STEP_STATE_COLOR: Record<NextStepState, { bg: string; fg: string }> = {
  not_started: { bg: '#F1F5F9', fg: colors.textSecondary },
  in_progress: { bg: '#EFF6FF', fg: colors.primary },
  complete: { bg: '#DCFCE7', fg: '#15803D' },
  pending: { bg: '#FEF3C7', fg: '#B45309' },
}
function StepStateBadge({ state }: { state: NextStepState }) {
  const c = STEP_STATE_COLOR[state]
  const Icon = state === 'complete' ? CheckCircle2 : state === 'pending' ? AlertCircle : Circle
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: c.bg, color: c.fg }}>
      <Icon size={11} aria-hidden="true" /> {STEP_STATE_LABEL[state]}
    </span>
  )
}

/** Etapa 1 do cadastro (retomada) — mostra a identidade e o progresso real já
 *  salvos, nunca dado inventado. Toda a lógica de "qual o próximo passo" e o
 *  estado de cada etapa vem calculada no server a partir do mesmo motor de
 *  validação usado pelo editor e pela revisão (calculateReview). */
export default function ComecarClient({ draft, isPublished, organizationName, completion, canEdit, nextStep, stepStates }: Props) {
  const steps = stepHrefs(draft.id)
  const nextStepDef = steps.find(s => s.step === nextStep)!
  const statusColor = STATUS_COLOR[draft.status] ?? STATUS_COLOR.draft

  const ctaLabel = !canEdit ? 'Visualizar cadastro' : nextStep === 2 ? 'Continuar para produto e mídia' : 'Retomar cadastro'
  const ctaSubtext = canEdit && nextStep !== 2 ? `Próxima etapa: ${nextStepDef.label}` : null

  const nextSteps: { id: 2 | 3 | 4; label: string; description: string; icon: React.ElementType; state: NextStepState }[] = [
    { id: 2, label: 'Produto e mídia', description: 'Nome, descrições, categoria, logo e galeria.', icon: PenLine, state: stepStates.step2 },
    { id: 3, label: 'Oferta e planos', description: 'Planos, preços e condições comerciais.', icon: Wallet, state: stepStates.step3 },
    { id: 4, label: 'Revisão', description: 'Confira tudo e envie para análise.', icon: ClipboardCheck, state: stepStates.step4 },
  ]

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden" style={{ background: colors.backgroundAlt }}>
      <EditorChrome appId={draft.id} appName={draft.name || 'Aplicativo sem nome'} breadcrumbLabel="Começar" currentStep={1} completed={completion} />

      <div className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-8 sm:px-8">
        <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>
          Continue o cadastro do seu aplicativo
        </h1>
        <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>
          Veja o que já foi preparado e retome de onde parou.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[65fr_35fr]">
          {/* Coluna principal */}
          <div className="space-y-6">
            {/* Identidade */}
            <div className="rounded-xl border bg-white p-5" style={{ borderColor: colors.border }}>
              <div className="flex items-start gap-4">
                <AppLogo url={draft.logoUrl} size={56} theme="light" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold" style={{ color: colors.text }}>
                    {draft.name || 'Aplicativo sem nome'}
                  </h2>
                  {!draft.name?.trim() && (
                    <p className="mt-0.5 text-xs" style={{ color: colors.textMuted }}>
                      Você poderá definir o nome na etapa Produto e mídia.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs" style={{ color: colors.textSecondary }}>{draft.category || 'Categoria não definida'}</span>
                    <span aria-hidden="true" style={{ color: colors.border }}>•</span>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: statusColor.bg, color: statusColor.fg }}>
                      {STATUS_LABEL[draft.status] ?? draft.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                    Última atualização em {formatDateTimeBR(draft.lastEditedAt)}
                  </p>
                </div>
              </div>
            </div>

            {/* Informações do cadastro */}
            <div className="rounded-xl border bg-white p-5" style={{ borderColor: colors.border }}>
              <h3 className="mb-4 text-sm font-bold" style={{ color: colors.text }}>Informações do cadastro</h3>
              <dl className="grid gap-4 sm:grid-cols-2">
                <InfoRow icon={Globe} label="Origem" value={draft.websiteUrl ? 'Importado por URL' : 'Cadastro manual'} />
                <InfoRow icon={Building2} label="Organização" value={organizationName || 'Não identificada'} />
                <InfoRow icon={FileEdit} label="Situação" value={STATUS_LABEL[draft.status] ?? draft.status} />
                <InfoRow icon={Calendar} label="Última atualização" value={formatDateTimeBR(draft.lastEditedAt)} />
              </dl>

              <div className="mt-4 border-t pt-4" style={{ borderColor: colors.borderLight }}>
                {draft.websiteUrl ? (
                  <div>
                    <p className="text-xs font-semibold" style={{ color: colors.text }}>Cadastro iniciado por importação</p>
                    <p className="mt-1 break-all text-xs" style={{ color: colors.textSecondary }}>
                      Site de origem: <a href={draft.websiteUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: colors.primary }}>{draft.websiteUrl}</a>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>Importação concluída — os dados abaixo já podem ser revisados e completados.</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold" style={{ color: colors.text }}>Cadastro iniciado manualmente</p>
                    <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>Nenhum site de origem foi informado na criação — os dados serão preenchidos diretamente nas próximas etapas.</p>
                  </div>
                )}
              </div>

              <p className="mt-4 text-xs" style={{ color: colors.textMuted }}>
                Este aplicativo está vinculado à organização indicada.
              </p>

              {isPublished && (
                <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: '#EFF6FF', color: colors.primary }}>
                  Este aplicativo já está publicado no marketplace. As alterações feitas aqui ficam como rascunho até serem enviadas para uma nova revisão.
                </div>
              )}
            </div>

            <div className="rounded-xl border p-4 text-xs space-y-1" style={{ borderColor: colors.border, background: '#fff', color: colors.textSecondary }}>
              <p>Seu progresso está salvo. Você pode continuar agora ou voltar depois.</p>
              <p>O aplicativo só será enviado para análise quando você confirmar na etapa Revisão.</p>
            </div>
          </div>

          {/* Coluna auxiliar */}
          <div className="space-y-6">
            <div className="rounded-xl border bg-white p-5" style={{ borderColor: colors.border }}>
              <h3 className="mb-3 text-sm font-bold" style={{ color: colors.text }}>Próximos passos</h3>
              <ul className="space-y-1">
                {nextSteps.map(s => {
                  const href = steps.find(st => st.step === s.id)!.href
                  const Icon = s.icon
                  return (
                    <li key={s.id}>
                      <Link href={href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[#F7F8FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005BFF]">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: colors.backgroundAlt }}>
                          <Icon size={15} style={{ color: colors.textSecondary }} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold" style={{ color: colors.text }}>{s.label}</span>
                          <span className="block truncate text-xs" style={{ color: colors.textSecondary }}>{s.description}</span>
                        </span>
                        <StepStateBadge state={s.state} />
                        <ChevronRight size={14} style={{ color: colors.textMuted }} aria-hidden="true" />
                      </Link>
                    </li>
                  )
                })}
              </ul>

              <Link href={nextStepDef.href}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
                style={{ background: colors.primary }}>
                {ctaLabel} <ChevronRight size={14} aria-hidden="true" />
              </Link>
              {ctaSubtext && <p className="mt-1.5 text-center text-xs" style={{ color: colors.textSecondary }}>{ctaSubtext}</p>}
            </div>

            <div className="rounded-xl border bg-white p-5" style={{ borderColor: colors.border }}>
              <div className="flex items-center gap-2">
                <HelpCircle size={16} style={{ color: colors.primary }} aria-hidden="true" />
                <h3 className="text-sm font-bold" style={{ color: colors.text }}>Precisa de ajuda para preparar seu app?</h3>
              </div>
              <p className="mt-1.5 text-xs" style={{ color: colors.textSecondary }}>Fale com a equipe LOBBY sobre o cadastro.</p>
              <Link href="/dashboard/suporte" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: colors.primary }}>
                Contatar suporte <ChevronRight size={12} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div>
      <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.textSecondary }}>
        <Icon size={13} aria-hidden="true" /> {label}
      </dt>
      <dd className="truncate text-sm font-medium" style={{ color: colors.text }} title={value}>{value}</dd>
    </div>
  )
}
