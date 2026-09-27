import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minhas compras | LOBBY', robots: { index: false, follow: false } }

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import MinhasComprasClient from './MinhasComprasClient'
import type { AppPurchase } from '@/types'

export default async function MinhasComprasPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  const { data: purchases } = await supabase
    .from('app_purchases')
    .select('*')
    .eq('buyer_user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <MinhasComprasClient
      user={user}
      profile={profile}
      purchases={(purchases ?? []) as AppPurchase[]}
    />
  )
}
