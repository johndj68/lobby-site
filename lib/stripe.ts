import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

/**
 * "Teste"/"Produção" derivado do prefixo da própria chave configurada — não
 * existe flag de ambiente separada no projeto (uma única STRIPE_SECRET_KEY).
 * Nunca expor a chave em si, só a palavra derivada.
 */
export function getStripeEnvironmentLabel(): 'Teste' | 'Produção' {
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'Produção' : 'Teste'
}

/**
 * Retorna o Stripe Customer do usuário, criando se ainda não existir.
 * Assinatura (diferente de checkout avulso de crédito/campanha/app)
 * precisa de um Customer persistente — é o que o Stripe usa pra agrupar
 * ciclos de cobrança, tentativas de retry e o billing portal.
 */
export async function getOrCreateStripeCustomer(
  admin: SupabaseClient,
  userId: string,
  email: string,
  fullName?: string | null,
): Promise<string> {
  const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', userId).single()
  if (profile?.stripe_customer_id) return profile.stripe_customer_id

  const customer = await stripe.customers.create({
    email,
    name: fullName ?? undefined,
    metadata: { user_id: userId },
  })

  await admin.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', userId)
  return customer.id
}
