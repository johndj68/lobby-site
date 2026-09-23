'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Copy, ExternalLink, Ban, PlayCircle, Info,
  Users2, FileText, History as HistoryIcon, Mail, Package,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MARKETPLACE_COLORS as C, formatDateTimeBR, type PublicationStatus, type ReviewStatus } from '@/lib/marketplace'
import type { RegistrationStatus, TermsStatus } from '@/lib/partners'

interface Partner {
  id: string; name: string; email: string | null; companyName: string | null; createdAt: string
  registration: RegistrationStatus; terms: TermsStatus; blocked: boolean; blockedAt: string | null; blockedReason: string | null
}
interface AppItem { id: string; name: string; shortDescription: string | null; logoUrl: string | null; category: string; updatedAt: string; publication: PublicationStatus; review: ReviewStatus }
interface Acceptance { id: string; app_draft_id: string; accepted_partner_terms: boolean; accepted_commercial_terms: boolean; partner_terms_version: string | null; commercial_terms_version: string | null; accepted_at: string; userName: string }
interface TeamGroup { appDraftId: string; appName: string; members: { id: string; user_id: string; role: string; scope: string; joined_at: string; name: string }[]; invitations: { id: string; invited_email: string; invited_name: string | null; scope: string; status: string; sent_at: string; expires_at: string }[] }
interface EventItem { id: string; app_draft_id: string | null; action: string; reason: string | null; previous_status: string | null; new_status: string | null; actorName: string; created_at: string }

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string; is_leader?: boolean } | null
  partner: Partner
  apps: AppItem[]
  appsInAnalysis: number
  acceptances: Acceptance[]
  teamByApp: TeamGroup[]
  events: EventItem[]
}

const TABS = ['Resumo', 'Equipe', 'Comercial', 'Histórico'] as const
type Tab = typeof TABS[number]

const ACTION_LABEL: Record<string, string> = {
  publish: 'App publicado', suspend: 'App suspenso', reactivate: 'App reativado',
  block_new_apps: 'Novos cadastros bloqueados', unblock_new_apps: 'Novos cadastros desbloqueados',
}
const INVITE_STATUS_LABEL: Record<string, string> = { pending: 'Convite pendente', accepted: 'Aceito', rejected: 'Rejeitado', expired: 'Expirado', cancelled: 'Revogado' }
const INVITE_STATUS_COLOR: Record<string, string> = { pending: C.warning, accepted: C.success, rejected: C.error, expired: C.textSecondary, cancelled: C.textSecondary }

export default function PartnerDetailClient({ user, profile, partner, apps, appsInAnalysis, acceptances, teamByApp, events }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Resumo')
  const [busy, setBusy] = useState(false)
  const [showBlock, setShowBlock] = useState(false)
  const [showUnblock, setShowUnblock] = useState(false)
  const [reason, setReason] = useState('')

  async function runAction(url: string, body: Record<string, unknown>, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Não foi possível concluir a ação.'); return false }
      toast.success(successMsg)
      router.refresh()
      return true
    } catch { toast.error('Falha de conexão. Tente novamente.'); return false } finally { setBusy(false) }
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/admin/marketplace/parceiros" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar aos parceiros
        </Link>

        <div className="mb-6 rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ background: C.primary }}>
                {partner.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>{partner.name}</h1>
                <button onClick={() => { navigator.clipboard.writeText(partner.id); toast.success('ID copiado.') }} className="mt-0.5 inline-flex items-center gap-1 text-xs" style={{ color: C.textSecondary }}>
                  ID: {partner.id.slice(0, 8)}… <Copy size={11} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={partner.registration.color} label={partner.registration.label} />
              <Badge color={partner.terms.color} label={partner.terms.label} />
              {partner.blocked && <Badge color={C.error} label="Novos cadastros bloqueados" />}
              {!partner.blocked ? (
                <ActionButton icon={Ban} label="Bloquear novos cadastros" onClick={() => { setReason(''); setShowBlock(true) }} />
              ) : (
                <ActionButton icon={PlayCircle} label="Desbloquear" onClick={() => { setReason(''); setShowUnblock(true) }} primary />
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-xs sm:grid-cols-4" style={{ borderColor: C.border }}>
            <Info2 label="Apps publicados" value={String(apps.filter(a => a.publication.key === 'publicado').length)} />
            <Info2 label="Solicitações em análise" value={String(appsInAnalysis)} />
            <Info2 label="Cadastrado em" value={formatDateTimeBR(partner.createdAt)} />
            <Info2 label="E-mail" value={partner.email || '—'} />
          </div>
          {partner.blocked && partner.blockedReason && (
            <p className="mt-3 rounded-lg border p-2.5 text-xs" style={{ borderColor: C.error, color: C.text, background: 'rgba(239,68,68,0.08)' }}>
              Motivo do bloqueio: {partner.blockedReason}
            </p>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-3 py-2.5 text-sm font-medium"
              style={{ color: tab === t ? C.primary : C.textSecondary, borderBottom: tab === t ? `2px solid ${C.primary}` : '2px solid transparent' }}>{t}</button>
          ))}
        </div>

        <div className="rounded-2xl border p-5" style={{ background: C.card, borderColor: C.border }}>
          {tab === 'Resumo' && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>Dados do parceiro</h3>
                <div className="grid gap-3 text-sm sm:grid-cols-2" style={{ color: C.text }}>
                  <Info2 label="Nome público" value={partner.name} />
                  <Info2 label="Identificador" value={partner.id} />
                  <Info2 label="E-mail de contato" value={partner.email || '—'} />
                  <Info2 label="Responsável" value={partner.name} />
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-[11px]" style={{ color: C.textSecondary }}>
                  <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                  O parceiro é hoje o próprio usuário — o projeto não tem cadastro de organização (país, site, canal de suporte dedicado) separado da conta pessoal.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>Situação comercial</h3>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div><p style={{ color: C.textSecondary }}>Termos</p><Badge color={partner.terms.color} label={partner.terms.label} /></div>
                  <div><p style={{ color: C.textSecondary }}>Recebimento</p><Badge color={C.textSecondary} label="Sem integração configurada" /></div>
                  <div>
                    <p style={{ color: C.textSecondary }}>Financeiro</p>
                    <span title="Não há vendas do marketplace vinculadas a parceiros no financeiro ainda" className="text-xs font-semibold opacity-40" style={{ color: C.textSecondary }}>Consultar financeiro</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>Aplicativos vinculados</h3>
                  <Link href={`/admin/marketplace/aplicativos?parceiro=${partner.id}`} className="text-xs font-semibold" style={{ color: C.primary }}>Ver todos →</Link>
                </div>
                {apps.length === 0 ? (
                  <EmptyState icon={Package} text="Nenhum aplicativo vinculado ainda." />
                ) : (
                  <ul className="space-y-2">
                    {apps.map(a => (
                      <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: C.border }}>
                        <div className="flex min-w-0 items-center gap-2.5">
                          {a.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: C.header }}><Package size={14} style={{ color: C.textSecondary }} aria-hidden="true" /></div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium" style={{ color: C.text }}>{a.name}</p>
                            <div className="mt-0.5 flex gap-1.5"><Badge color={a.publication.color} label={a.publication.label} /><Badge color={a.review.color} label={a.review.label} /></div>
                          </div>
                        </div>
                        <Link href={`/admin/marketplace/aplicativos/${a.id}`} className="shrink-0 text-xs font-semibold" style={{ color: C.primary }}>Gerenciar →</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>Ações administrativas</h3>
                <div className="flex flex-wrap gap-2">
                  <span title="Edição administrativa de cadastro ainda não implementada — o parceiro edita os próprios dados pela conta dele." className="rounded-xl border px-3 py-1.5 text-xs font-semibold opacity-40" style={{ borderColor: C.border, color: C.textSecondary }}>Editar cadastro</span>
                  <button onClick={() => setTab('Equipe')} className="rounded-xl border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>Gerenciar equipe</button>
                  <span title="Arquivamento de parceiro ainda não suportado neste projeto." className="rounded-xl border px-3 py-1.5 text-xs font-semibold opacity-40" style={{ borderColor: C.border, color: C.textSecondary }}>Arquivar</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'Equipe' && (
            teamByApp.length === 0 ? (
              <EmptyState icon={Users2} text="Nenhuma equipe cadastrada nos aplicativos deste parceiro." />
            ) : (
              <div className="space-y-5">
                <p className="flex items-start gap-1.5 text-[11px]" style={{ color: C.textSecondary }}>
                  <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                  Equipe é por aplicativo (não existe organização unificada no projeto). Convidar/remover continua no editor do próprio parceiro — aqui é só consulta.
                </p>
                {teamByApp.map(g => (
                  <div key={g.appDraftId}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>{g.appName}</p>
                    <ul className="space-y-2">
                      {g.members.map(m => (
                        <li key={m.id} className="flex items-center justify-between rounded-xl border p-3 text-sm" style={{ borderColor: C.border }}>
                          <div><p style={{ color: C.text }}>{m.name}</p><p className="text-xs" style={{ color: C.textSecondary }}>{m.role === 'owner' ? 'Proprietário' : 'Membro'} · {m.scope === 'organization' ? 'Toda a organização' : 'Este aplicativo'}</p></div>
                          <p className="text-xs" style={{ color: C.textSecondary }}>desde {formatDateTimeBR(m.joined_at)}</p>
                        </li>
                      ))}
                      {g.invitations.map(i => (
                        <li key={i.id} className="flex items-center justify-between rounded-xl border p-3 text-sm" style={{ borderColor: C.border }}>
                          <div className="flex items-center gap-2"><Mail size={13} style={{ color: C.textSecondary }} aria-hidden="true" /><div><p style={{ color: C.text }}>{i.invited_name || i.invited_email}</p><p className="text-xs" style={{ color: C.textSecondary }}>{i.scope === 'organization' ? 'Toda a organização' : 'Este aplicativo'}</p></div></div>
                          <Badge color={INVITE_STATUS_COLOR[i.status] ?? C.textSecondary} label={INVITE_STATUS_LABEL[i.status] ?? i.status} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'Comercial' && (
            <div className="space-y-5">
              <div className="flex items-start gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: C.border, color: C.textSecondary }}>
                <Info size={13} className="mt-0.5 shrink-0" style={{ color: C.primary }} aria-hidden="true" />
                Sem regra de comissão nem integração de recebimento configuradas para vendas do marketplace neste projeto — nenhum valor é mostrado aqui pra não inventar dado.
              </div>
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.textSecondary }}>Aceites de termos</h3>
                {acceptances.length === 0 ? (
                  <EmptyState icon={FileText} text="Nenhum aceite de termos registrado ainda." />
                ) : (
                  <ul className="space-y-2">
                    {acceptances.map(a => (
                      <li key={a.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: C.border }}>
                        <p style={{ color: C.text }}>Termos de parceiro {a.partner_terms_version || '—'} · Termos comerciais {a.commercial_terms_version || '—'}</p>
                        <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>Aceito por {a.userName} em {formatDateTimeBR(a.accepted_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
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
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(e.created_at)}</p>
                      {e.app_draft_id && <Link href={`/admin/marketplace/aplicativos/${e.app_draft_id}`} className="text-xs font-semibold" style={{ color: C.primary }}>Ver app <ExternalLink size={10} className="inline" aria-hidden="true" /></Link>}
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>

      <ConfirmDialog open={showBlock} onOpenChange={setShowBlock} icon={Ban} variant="destructive" title="Bloquear novos cadastros?"
        description={
          <div className="space-y-3">
            <p><strong style={{ color: C.text }}>{partner.name}</strong> não poderá criar novos aplicativos. Os aplicativos existentes, suas vendas e os acessos da equipe permanecem sujeitos às regras atuais — nada é suspenso automaticamente.</p>
            <label className="block text-xs font-medium" style={{ color: C.text }}>Motivo
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm text-white outline-none" style={{ borderColor: C.border }} />
            </label>
          </div>
        }
        confirmLabel="Bloquear" confirmingLabel="Bloqueando…" busy={busy}
        onConfirm={async () => { if (!reason.trim()) { toast.error('Informe o motivo.'); return }; const ok = await runAction(`/api/admin/partners/${partner.id}/block`, { reason }, `${partner.name} bloqueado para novos cadastros.`); if (ok) setShowBlock(false) }} />

      <ConfirmDialog open={showUnblock} onOpenChange={setShowUnblock} icon={PlayCircle} variant="neutral" title="Desbloquear novos cadastros?"
        description={
          <div className="space-y-3">
            <p><strong style={{ color: C.text }}>{partner.name}</strong> volta a poder criar novos aplicativos.</p>
            <label className="block text-xs font-medium" style={{ color: C.text }}>Motivo
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm text-white outline-none" style={{ borderColor: C.border }} />
            </label>
          </div>
        }
        confirmLabel="Desbloquear" confirmingLabel="Desbloqueando…" busy={busy}
        onConfirm={async () => { if (!reason.trim()) { toast.error('Informe o motivo.'); return }; const ok = await runAction(`/api/admin/partners/${partner.id}/unblock`, { reason }, `${partner.name} desbloqueado.`); if (ok) setShowUnblock(false) }} />
    </AdminShell>
  )
}

function Badge({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}22`, color }}>{label}</span>
}
function ActionButton({ icon: Icon, label, onClick, primary }: { icon: React.ElementType; label: string; onClick: () => void; primary?: boolean }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold" style={primary ? { background: C.primary, color: 'white' } : { border: `1px solid ${C.border}`, color: C.text }}><Icon size={13} aria-hidden="true" /> {label}</button>
}
function Info2({ label, value }: { label: string; value: string }) {
  return <div><p style={{ color: C.textSecondary }}>{label}</p><p className="mt-0.5 font-medium" style={{ color: C.text }}>{value}</p></div>
}
function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <div className="flex flex-col items-center gap-2 py-10 text-center"><Icon size={20} style={{ color: C.textSecondary }} aria-hidden="true" /><p className="text-sm" style={{ color: C.textSecondary }}>{text}</p></div>
}
