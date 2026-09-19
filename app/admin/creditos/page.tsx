import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import CreditosAdminClient from './CreditosAdminClient'
import type { CreditPackage, CreditPurchase } from '@/types'

export interface WalletRow {
  id:              string
  user_id:         string
  balance:         number
  total_purchased: number
  total_spent:     number
  updated_at:      string
  profiles:        { full_name: string | null; email: string | null } | null
}

export default async function CreditosAdminPage() {
  const supabase = await createServerSupabaseClient()
  // Só técnico líder passa daqui — cliente, técnico comum e não
  // autenticado são redirecionados dentro de requireLeaderSession.
  const { user, profile } = await requireLeaderSession(supabase)

  const [
    { data: wallets },
    { data: packages },
    { data: purchases },
  ] = await Promise.all([
    supabase
      .from('client_credit_wallets')
      .select('id, user_id, balance, total_purchased, total_spent, updated_at, profiles(full_name, email)')
      .order('balance', { ascending: false }),
    supabase
      .from('credit_packages')
      .select('*')
      .order('credits_amount', { ascending: true }),
    supabase
      .from('credit_purchases')
      .select('*, credit_packages(name), profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const mappedPurchases: CreditPurchase[] = (purchases ?? []).map((p) => {
    const row = p as unknown as CreditPurchase & {
      credit_packages: { name: string } | null
      profiles: { full_name: string | null; email: string | null } | null
    }
    return {
      ...row,
      package:     row.credit_packages,
      buyer_name:  row.profiles?.full_name ?? null,
      buyer_email: row.profiles?.email ?? null,
    }
  })

  return (
    <CreditosAdminClient
      user={user}
      profile={profile}
      initialWallets={(wallets ?? []) as unknown as WalletRow[]}
      initialPackages={(packages ?? []) as CreditPackage[]}
      initialPurchases={mappedPurchases}
    />
  )
}
