import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'

export default async function MeusAppLayout({
  children
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  // Render without DashboardShell for meus-app routes
  return <>{children}</>
}
