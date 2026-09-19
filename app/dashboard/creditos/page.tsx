/* Página de créditos do cliente (rota: /dashboard/creditos)
 *
 * Server Component que busca em paralelo:
 *  - wallet:       carteira de créditos do usuário (saldo atual)
 *  - packages:     pacotes de crédito disponíveis para compra (is_active = true)
 *  - transactions: até 50 transações mais recentes (débitos e créditos)
 *  - purchases:    até 20 compras realizadas pelo usuário
 *
 * Todos os dados são passados como props iniciais para CreditosClient (Client Component),
 * que gerencia a interação de compra e exibe o histórico.
 */
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Créditos | LOBBY', robots: { index: false, follow: false } }

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import CreditosClient from './CreditosClient'
import type { ClientCreditWallet, CreditPackage, CreditTransaction, CreditPurchase } from '@/types'

export default async function CreditosPage() {
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida sessão de cliente; redireciona para /login se não autenticado
  const { user, profile } = await requireClientSession(supabase)

  // Busca todos os dados necessários em paralelo para reduzir latência
  const [
    { data: wallet },       // carteira de créditos deste usuário
    { data: packages },     // pacotes disponíveis para compra (ativos)
    { data: transactions }, // histórico de transações (compras, usos, bônus)
    { data: purchases },    // compras de pacotes realizadas pelo usuário
  ] = await Promise.all([
    supabase.from('client_credit_wallets').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('credit_packages').select('*').eq('is_active', true).order('credits_amount', { ascending: true }),
    supabase.from('credit_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('credit_purchases').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
  ])

  return (
    // CreditosClient: renderiza saldo, pacotes disponíveis e histórico de transações
    <CreditosClient
      user={user}
      profile={profile}
      initialWallet={(wallet as ClientCreditWallet) ?? null}
      packages={(packages ?? []) as CreditPackage[]}
      initialTransactions={(transactions ?? []) as CreditTransaction[]}
      initialPurchases={(purchases ?? []) as CreditPurchase[]}
    />
  )
}
