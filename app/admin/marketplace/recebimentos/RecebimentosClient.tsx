'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X, Loader2, AlertTriangle } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { MARKETPLACE_COLORS as C, formatDateTimeBR } from '@/lib/marketplace'

const NAV_TABS = [
  { label: 'Visão geral', href: '/admin/marketplace', enabled: true },
  { label: 'Aplicativos', href: '/admin/marketplace/aplicativos', enabled: true },
  { label: 'Solicitações', href: '/admin/marketplace/solicitacoes', enabled: true },
  { label: 'Ofertas', href: '/admin/marketplace/ofertas', enabled: true },
  { label: 'Destaques', href: '/admin/marketplace/destaques', enabled: true },
  { label: 'Categorias', href: '/admin/marketplace/categorias', enabled: true },
  { label: 'Parceiros', href: '/admin/marketplace/parceiros', enabled: true },
  { label: 'Comissões', href: '/admin/marketplace/comissoes', enabled: true },
  { label: 'Repasses', href: '/admin/marketplace/repasses', enabled: true },
  { label: 'Preços', href: '/admin/marketplace/precos', enabled: true },
  { label: 'Promoções', href: '/admin/marketplace/promocoes', enabled: true },
  { label: 'Recebimentos', href: '/admin/marketplace/recebimentos', enabled: true },
]

const PIX_TYPE_LABEL: Record<string, string> = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Aleatória' }
const PESSOA_LABEL: Record<string, string> = { pf: 'Pessoa física', pj: 'Pessoa jurídica' }
const CONTA_TYPE_LABEL: Record<string, string> = { corrente: 'Conta corrente', poupanca: 'Conta poupança' }

interface Row {
  id: string
  partnerId: string
  partnerName: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  payoutMethod: 'pix' | 'bank_transfer'
  accountHolder: string | null
  personType: string | null
  document: string | null
  pixKeyType: string | null
  pixKey: string | null
  bankName: string | null
  bankAgency: string | null
  bankAccount: string | null
  bankAccountDigit: string | null
  bankAccountType: string | null
  notes: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  createdAt: string
}

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string } | null
  pending: Row[]
  history: Row[]
  loadError: boolean
}

const STATUS_LABEL: Record<Row['status'], string> = {
  pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado', cancelled: 'Cancelado pelo parceiro',
}
const STATUS_COLOR: Record<Row['status'], string> = {
  pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444', cancelled: '#64748B',
}

function destinationSummary(row: Row): string {
  if (row.payoutMethod === 'pix') {
    const type = row.pixKeyType ? PIX_TYPE_LABEL[row.pixKeyType] ?? row.pixKeyType : 'Pix'
    return `Pix (${type}): ${row.pixKey ?? '—'}`
  }
  const digit = row.bankAccountDigit ? `-${row.bankAccountDigit}` : ''
  return `TED: ${row.bankName ?? '—'} ag. ${row.bankAgency ?? '—'} cc ${row.bankAccount ?? '—'}${digit}`
}

export default function RecebimentosClient({ user, profile, pending, history, loadError }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Row | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  async function handleApprove(row: Row) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/payout-destinations/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Não foi possível aprovar.')
      toast.success('Destino de recebimento aprovado e aplicado.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível aprovar.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject() {
    if (!rejecting) return
    const reason = rejectNotes.trim()
    if (!reason) return
    setBusyId(rejecting.id)
    try {
      const res = await fetch(`/api/admin/payout-destinations/${rejecting.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Não foi possível rejeitar.')
      toast.success('Solicitação rejeitada.')
      setRejecting(null); setRejectNotes('')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível rejeitar.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Recebimentos
        </p>

        <div className="mb-5">
          <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Recebimentos</h1>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Pedidos de alteração de destino de repasse (Pix/TED) aguardando aprovação.</p>
        </div>

        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => {
            const active = tab.href === '/admin/marketplace/recebimentos'
            if (!tab.enabled) return <span key={tab.href} title="Esta área ainda não foi implementada." aria-disabled="true" className="cursor-not-allowed px-3 py-2.5 text-sm font-medium opacity-40" style={{ color: C.textSecondary }}>{tab.label}</span>
            return <Link key={tab.href} href={tab.href} className="px-3 py-2.5 text-sm font-medium" style={{ color: active ? C.primary : C.textSecondary, borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent' }}>{tab.label}</Link>
          })}
        </nav>

        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.error, background: 'rgba(239,68,68,0.08)', color: C.text }}>
            <AlertTriangle size={16} style={{ color: C.error }} aria-hidden="true" />
            Não foi possível carregar os pedidos agora. Recarregue a página para tentar de novo.
          </div>
        )}

        <div className="space-y-6">
          <div className="rounded-2xl border p-5" style={{ borderColor: C.border, background: C.card }}>
            <h2 className="mb-3 text-base font-bold" style={{ color: C.text }}>Pendentes ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Nenhum pedido pendente.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {pending.map(row => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: C.border }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: C.text }}>{row.partnerName}</p>
                      <p className="text-xs" style={{ color: C.textSecondary }}>
                        {row.accountHolder} ({row.personType ? PESSOA_LABEL[row.personType] ?? row.personType : '—'}) · doc. {row.document ?? '—'}
                      </p>
                      <p className="text-xs" style={{ color: C.textSecondary }}>
                        {destinationSummary(row)}
                        {row.payoutMethod === 'bank_transfer' && row.bankAccountType && <> · {CONTA_TYPE_LABEL[row.bankAccountType] ?? row.bankAccountType}</>}
                      </p>
                      <p className="text-xs" style={{ color: C.textSecondary }}>
                        pedido em {formatDateTimeBR(row.createdAt)}{row.notes && <> · obs.: {row.notes}</>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" disabled={busyId === row.id} onClick={() => handleApprove(row)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: '#10B981' }}>
                        {busyId === row.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                        Aprovar
                      </button>
                      <button type="button" disabled={busyId === row.id} onClick={() => setRejecting(row)}
                        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50" style={{ borderColor: '#EF4444', color: '#EF4444' }}>
                        <X size={12} aria-hidden="true" />
                        Rejeitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-5" style={{ borderColor: C.border, background: C.card }}>
            <h2 className="mb-3 text-base font-bold" style={{ color: C.text }}>Histórico</h2>
            {history.length === 0 ? (
              <p className="text-sm" style={{ color: C.textSecondary }}>Nenhum pedido resolvido ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr style={{ color: C.textSecondary }}>
                      <th className="pb-2 pr-3 font-semibold">Parceiro</th>
                      <th className="pb-2 pr-3 font-semibold">Destino proposto</th>
                      <th className="pb-2 pr-3 font-semibold">Status</th>
                      <th className="pb-2 font-semibold">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(row => (
                      <tr key={row.id} className="border-t" style={{ borderColor: C.border }}>
                        <td className="py-2 pr-3" style={{ color: C.text }}>{row.partnerName}</td>
                        <td className="py-2 pr-3" style={{ color: C.textSecondary }}>{destinationSummary(row)}</td>
                        <td className="py-2 pr-3">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: STATUS_COLOR[row.status], background: `${STATUS_COLOR[row.status]}1A` }}>
                            {STATUS_LABEL[row.status]}
                          </span>
                          {row.status === 'rejected' && row.rejectionReason && (
                            <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{row.rejectionReason}</p>
                          )}
                        </td>
                        <td className="py-2" style={{ color: C.textSecondary }}>{formatDateTimeBR(row.reviewedAt ?? row.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={next => { if (!next) { setRejecting(null); setRejectNotes('') } }}
        title="Rejeitar alteração de destino?"
        description={rejecting ? <>
          {rejecting.partnerName}: {destinationSummary(rejecting)}
          <textarea
            value={rejectNotes}
            onChange={e => setRejectNotes(e.target.value)}
            placeholder="Motivo da rejeição (obrigatório)"
            className="mt-3 w-full rounded-lg border bg-transparent p-2 text-sm outline-none"
            style={{ borderColor: C.border }}
            rows={3}
          />
        </> : ''}
        confirmLabel="Rejeitar"
        confirmingLabel="Rejeitando…"
        icon={X}
        busy={busyId === rejecting?.id}
        onConfirm={handleReject}
      />
    </AdminShell>
  )
}
