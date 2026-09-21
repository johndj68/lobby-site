import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import AppsClient from './AppsClient'

export const metadata: Metadata = {
  title: 'Meus Aplicativos | LOBBY',
  description: 'Gerencie seus aplicativos no marketplace LOBBY.',
}

export default async function MyAppsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/meus-apps')

  const { data: drafts } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  return (
    <DashboardLayout
      section="meus-apps"
      title="Meus Aplicativos"
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Meus Aplicativos' },
      ]}
    >
      <AppsClient initialDrafts={drafts || []} userId={user.id} />
    </DashboardLayout>
  )
}
