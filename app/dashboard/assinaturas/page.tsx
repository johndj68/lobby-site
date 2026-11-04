import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minhas assinaturas | LOBBY', robots: { index: false, follow: false } }

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import AssinaturasClient from './AssinaturasClient'
import type { Subscription } from '@/lib/services/subscriptions'

export default async function AssinaturasPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <AssinaturasClient
      user={user}
      profile={profile}
      subscriptions={(subscriptions ?? []) as Subscription[]}
    />
  )
}
