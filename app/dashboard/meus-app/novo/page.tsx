import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import NovoAppClient from './NovoAppClient'

export const metadata: Metadata = {
  title: 'Novo Aplicativo | LOBBY',
  description: 'Publique seu aplicativo no marketplace LOBBY',
}

export default async function NovoAppPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  return (
    <NovoAppClient user={user} profile={profile} />
  )
}
