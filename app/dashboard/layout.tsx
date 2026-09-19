import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import DashboardShell from '@/components/layout/DashboardShell'

export const metadata: Metadata = {
  title: 'Dashboard | LOBBY',
  robots: { index: false, follow: false },
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)
  return (
    <DashboardShell user={user} profile={profile}>
      {children}
    </DashboardShell>
  )
}
