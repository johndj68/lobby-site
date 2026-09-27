'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Banknote, Loader2, Undo2, CheckCircle2, Clock, X } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import AdminShell from '@/components/layout/AdminShell'
import { createClient } from '@/lib/supabase'
import { MARKETPLACE_COLORS as C } from '@/lib/marketplace'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import { PAYOUT_RETENTION_DAYS, type PartnerPayoutStatus } from '@/lib/services/payouts'

export interface EligiblePurchaseRow {
  id:              string
  applicationName: string
  planName:        string
  amount:          number
  partnerAmount:   number
  paidAt:          string
  status:          'retido' | 'elegivel'
}

export interface PartnerGroup {
  partnerId:         string
  partnerName:       string
  retidoTotal:       number
  elegivelTotal:     number
  eligiblePurchases: EligiblePurchaseRow[]
}

export interface PayoutHistoryRow {
  id: string; partner_id: string; total_amount: number; currency: string
  status: PartnerPayoutStatus; reference: string; notes: string | null
  created_at: string; reverted_at: string | null; revert_reason: string | null
  partnerName: string
}

interface Props {
  user:          SupabaseUser
  profile:       { full_name?: string; email?: string; is_leader?: boolean } | null
  partnerGroups: PartnerGroup[]
  history:       PayoutHistoryRow[]
}

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
]

export default function RepassesClient({ user, profile, partnerGroups, history }: Props) {
  const [payingPartner, setPayingPartner] = useState<PartnerGroup | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reference, setReference] = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [reverting, setReverting] = useState<string | null>(null)

  const openPayout = (group: PartnerGroup) => {
    setPayingPartner(group)
    setSelected(new Set(group.eligiblePurchases.map(p => p.id)))
    setReference('')
    setNotes('')
    setError('')
  }
  const closePayout = () => { if (!saving) setPayingPartner(null) }

  const selectedTotal = useMemo(() => {
    if (!payingPartner) return 0
    return payingPartner.eligiblePurchases.filter(p => selected.has(p.id)).reduce((s, p) => s + p.partnerAmount, 0)
  }, [payingPartner, selected])

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleRegisterPayout = async () => {
    if (!payingPartner) return
    if (selected.size === 0) { setError('Selecione ao menos uma venda.'); return }
    if (!reference.trim()) { setError('Informe a referência/comprovante do PIX ou TED.'); return }

    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: err } = await supabase.rpc('create_partner_payout', {
        p_partner_id: payingPartner.partnerId,
        p_app_purchase_ids: [...selected],
        p_reference: reference.trim(),
        p_notes: notes.trim() || null,
      })
      if (err) throw err
      window.location.reload() // reflete elegibilidade/histórico sem duplicar o cálculo de agrupamento aqui
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar o repasse.')
      setSaving(false)
    }
  }

  const handleRevert = async (payout: PayoutHistoryRow) => {
    const reason = window.prompt(`Motivo da reversão do repasse de ${formatCurrencyBRL(payout.total_amount)} pra ${payout.partnerName}:`)
    if (!reason || !reason.trim()) return
    setReverting(payout.id)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('revert_partner_payout', { p_payout_id: payout.id, p_reason: reason.trim() })
    setReverting(null)
    if (err) { window.alert(err.message); return }
    window.location.reload()
  }

  return (
    <AdminShell user={user} profile={profile}>
      <div style={{ background: C.bg, minHeight: '100vh' }} className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>
          <Link href="/admin/marketplace" className="hover:underline">Marketplace</Link> / Repasses
        </p>

        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>
            <Banknote size={24} aria-hidden="true" />
            Repasses
          </h1>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            Repasse manual (PIX/TED fora do sistema) — retenção de {PAYOUT_RETENTION_DAYS} dias após a venda confirmada.
          </p>
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
          {NAV_TABS.map(tab => (
            <Link key={tab.href} href={tab.href} className="shrink-0 px-3 py-2.5 text-sm font-semibold"
              style={tab.href === '/admin/marketplace/repasses' ? { color: C.primary, borderBottom: `2px solid ${C.primary}` } : { color: C.textSecondary }}>
              {tab.label}
            </Link>
          ))}
        </div>

        <section aria-label="Fila de repasse por parceiro" className="mb-8">
          <h2 className="mb-3 text-sm font-bold" style={{ color: C.text }}>Fila por parceiro</h2>
          {partnerGroups.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center text-sm" style={{ borderColor: C.border, color: C.textSecondary }}>
              Nenhuma venda de parceiro paga aguardando repasse ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {partnerGroups.map(g => (
                <div key={g.partnerId} className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.card }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold" style={{ color: C.text }}>{g.partnerName}</p>
                      <p className="text-xs" style={{ color: C.textSecondary }}>
                        {g.retidoTotal > 0 && <><Clock size={11} className="mr-1 inline" aria-hidden="true" />Retido: {formatCurrencyBRL(g.retidoTotal)} (dentro dos {PAYOUT_RETENTION_DAYS} dias)</>}
                        {g.retidoTotal > 0 && g.eligiblePurchases.length > 0 && ' · '}
                        {g.eligiblePurchases.length > 0 && <span style={{ color: C.success }}>Elegível: {formatCurrencyBRL(g.elegivelTotal)} ({g.eligiblePurchases.length} venda{g.eligiblePurchases.length !== 1 ? 's' : ''})</span>}
                      </p>
                    </div>
                    {g.eligiblePurchases.length > 0 && (
                      <button type="button" onClick={() => openPayout(g)}
                        className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white" style={{ background: C.primary }}>
                        <Banknote size={13} aria-hidden="true" />Registrar repasse
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Histórico de repasses">
          <h2 className="mb-3 text-sm font-bold" style={{ color: C.text }}>Histórico</h2>
          {history.length === 0 ? (
            <p className="text-sm" style={{ color: C.textSecondary }}>Nenhum repasse registrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${h.status === 'revertido' ? 'opacity-60' : ''}`} style={{ borderColor: C.border }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: C.text }}>
                      {h.partnerName} · {formatCurrencyBRL(h.total_amount)}
                      {h.status === 'revertido' && <span className="ml-2 text-xs font-bold" style={{ color: C.error }}>Revertido</span>}
                    </p>
                    <p className="text-xs" style={{ color: C.textSecondary }}>
                      Ref: {h.reference} · {formatDateBR(h.created_at.slice(0, 10))}
                      {h.status === 'revertido' && h.revert_reason && ` · Motivo: ${h.revert_reason}`}
                    </p>
                  </div>
                  {h.status === 'confirmado' && (
                    <button type="button" disabled={reverting === h.id} onClick={() => handleRevert(h)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                      style={{ background: C.error + '1A', color: C.error }}>
                      <Undo2 size={11} aria-hidden="true" />Reverter
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal de registro de repasse */}
      {payingPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closePayout} />
          <div className="relative w-full max-w-lg rounded-2xl border p-6" style={{ borderColor: C.border, background: C.card }}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-lg font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Registrar repasse — {payingPartner.partnerName}</p>
              <button type="button" onClick={closePayout} disabled={saving} style={{ color: C.textSecondary }}><X size={18} aria-hidden="true" /></button>
            </div>

            <div className="mb-4 max-h-52 space-y-1.5 overflow-y-auto">
              {payingPartner.eligiblePurchases.map(p => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} disabled={saving} />
                  <span className="flex-1 truncate" style={{ color: C.text }}>{p.applicationName} — {p.planName}</span>
                  <span className="shrink-0 font-bold" style={{ color: C.text }}>{formatCurrencyBRL(p.partnerAmount)}</span>
                </label>
              ))}
            </div>

            <p className="mb-4 text-sm font-bold" style={{ color: C.primary }}>Total selecionado: {formatCurrencyBRL(selectedTotal)}</p>

            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: C.textSecondary }}>Referência/comprovante (PIX, TED...) *</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)} disabled={saving}
                className="h-10 w-full rounded-xl border px-3 text-sm" style={{ borderColor: C.border, background: C.bg, color: C.text }} />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: C.textSecondary }}>Observações (opcional)</label>
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={saving}
                className="w-full resize-none rounded-xl border px-3 py-2 text-sm" style={{ borderColor: C.border, background: C.bg, color: C.text }} />
            </div>

            {error && <p role="alert" className="mb-3 rounded-xl px-3 py-2 text-xs font-medium" style={{ background: C.error + '1A', color: C.error }}>{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={closePayout} disabled={saving}
                className="flex-1 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-50" style={{ borderColor: C.border, color: C.textSecondary }}>
                Cancelar
              </button>
              <button type="button" onClick={handleRegisterPayout} disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: C.primary }}>
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                {saving ? 'Registrando...' : 'Confirmar repasse'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
