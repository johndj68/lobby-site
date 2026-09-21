import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'

export default async function AppIdLayout({
  children
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  // Render without DashboardShell (no sidebar)
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {children}
    </div>
  )
}
