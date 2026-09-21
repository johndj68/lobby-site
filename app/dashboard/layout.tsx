import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import DashboardLayoutWrapper from '@/components/layout/DashboardLayoutWrapper'

export const metadata: Metadata = {
  title: 'Dashboard | LOBBY',
  robots: { index: false, follow: false },
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)
  return (
    <DashboardLayoutWrapper user={user} profile={profile}>
      {children}
    </DashboardLayoutWrapper>
  )
}
