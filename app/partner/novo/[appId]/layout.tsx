import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'

export default async function AppIdLayout({
  children
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  return <>{children}</>
}
