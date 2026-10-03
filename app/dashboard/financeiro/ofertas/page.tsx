import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'
import OfertasPromocoesClient, { type PlanOption, type PromotionRow } from './OfertasPromocoesClient'

export const metadata: Metadata = { title: 'Ofertas e promoções | LOBBY', robots: { index: false, follow: false } }

export default async function FinanceiroOfertasPage() {
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  // Todos os planos de todos os apps deste dono — mesma checagem de
  // posse (app_drafts.created_by) já usada em toda rota de edição de
  // plano, sem precisar de RPC.
  const { data: drafts } = await supabase.from('app_drafts').select('id, name').eq('created_by', user.id)
  const draftIds = (drafts ?? []).map(d => d.id)
  const draftNameById = new Map((drafts ?? []).map(d => [d.id, d.name]))

  const { data: plans } = draftIds.length
    ? await supabase.from('app_plans').select('id, app_draft_id, name, price, currency, billing_period').in('app_draft_id', draftIds)
    : { data: [] }

  const planOptions: PlanOption[] = (plans ?? []).map(p => ({
    id: p.id,
    appName: draftNameById.get(p.app_draft_id) ?? 'Aplicativo sem nome',
    planName: p.name,
    price: p.price,
    currency: p.currency ?? 'BRL',
    billingPeriod: p.billing_period,
  }))

  const planIds = planOptions.map(p => p.id)
  const { data: promotions, error: loadError } = planIds.length
    ? await supabase
        .from('promotions')
        .select('id, plan_id, promo_price, original_price, discount_percentage, starts_at, ends_at, is_approved, is_active, cancelled_at, paused_at, rejected_at, rejection_reason')
        .in('plan_id', planIds)
        .order('created_at', { ascending: false })
    : { data: [] as never[], error: null }

  const promotionRows: PromotionRow[] = (promotions ?? []).map(p => {
    const plan = planOptions.find(opt => opt.id === p.plan_id)
    return {
      id: p.id,
      planId: p.plan_id,
      appName: plan?.appName ?? '—',
      planName: plan?.planName ?? '—',
      currency: plan?.currency ?? 'BRL',
      billingPeriod: plan?.billingPeriod ?? null,
      promoPrice: p.promo_price,
      originalPrice: p.original_price,
      discountPercentage: p.discount_percentage,
      startsAt: p.starts_at,
      endsAt: p.ends_at,
      isApproved: p.is_approved,
      isActive: p.is_active,
      cancelledAt: p.cancelled_at,
      pausedAt: p.paused_at,
      rejectedAt: p.rejected_at,
      rejectionReason: p.rejection_reason,
    }
  })

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Ofertas e promoções</h2>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>
        Peça um desconto por tempo limitado pra um dos seus planos — fica invisível pra compradores até o admin aprovar.
      </p>
      <OfertasPromocoesClient plans={planOptions} promotions={promotionRows} loadError={!!loadError} />
    </div>
  )
}
