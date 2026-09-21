import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import AppsClient from './AppsClient'

export const metadata: Metadata = {
  title: 'Meus Aplicativos | LOBBY',
  description: 'Gerencie seus aplicativos no marketplace LOBBY.',
}

export default async function MyAppsPage() {
  const supabase = await createServerSupabaseClient()

  const { user } = await requireClientSession(supabase)

  const { data: drafts } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8 p-8">
      <AppsClient initialDrafts={drafts || []} userId={user.id} />
    </div>
  )
}
