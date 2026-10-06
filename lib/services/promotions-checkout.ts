/**
 * Resolução de promoção ativa no CHECKOUT — fonte de verdade de "esse
 * desconto vale agora" é sempre o servidor, nunca o preço que o client
 * mandou (mesmo princípio de app/api/apps/[appId]/checkout/route.ts e
 * app/api/subscriptions/checkout/route.ts, que nunca confiam em
 * amount/price vindos do body).
 *
 * promo_price/original_price já são snapshot do preço no momento da
 * solicitação (reforçado por RLS, 20261003120000) — nunca recalculados
 * aqui a partir do preço atual do plano. Salvaguarda: se o preço atual do
 * plano mudou e tornou promo_price >= preço atual, a promoção deixa de
 * ser aplicável nesse checkout (sem erro pro comprador — só não desconta).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

export interface ActivePromotion {
  id: string
  promo_price: number
  original_price: number
  discount_duration_type: 'primeira_cobranca' | 'ciclos_fixos' | null
  discount_cycles: number | null
  stripe_coupon_id: string | null
}

/** Mesma janela de vigência de getPromotionStatus() (lib/services/offers.ts)
 *  — início inclusivo, término exclusivo, cancelamento/pausa bloqueiam. */
export async function resolveActivePromotion(
  admin: SupabaseClient,
  planId: string,
  currentPlanPrice: number,
): Promise<ActivePromotion | null> {
  const { data } = await admin
    .from('promotions')
    .select('id, promo_price, original_price, discount_duration_type, discount_cycles, stripe_coupon_id')
    .eq('plan_id', planId)
    .eq('is_approved', true)
    .eq('is_active', true)
    .is('cancelled_at', null)
    .is('paused_at', null)
    .lte('starts_at', new Date().toISOString())
    .gt('ends_at', new Date().toISOString())
    .maybeSingle()

  if (!data) return null
  if (data.promo_price >= currentPlanPrice) {
    console.warn('[promotions-checkout] promotion no longer beats current plan price — skipping discount', { planId, promotionId: data.id })
    return null
  }
  return data as ActivePromotion
}

/** Cria (ou reusa, via cache em promotions.stripe_coupon_id) o Stripe Coupon
 *  que aplica o desconto de assinatura. amount_off é sempre calculado a
 *  partir do preço ATUAL do plano (currentPlanPrice), nunca de
 *  promotion.original_price (snapshot do pedido) — garante que o cliente
 *  sempre paga promo_price de verdade, mesmo que o preço base do plano
 *  tenha mudado depois da aprovação (drift, seção 11: nunca recalculado
 *  silenciosamente o DESCONTO aprovado, mas o valor final cobrado tem que
 *  ser sempre promo_price, não um desconto fixo que vira preço errado).
 *  Por isso nunca reusa cegamente um coupon cacheado: só reusa se o
 *  amount_off dele ainda bate com o que é preciso agora; senão cria um
 *  novo e atualiza o cache. */
export async function resolveOrCreateStripeCoupon(
  admin: SupabaseClient,
  promotion: ActivePromotion,
  billingPeriod: 'monthly' | 'yearly',
  currency: string,
  currentPlanPrice: number,
): Promise<string> {
  const amountOffCents = Math.round((currentPlanPrice - promotion.promo_price) * 100)

  if (promotion.stripe_coupon_id) {
    try {
      const cached = await stripe.coupons.retrieve(promotion.stripe_coupon_id)
      if (cached.amount_off === amountOffCents && cached.valid) return promotion.stripe_coupon_id
    } catch (err) {
      console.warn('[promotions-checkout] cached coupon unreadable, recreating', { promotionId: promotion.id, err })
    }
  }

  const duration: 'once' | 'repeating' = promotion.discount_duration_type === 'ciclos_fixos' ? 'repeating' : 'once'
  const durationInMonths = duration === 'repeating'
    ? (promotion.discount_cycles ?? 1) * (billingPeriod === 'yearly' ? 12 : 1)
    : undefined

  const coupon = await stripe.coupons.create({
    amount_off: amountOffCents,
    currency: currency.toLowerCase(),
    duration,
    ...(durationInMonths ? { duration_in_months: durationInMonths } : {}),
    name: `Promoção ${promotion.id}`,
  })

  await admin.from('promotions').update({ stripe_coupon_id: coupon.id }).eq('id', promotion.id)
  return coupon.id
}
