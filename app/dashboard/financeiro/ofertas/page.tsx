import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'
import OfertasPromocoesClient, { type PlanOption, type PromotionRow } from './OfertasPromocoesClient'

export const metadata: Metadata = { title: 'Ofertas e promoções | LOBBY', robots: { index: false, follow: false } }

interface SearchParams {
  parceiro?: string
}

interface PlanRpcRow {
  id: string
  app_draft_id: string
  app_name: string
  plan_name: string
  price: number | null
  currency: string | null
  billing_period: string | null
}

interface PromotionRpcRow {
  id: string
  plan_id: string
  promo_price: number
  original_price: number | null
  discount_percentage: number | null
  starts_at: string
  ends_at: string
  is_approved: boolean
  is_active: boolean
  cancelled_at: string | null
  paused_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
}

export default async function FinanceiroOfertasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  // RPCs (Etapa 8): mesmo padrão de permissão delegada que toda outra
  // aba de /dashboard/financeiro/** já usa (p_partner_id + capacidade
  // financeiro_ofertas/role=owner em app_team_members, checado dentro
  // da RPC) — antes, esta página ignorava ?parceiro= e sempre mostrava
  // o próprio usuário logado, mesmo quando um membro de equipe estava
  // "vendo como" outro parceiro.
  const [plansRes, promotionsRes] = await Promise.all([
    supabase.rpc('get_partner_ofertas_plans', { p_partner_id: partnerId }) as unknown as Promise<{ data: PlanRpcRow[] | null; error: unknown }>,
    supabase.rpc('get_partner_ofertas_promotions', { p_partner_id: partnerId }) as unknown as Promise<{ data: PromotionRpcRow[] | null; error: unknown }>,
  ])

  const planOptions: PlanOption[] = (plansRes.data ?? []).map(p => ({
    id: p.id,
    appName: p.app_name ?? 'Aplicativo sem nome',
    planName: p.plan_name,
    price: p.price,
    currency: p.currency ?? 'BRL',
    billingPeriod: p.billing_period,
  }))

  const promotionRows: PromotionRow[] = (promotionsRes.data ?? []).map(p => {
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
      <OfertasPromocoesClient
        plans={planOptions}
        promotions={promotionRows}
        loadError={!!plansRes.error || !!promotionsRes.error}
        partnerId={partnerId}
      />
    </div>
  )
}
