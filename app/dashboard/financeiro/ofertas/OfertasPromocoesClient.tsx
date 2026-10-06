'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import IndicadoresOfertas, { type IndicadorCounts } from './IndicadoresOfertas'
import PromocoesTable from './PromocoesTable'
import PromocaoFormSheet, { type PrefillValues } from './PromocaoFormSheet'
import PromocaoDetailSheet from './PromocaoDetailSheet'
import { resolveRowStatus, indicatorBucket } from './promotion-status'
import type { PlanOption, PromotionRow } from './types'

interface PlanRpcRow {
  id: string; app_draft_id: string; application_id: string | null; category_id: string | null
  app_name: string; plan_name: string; price: number | null; currency: string | null
  billing_period: PlanOption['billingPeriod']; plan_status: string
}
interface PromotionRpcRow {
  id: string; plan_id: string; name: string | null; promo_price: number; original_price: number | null
  discount_percentage: number | null; discount_duration_type: PromotionRow['discountDurationType']
  discount_cycles: number | null; starts_at: string; ends_at: string; is_approved: boolean
  is_active: boolean; cancelled_at: string | null; paused_at: string | null
  rejected_at: string | null; rejection_reason: string | null
  previous_version_id: string | null; superseded_at: string | null
  plan_current_price: number | null; plan_status: string
  created_at: string; updated_at: string
}

interface Props { partnerId: string | null }

export default function OfertasPromocoesClient({ partnerId }: Props) {
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [promotions, setPromotions] = useState<PromotionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [activeBucket, setActiveBucket] = useState<keyof IndicadorCounts | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [prefill, setPrefill] = useState<PrefillValues | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PromotionRow | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [plansRes, promosRes] = await Promise.all([
      supabase.rpc('get_partner_ofertas_plans', { p_partner_id: partnerId }),
      supabase.rpc('get_partner_ofertas_promotions', { p_partner_id: partnerId }),
    ]) as unknown as [{ data: PlanRpcRow[] | null; error: unknown }, { data: PromotionRpcRow[] | null; error: unknown }]

    if (plansRes.error || promosRes.error) {
      setError(true); setLoading(false); setHasLoaded(true)
      return
    }
    setError(false)

    const planOptions: PlanOption[] = (plansRes.data ?? []).map(p => ({
      id: p.id, appDraftId: p.app_draft_id, applicationId: p.application_id, categoryId: p.category_id,
      appName: p.app_name ?? 'Aplicativo sem nome', planName: p.plan_name, price: p.price,
      currency: p.currency ?? 'BRL', billingPeriod: p.billing_period, planStatus: p.plan_status,
    }))
    const planById = new Map(planOptions.map(p => [p.id, p]))

    const rows: PromotionRow[] = (promosRes.data ?? []).map(p => {
      const plan = planById.get(p.plan_id)
      return {
        id: p.id, planId: p.plan_id, name: p.name,
        appName: plan?.appName ?? '—', planName: plan?.planName ?? '—',
        currency: plan?.currency ?? 'BRL', billingPeriod: plan?.billingPeriod ?? null,
        promoPrice: p.promo_price, originalPrice: p.original_price, discountPercentage: p.discount_percentage,
        discountDurationType: p.discount_duration_type, discountCycles: p.discount_cycles,
        startsAt: p.starts_at, endsAt: p.ends_at, isApproved: p.is_approved, isActive: p.is_active,
        cancelledAt: p.cancelled_at, pausedAt: p.paused_at, rejectedAt: p.rejected_at, rejectionReason: p.rejection_reason,
        previousVersionId: p.previous_version_id, supersededAt: p.superseded_at,
        planCurrentPrice: p.plan_current_price, planStatus: p.plan_status,
        createdAt: p.created_at, updatedAt: p.updated_at,
      }
    })

    setPlans(planOptions)
    setPromotions(rows)
    setLastUpdated(new Date())
    setLoading(false)
    setHasLoaded(true)
  }, [partnerId])

  useEffect(() => { load() }, [load])

  const counts: IndicadorCounts = useMemo(() => {
    const c: IndicadorCounts = { em_analise: 0, agendadas: 0, ativas: 0, encerradas: 0 }
    for (const row of promotions) {
      const bucket = indicatorBucket(resolveRowStatus(row).key)
      if (bucket) c[bucket]++
    }
    return c
  }, [promotions])

  const openCreate = () => { setPrefill(null); setFormOpen(true) }
  const openDuplicate = useCallback((row: PromotionRow) => {
    setPrefill({
      planId: row.planId,
      name: row.name ? `${row.name} (cópia)` : undefined,
      discountPercent: row.discountPercentage ?? undefined,
      promoPrice: row.discountPercentage == null ? row.promoPrice : undefined,
      discountDurationType: row.discountDurationType ?? undefined,
      discountCycles: row.discountCycles ?? undefined,
      rejectionContext: row.rejectedAt ? (row.rejectionReason ?? undefined) : undefined,
    })
    setFormOpen(true)
  }, [])
  const openDuplicateById = useCallback((id: string) => {
    const row = promotions.find(r => r.id === id)
    if (row) { setDetailId(null); openDuplicate(row) }
  }, [promotions, openDuplicate])

  // Editar uma promoção APROVADA/vigente — nunca faz UPDATE nela, abre o
  // formulário em modo "nova versão" (previous_version_id na submissão).
  // A antiga continua valendo até a nova ser aprovada.
  const openEdit = useCallback((row: PromotionRow) => {
    setPrefill({
      planId: row.planId,
      name: row.name ?? undefined,
      discountPercent: row.discountPercentage ?? undefined,
      promoPrice: row.discountPercentage == null ? row.promoPrice : undefined,
      discountDurationType: row.discountDurationType ?? undefined,
      discountCycles: row.discountCycles ?? undefined,
      editsPromotionId: row.id,
    })
    setFormOpen(true)
  }, [])
  const openEditById = useCallback((id: string) => {
    const row = promotions.find(r => r.id === id)
    if (row) { setDetailId(null); openEdit(row) }
  }, [promotions, openEdit])

  const requestCancel = useCallback((row: PromotionRow) => setCancelTarget(row), [])
  const requestCancelById = useCallback((id: string) => {
    const row = promotions.find(r => r.id === id)
    if (row) { setDetailId(null); setCancelTarget(row) }
  }, [promotions])

  async function confirmCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/apps/plans/${cancelTarget.planId}/promotions/${cancelTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', partnerId: partnerId ?? undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Não foi possível cancelar.')
      toast.success('Promoção cancelada.')
      setCancelTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível cancelar.')
    } finally {
      setCancelling(false)
    }
  }

  const toggleBucket = (b: keyof IndicadorCounts) => setActiveBucket(prev => prev === b ? null : b)

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: colors.text }}>Ofertas e promoções</h2>
          <p className="mt-0.5 text-sm" style={{ color: colors.textSecondary }}>
            Gerencie descontos dos seus aplicativos e acompanhe a análise de cada solicitação.
          </p>
          {lastUpdated && (
            <p className="mt-1 text-xs" style={{ color: colors.textMuted }}>
              Última atualização: {lastUpdated.toLocaleDateString('pt-BR')} {lastUpdated.toTimeString().slice(0, 5)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => load()} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ borderColor: colors.border, color: colors.text, background: colors.card }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />Atualizar
          </button>
          <button type="button" onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: colors.primary }}>
            <Plus size={14} aria-hidden="true" />Criar promoção
          </button>
        </div>
      </div>

      <div className="mb-5 flex items-start gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: colors.border, background: colors.backgroundAlt, color: colors.textSecondary }}>
        As promoções precisam de aprovação da LOBBY antes de aparecer para os compradores. Criar ou salvar um pedido não muda o preço público.
      </div>

      <IndicadoresOfertas counts={counts} activeBucket={activeBucket} onToggle={toggleBucket} />

      <PromocoesTable
        rows={promotions}
        plans={plans}
        loading={loading && !hasLoaded}
        error={error}
        activeBucket={activeBucket}
        onRetry={load}
        onViewDetail={setDetailId}
        onDuplicate={openDuplicate}
        onEdit={openEdit}
        onCancel={requestCancel}
        onCreateFirst={openCreate}
      />

      <PromocaoFormSheet
        open={formOpen}
        plans={plans}
        partnerId={partnerId}
        prefill={prefill}
        onClose={() => setFormOpen(false)}
        onCreated={() => { setFormOpen(false); load() }}
      />

      <PromocaoDetailSheet
        promotionId={detailId}
        partnerId={partnerId}
        onClose={() => setDetailId(null)}
        onDuplicate={openDuplicateById}
        onEdit={openEditById}
        onCancel={requestCancelById}
      />

      <Dialog open={!!cancelTarget} onOpenChange={o => { if (!o && !cancelling) setCancelTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar {cancelTarget && !cancelTarget.isApproved ? 'pedido' : 'promoção agendada'}?</DialogTitle>
            <DialogDescription>
              {cancelTarget && !cancelTarget.isApproved
                ? 'O pedido deixa de aguardar análise. Isso não pode ser desfeito — se mudar de ideia, será preciso criar um novo pedido.'
                : 'A promoção não vai mais começar na data prevista. O histórico desta solicitação continua acessível.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setCancelTarget(null)} disabled={cancelling} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.border, color: colors.text }}>Voltar</button>
            <button type="button" onClick={confirmCancel} disabled={cancelling} className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ background: '#EF4444' }}>
              {cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
