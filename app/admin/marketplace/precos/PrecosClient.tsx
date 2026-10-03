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
import { formatCurrencyBRL } from '@/lib/finance'

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
]

const BILLING_LABEL: Record<string, string> = { 'one-time': 'Pagamento único', monthly: 'Mensal', yearly: 'Anual', lifetime: 'Vitalício' }

interface Row {
  id: string
  status: 'pendente' | 'aprovado' | 'rejeitado'
  appName: string
  planName: string
  currentPrice: number | null
  requestedPrice: number
  currentBillingPeriod: string | null
  requestedBillingPeriod: string
  requesterName: string
  reviewNotes: string | null
  createdAt: string
}

interface Props {
  user: SupabaseUser
  profile: { full_name?: string; email?: string } | null
  pending: Row[]
  history: Row[]
  loadError: boolean
}

function priceChangeLabel(row: Row): string {
  const fromPrice = row.currentPrice != null ? formatCurrencyBRL(row.currentPrice) : '—'
  const toPrice = formatCurrencyBRL(row.requestedPrice)
  const fromBilling = row.currentBillingPeriod ? BILLING_LABEL[row.currentBillingPeriod] ?? row.currentBillingPeriod : '—'
  const toBilling = BILLING_LABEL[row.requestedBillingPeriod] ?? row.requestedBillingPeriod
  if (row.currentPrice === row.requestedPrice) {
    return `${fromPrice} (${fromBilling} → ${toBilling})`
  }
  if (row.currentBillingPeriod === row.requestedBillingPeriod) {
    return `${fromPrice} → ${toPrice} (${toBilling})`
  }
  return `${fromPrice} (${fromBilling}) → ${toPrice} (${toBilling})`
}

export default function PrecosClient({ user, profile, pending: initialPending, history, loadError }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(initialPending)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Row | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  async function handleApprove(row: Row) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/price-requests/${row.id}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Falha ao aprovar.')
      }
      setPending(prev => prev.filter(r => r.id !== row.id))
      toast.success(`Preço de "${row.planName}" atualizado.`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível aprovar.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject() {
    if (!rejecting) return
    if (!rejectNotes.trim()) {
      toast.error('Informe o motivo da rejeição.')
      return
    }
    setBusyId(rejecting.id)
    try {
      const res = await fetch(`/api/admin/price-requests/${rejecting.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: rejectNotes.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Falha ao rejeitar.')
      }
      setPending(prev => prev.filter(r => r.id !== rejecting.id))
      toast.success('Pedido rejeitado.')
      setRejecting(null)
      setRejectNotes('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível rejeitar.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Preços
        </p>

        <div className="mb-5">
          <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Preços</h1>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Pedidos de mudança de preço/periodicidade aguardando aprovação.</p>
        </div>

        <nav aria-label="Seções do marketplace" className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => {
            const active = tab.href === '/admin/marketplace/precos'
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
                    <p className="text-sm font-semibold" style={{ color: C.text }}>{row.appName} — {row.planName}</p>
                    <p className="text-xs" style={{ color: C.textSecondary }}>{priceChangeLabel(row)} · pedido por {row.requesterName} em {formatDateTimeBR(row.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => handleApprove(row)}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      style={{ background: '#10B981' }}
                    >
                      {busyId === row.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                      Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => setRejecting(row)}
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                      style={{ borderColor: '#EF4444', color: '#EF4444' }}
                    >
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
                    <th className="pb-2 pr-3 font-semibold">App / Plano</th>
                    <th className="pb-2 pr-3 font-semibold">Mudança</th>
                    <th className="pb-2 pr-3 font-semibold">Status</th>
                    <th className="pb-2 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => (
                    <tr key={row.id} className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2 pr-3" style={{ color: C.text }}>{row.appName} — {row.planName}</td>
                      <td className="py-2 pr-3" style={{ color: C.textSecondary }}>{priceChangeLabel(row)}</td>
                      <td className="py-2 pr-3">
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: row.status === 'aprovado' ? '#10B981' : '#EF4444', background: row.status === 'aprovado' ? '#10B9811A' : '#EF44441A' }}>
                          {row.status === 'aprovado' ? 'Aprovado' : 'Rejeitado'}
                        </span>
                        {row.status === 'rejeitado' && row.reviewNotes && (
                          <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{row.reviewNotes}</p>
                        )}
                      </td>
                      <td className="py-2" style={{ color: C.textSecondary }}>{formatDateTimeBR(row.createdAt)}</td>
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
        icon={X}
        variant="destructive"
        title="Rejeitar pedido de preço?"
        description={
          <div className="space-y-3">
            <p>{rejecting ? `${rejecting.appName} — ${rejecting.planName}: ${priceChangeLabel(rejecting)}` : ''}</p>
            <label className="block text-xs font-medium" style={{ color: C.text }}>
              Motivo (obrigatório)
              <textarea
                value={rejectNotes}
                onChange={e => setRejectNotes(e.target.value)}
                placeholder="Motivo da rejeição"
                className="mt-1 w-full rounded-lg border bg-transparent p-2 text-sm outline-none"
                style={{ borderColor: C.border }}
                rows={3}
              />
            </label>
          </div>
        }
        confirmLabel="Rejeitar"
        confirmingLabel={<><Loader2 size={15} className="animate-spin" />Rejeitando…</>}
        busy={busyId === rejecting?.id}
        onConfirm={handleReject}
      />
    </AdminShell>
  )
}
