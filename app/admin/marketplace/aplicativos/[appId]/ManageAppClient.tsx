'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Grid3x3, Copy, ExternalLink, Rocket, PauseCircle, PlayCircle,
  Info, Package, Zap, History as HistoryIcon, FileText,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MARKETPLACE_COLORS as C, formatDateTimeBR, ORIGIN_LABEL, type PublicationStatus, type ReviewStatus } from '@/lib/marketplace'

interface DraftInfo {
  id: string; name: string; shortDescription: string | null; fullDescription: string | null
  logoUrl: string | null; category: string; createdAt: string; updatedAt: string
  websiteUrl: string | null; mediaGallery: { type: string; url: string }[]
}
interface Plan { id: string; name: string; price: number | null; currency: string; billing_period: string; features: string[] | null; users_limit: number | null; support_level: string | null }
interface ActivationConfig { activation_method: string | null; activation_link: string | null; support_email: string | null; instructions: unknown }
interface SubmissionItem { id: string; status: string; submitted_at: string; reviewed_at: string | null; public_feedback: string | null; published_at: string | null; actorName: string | null }
interface EventItem { id: string; action: string; reason: string | null; previous_status: string | null; new_status: string | null; actorName: string; created_at: string }

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  draft: DraftInfo
  origin: 'lobby' | 'partner'
  partnerName: string
  publication: PublicationStatus
  review: ReviewStatus
  canPublish: boolean
  canSuspend: boolean
  canReactivate: boolean
  applicationSlug: string | null
  suspendedReason: string | null
  plans: Plan[]
  activationConfig: ActivationConfig | null
  submissions: SubmissionItem[]
  events: EventItem[]
}

const TABS = ['Resumo', 'Conteúdo e mídia', 'Ofertas e planos', 'Ativação e entrega', 'Versões e solicitações', 'Histórico'] as const
type Tab = typeof TABS[number]

const ACTION_LABEL: Record<string, string> = { publish: 'Publicado', suspend: 'Suspenso', reactivate: 'Reativado' }
const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando análise', under_review: 'Em análise', changes_requested: 'Ajustes solicitados',
  approved: 'Aprovado', rejected: 'Rejeitado',
}

export default function ManageAppClient({
  user, profile, draft, origin, partnerName, publication, review, canPublish, canSuspend, canReactivate,
  applicationSlug, suspendedReason, plans, activationConfig, submissions, events,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Resumo')
  const [busy, setBusy] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [showSuspend, setShowSuspend] = useState(false)
  const [showReactivate, setShowReactivate] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')

  async function runAction(url: string, body: Record<string, unknown> | undefined, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return false }
      toast.success(successMsg)
      router.refresh()
      return true
    } catch {
      toast.error('Falha de conexão. Tente novamente.')
      return false
    } finally { setBusy(false) }
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/admin/marketplace/aplicativos" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar aos aplicativos
        </Link>

        {/* Cabeçalho */}
        <div className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              {draft.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.logoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: C.header }}>
                  <Grid3x3 size={22} style={{ color: C.textSecondary }} aria-hidden="true" />
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{draft.name}</h1>
                <button onClick={() => { navigator.clipboard.writeText(draft.id); toast.success('ID copiado.') }}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs" style={{ color: C.textSecondary }}>
                  ID: {draft.id.slice(0, 8)}… <Copy size={11} aria-hidden="true" />
                </button>
                <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
                  {origin === 'lobby' ? ORIGIN_LABEL.lobby : `${ORIGIN_LABEL.partner} · ${partnerName}`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={publication.color} label={publication.label} />
              <Badge color={review.color} label={review.label} />
              {canPublish && <ActionButton icon={Rocket} label="Publicar" onClick={() => setShowPublish(true)} primary />}
              {canSuspend && <ActionButton icon={PauseCircle} label="Suspender" onClick={() => { setSuspendReason(''); setShowSuspend(true) }} />}
              {canReactivate && <ActionButton icon={PlayCircle} label="Reativar" onClick={() => setShowReactivate(true)} primary />}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-xs sm:grid-cols-4" style={{ borderColor: C.border }}>
            <Info2 label="Categoria" value={draft.category} />
            <Info2 label="Versão pública" value={applicationSlug ? 'Publicada' : 'Nenhuma ainda'} />
            <Info2 label="Cadastrado em" value={formatDateTimeBR(draft.createdAt)} />
            <Info2 label="Atualizado em" value={formatDateTimeBR(draft.updatedAt)} />
          </div>
          {publication.key === 'suspenso' && suspendedReason && (
            <p className="mt-3 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.error, color: C.text, background: 'rgba(239,68,68,0.08)' }}>
              Motivo da suspensão: {suspendedReason}
            </p>
          )}
          {review.key === 'nova_versao_em_analise' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
              <Info size={13} className="mt-0.5 shrink-0" style={{ color: C.primary }} aria-hidden="true" />
              Publicação e revisão são independentes. Uma nova versão em análise não altera a versão que já está no marketplace.
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-3 py-2.5 text-sm font-medium"
              style={{ color: tab === t ? C.primary : C.textSecondary, borderBottom: tab === t ? `2px solid ${C.primary}` : '2px solid transparent' }}>
              {t}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          {tab === 'Resumo' && (
            <div className="space-y-4 text-sm" style={{ color: C.text }}>
              <p>{draft.shortDescription || 'Sem descrição curta cadastrada.'}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link href="/admin/marketplace/solicitacoes" className="flex items-center justify-between rounded-xl border p-3 text-xs font-semibold" style={{ borderColor: C.border, color: C.primary }}>
                  Ver solicitações <ExternalLink size={13} aria-hidden="true" />
                </Link>
                {applicationSlug && publication.key === 'publicado' ? (
                  <Link href={`/app/${applicationSlug}`} target="_blank" className="flex items-center justify-between rounded-xl border p-3 text-xs font-semibold" style={{ borderColor: C.border, color: C.primary }}>
                    Ver página pública <ExternalLink size={13} aria-hidden="true" />
                  </Link>
                ) : (
                  <div title="Só existe depois de publicado" className="flex items-center justify-between rounded-xl border p-3 text-xs font-semibold opacity-40" style={{ borderColor: C.border, color: C.textSecondary }}>
                    Ver página pública <ExternalLink size={13} aria-hidden="true" />
                  </div>
                )}
                <div title="O editor do parceiro só é acessível pela conta do próprio parceiro hoje" className="flex items-center justify-between rounded-xl border p-3 text-xs font-semibold opacity-40" style={{ borderColor: C.border, color: C.textSecondary }}>
                  Editar rascunho <ExternalLink size={13} aria-hidden="true" />
                </div>
                <div title="Gestão de campanhas patrocinadas ainda não implementada (/admin/marketplace/destaques)" className="flex items-center justify-between rounded-xl border p-3 text-xs font-semibold opacity-40" style={{ borderColor: C.border, color: C.textSecondary }}>
                  Gerenciar destaque <ExternalLink size={13} aria-hidden="true" />
                </div>
              </div>
            </div>
          )}

          {tab === 'Conteúdo e mídia' && (
            <div className="space-y-4 text-sm" style={{ color: C.text }}>
              <p style={{ color: C.textSecondary }}>{draft.fullDescription || 'Sem descrição completa cadastrada.'}</p>
              {draft.mediaGallery.length === 0 ? (
                <p className="text-xs" style={{ color: C.textSecondary }}>Nenhuma imagem cadastrada.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {draft.mediaGallery.map((m, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={m.url} alt={m.type} className="aspect-video w-full rounded-lg object-cover" style={{ background: C.header }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'Ofertas e planos' && (
            plans.length === 0 ? (
              <EmptyState icon={Package} text="Nenhuma oferta cadastrada ainda." />
            ) : (
              <div className="space-y-3">
                {plans.map(p => (
                  <div key={p.id} className="rounded-xl border p-3" style={{ borderColor: C.border }}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold" style={{ color: C.text }}>{p.name}</p>
                      <p className="text-sm" style={{ color: C.textSecondary }}>
                        {p.price != null ? `${p.currency} ${p.price.toFixed(2)}` : 'Gratuito'} · {p.billing_period}
                      </p>
                    </div>
                    {p.features && p.features.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {p.features.map((f, i) => (
                          <li key={i} className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: C.header, color: C.textSecondary }}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'Ativação e entrega' && (
            !activationConfig ? (
              <EmptyState icon={Zap} text="Nenhuma configuração de ativação cadastrada ainda." />
            ) : (
              <div className="space-y-2 text-sm" style={{ color: C.text }}>
                <Info2 label="Método" value={activationConfig.activation_method || '—'} />
                <Info2 label="Link de ativação" value={activationConfig.activation_link || '—'} />
                <Info2 label="E-mail de suporte" value={activationConfig.support_email || '—'} />
              </div>
            )
          )}

          {tab === 'Versões e solicitações' && (
            submissions.length === 0 ? (
              <EmptyState icon={FileText} text="Nenhuma submissão enviada ainda." />
            ) : (
              <ul className="space-y-2">
                {submissions.map(s => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl border p-3 text-sm" style={{ borderColor: C.border }}>
                    <div>
                      <p style={{ color: C.text }}>{SUBMISSION_STATUS_LABEL[s.status] ?? s.status}{s.published_at ? ' · publicada' : ''}</p>
                      <p className="text-xs" style={{ color: C.textSecondary }}>Enviada em {formatDateTimeBR(s.submitted_at)} por {s.actorName ?? 'usuário removido'}</p>
                    </div>
                    <Link href={`/admin/marketplace/solicitacoes/${s.id}`} className="text-xs font-semibold" style={{ color: C.primary }}>Ver →</Link>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === 'Histórico' && (
            events.length === 0 ? (
              <EmptyState icon={HistoryIcon} text="Nenhuma ação administrativa registrada ainda." />
            ) : (
              <ul className="space-y-2">
                {events.map(e => (
                  <li key={e.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: C.border }}>
                    <p style={{ color: C.text }}>{ACTION_LABEL[e.action] ?? e.action} por {e.actorName}</p>
                    {e.reason && <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>Motivo: {e.reason}</p>}
                    <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(e.created_at)}</p>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>

      <ConfirmDialog open={showPublish} onOpenChange={setShowPublish} icon={Rocket} variant="neutral" title="Publicar aplicativo?"
        description={<><strong style={{ color: C.text }}>{draft.name}</strong> passa a aparecer como publicado. Pedidos e direitos de compradores anteriores não são afetados.</>}
        confirmLabel="Publicar" confirmingLabel="Publicando…" busy={busy}
        onConfirm={async () => { const ok = await runAction(`/api/admin/apps/${draft.id}/publish`, undefined, `${draft.name} publicado.`); if (ok) setShowPublish(false) }} />

      <ConfirmDialog open={showSuspend} onOpenChange={setShowSuspend} icon={PauseCircle} variant="destructive" title="Suspender publicação?"
        description={
          <div className="space-y-3">
            <p><strong style={{ color: C.text }}>{draft.name}</strong> sai da vitrine pública imediatamente. Nenhuma assinatura é cancelada nem reembolso é feito por essa ação.</p>
            <label className="block text-xs font-medium" style={{ color: C.text }}>
              Motivo da suspensão
              <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} rows={2}
                className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm text-white outline-none" style={{ borderColor: C.border }} />
            </label>
          </div>
        }
        confirmLabel="Suspender" confirmingLabel="Suspendendo…" busy={busy}
        onConfirm={async () => {
          if (!suspendReason.trim()) { toast.error('Informe o motivo da suspensão.'); return }
          const ok = await runAction(`/api/admin/apps/${draft.id}/suspend`, { reason: suspendReason }, `${draft.name} suspenso.`)
          if (ok) setShowSuspend(false)
        }} />

      <ConfirmDialog open={showReactivate} onOpenChange={setShowReactivate} icon={PlayCircle} variant="neutral" title="Reativar publicação?"
        description={<>As condições de publicação de <strong style={{ color: C.text }}>{draft.name}</strong> serão revalidadas antes de voltar ao ar.</>}
        confirmLabel="Reativar" confirmingLabel="Reativando…" busy={busy}
        onConfirm={async () => { const ok = await runAction(`/api/admin/apps/${draft.id}/reactivate`, undefined, `${draft.name} reativado.`); if (ok) setShowReactivate(false) }} />
    </AdminShell>
  )
}

function Badge({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${color}22`, color }}>{label}</span>
}
function ActionButton({ icon: Icon, label, onClick, primary }: { icon: React.ElementType; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
      style={primary ? { background: C.primary, color: 'white' } : { border: `1px solid ${C.border}`, color: C.text }}>
      <Icon size={13} aria-hidden="true" /> {label}
    </button>
  )
}
function Info2({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: C.textSecondary }}>{label}</p>
      <p className="mt-0.5 font-medium" style={{ color: C.text }}>{value}</p>
    </div>
  )
}
function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon size={20} style={{ color: C.textSecondary }} aria-hidden="true" />
      <p className="text-sm" style={{ color: C.textSecondary }}>{text}</p>
    </div>
  )
}
