'use client'

import Link from 'next/link'
import { ArrowLeft, ExternalLink, Pencil, MessageSquare, AlertTriangle, FileText, Eye, CheckCircle2, HelpCircle, MinusCircle } from 'lucide-react'
import AppLogo from '@/components/admin/AppLogo'
import { colors as C } from '@/lib/design-tokens'
import { formatDateTimeBR, SUBMISSION_STATUS_LABELS, type PublicationStatus, type ReviewStatus } from '@/lib/marketplace'

interface ChecklistItem { section: string; itemKey: string; itemLabel: string; itemDescription: string | null; status: string }

interface Props {
  app: {
    id: string; name: string; shortDescription: string | null; logoUrl: string | null; category: string
    updatedAt: string; applicationSlug: string | null; suspendedReason: string | null; canEdit: boolean
    ownerName: string | null
  }
  publication: PublicationStatus
  review: ReviewStatus
  latestSubmission: { id: string; submittedAt: string; status: string } | null
  latestMessage: { text: string | null; at: string | null } | null
  history: { id: string; status: string; submittedAt: string; reviewedAt: string | null }[]
  checklist: ChecklistItem[]
}

const CHECKLIST_STATUS_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  checked: { label: 'Conferido', icon: CheckCircle2, color: '#16A34A' },
  adjustment_needed: { label: 'Requer ajuste', icon: AlertTriangle, color: '#D97706' },
  not_applicable: { label: 'Não aplicável', icon: MinusCircle, color: C.textMuted },
  not_reviewed: { label: 'Não revisado', icon: HelpCircle, color: C.textMuted },
}

const REVIEW_EXPLANATION: Record<ReviewStatus['key'], string> = {
  rascunho: 'Este aplicativo ainda não foi enviado para análise.',
  aguardando_analise: 'Sua submissão está na fila, aguardando um analista.',
  em_analise: 'A equipe LOBBY está revisando esta versão agora.',
  ajustes_solicitados: 'A equipe pediu ajustes antes de aprovar esta versão.',
  rejeitado: 'Esta submissão foi rejeitada. Veja o motivo abaixo.',
  aprovado: 'Versão aprovada.',
  nova_versao_em_analise: 'O app publicado continua no ar — uma atualização enviada depois está em análise agora.',
}

export default function AcompanharClient({ app, publication, review, latestSubmission, latestMessage, history, checklist }: Props) {
  return (
    <div className="space-y-5">
      <p className="text-xs" style={{ color: C.textSecondary }}>
        <Link href="/dashboard" className="hover:underline">Dashboard</Link> /{' '}
        <Link href="/dashboard/meus-app" className="hover:underline">Meus aplicativos</Link> / {app.name}
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <AppLogo url={app.logoUrl} size={56} theme="light" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{app.name}</h1>
              <Badge color={review.color} label={review.label} />
              <Badge color={publication.color} label={publication.label} />
            </div>
            <p className="mt-0.5 text-sm" style={{ color: C.textSecondary }}>{app.shortDescription || 'Sem descrição curta.'}</p>
            <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
              {app.category} · Atualizado em {formatDateTimeBR(app.updatedAt)}{app.ownerName ? ` · Equipe de ${app.ownerName}` : ''}
            </p>
          </div>
        </div>
        <Link href="/dashboard/meus-app" className="inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: C.border, color: C.text }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar aos meus aplicativos
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* Estado atual */}
          <div className="rounded-2xl border p-5" style={{ background: C.background, borderColor: C.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
            <h2 className="mb-1 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Situação da análise</h2>
            <p className="text-sm" style={{ color: C.textSecondary }}>{REVIEW_EXPLANATION[review.key]}</p>
            {latestSubmission && (
              <p className="mt-2 text-xs" style={{ color: C.textMuted }}>
                Versão {latestSubmission.id.slice(0, 8)} · enviada em {formatDateTimeBR(latestSubmission.submittedAt)}
              </p>
            )}

            {publication.key === 'suspenso' && (
              <div className="mt-4 rounded-xl border p-3 text-sm" style={{ borderColor: '#FECACA', background: '#FEF2F2', color: '#991B1B' }}>
                <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={14} aria-hidden="true" /> Publicação suspensa</p>
                <p className="mt-1">{app.suspendedReason || 'Nenhum motivo detalhado foi registrado.'}</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {(review.key === 'rascunho' || review.key === 'ajustes_solicitados' || review.key === 'rejeitado') && app.canEdit && (
                <Link href={`/dashboard/meus-app/novo/${app.id}/editar`}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
                  <Pencil size={14} aria-hidden="true" />
                  {review.key === 'rascunho' ? 'Continuar cadastro' : 'Editar e reenviar'}
                </Link>
              )}
              {publication.key === 'publicado' && app.applicationSlug && (
                <a href={`/app/${app.applicationSlug}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
                  <ExternalLink size={14} aria-hidden="true" /> Ver no marketplace
                </a>
              )}
              {latestSubmission && (
                <Link href={`/dashboard/meus-app/${app.id}/previa`}
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
                  <Eye size={14} aria-hidden="true" /> Abrir prévia privada
                </Link>
              )}
            </div>
          </div>

          {/* Checklist da versão enviada — só os campos seguros pro
              parceiro ver (rótulo, descrição, status); anotações internas
              do analista continuam restritas ao admin. */}
          {checklist.length > 0 && (
            <div className="rounded-2xl border p-5" style={{ background: C.background, borderColor: C.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
              <h2 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Checklist da versão enviada</h2>
              <div className="space-y-2">
                {checklist.map(item => {
                  const meta = CHECKLIST_STATUS_META[item.status] ?? CHECKLIST_STATUS_META.not_reviewed
                  const Icon = meta.icon
                  return (
                    <div key={item.itemKey} className="rounded-xl p-3" style={{ background: C.backgroundAlt }}>
                      <div className="flex items-center gap-3">
                        <Icon size={16} style={{ color: meta.color }} aria-hidden="true" />
                        <span className="flex-1 text-sm" style={{ color: C.text }}>{item.itemLabel}</span>
                        <span className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</span>
                      </div>
                      {item.itemDescription && <p className="mt-1 pl-7 text-xs" style={{ color: C.textSecondary }}>{item.itemDescription}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Mensagem da equipe */}
          <div className="rounded-2xl border p-5" style={{ background: C.background, borderColor: C.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Mensagem da equipe</h2>
            {latestMessage?.text ? (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)' }}>L</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs" style={{ color: C.textSecondary }}>
                    Equipe LOBBY{latestMessage.at ? ` · ${formatDateTimeBR(latestMessage.at)}` : ''}
                  </p>
                  <div className="mt-1.5 rounded-xl p-3 text-sm" style={{ background: C.backgroundAlt, color: C.text }}>{latestMessage.text}</div>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm" style={{ color: C.textSecondary }}>
                <MessageSquare size={14} aria-hidden="true" /> Nenhuma mensagem registrada ainda.
              </p>
            )}
          </div>

          {/* Histórico público */}
          <div className="rounded-2xl border p-5" style={{ background: C.background, borderColor: C.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Histórico</h2>
            {history.length === 0 ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Nenhum envio registrado ainda.</p>
            ) : (
              <ol className="space-y-3 border-l pl-4" style={{ borderColor: C.border }}>
                {[...history].reverse().flatMap(h => {
                  const events = [{ at: h.submittedAt, label: `Envio da versão ${h.id.slice(0, 8)}` }]
                  if (h.reviewedAt) events.push({ at: h.reviewedAt, label: `${SUBMISSION_STATUS_LABELS[h.status] ?? h.status} — versão ${h.id.slice(0, 8)}` })
                  return events
                }).map((e, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full" style={{ background: C.primary }} aria-hidden="true" />
                    <p style={{ color: C.text }}>{e.label}</p>
                    <p className="text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(e.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Painel lateral: resumo */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border p-5" style={{ background: C.background, borderColor: C.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Resumo</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt style={{ color: C.textSecondary }}>Análise</dt>
                <dd><Badge color={review.color} label={review.label} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt style={{ color: C.textSecondary }}>Publicação</dt>
                <dd><Badge color={publication.color} label={publication.label} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt style={{ color: C.textSecondary }}>Categoria</dt>
                <dd style={{ color: C.text }}>{app.category}</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
              <FileText size={14} className="shrink-0" style={{ color: C.primary }} aria-hidden="true" />
              Análise e publicação são independentes — aprovar uma versão não publica nem reativa o app automaticamente.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}18`, color }}>
      {label}
    </span>
  )
}
