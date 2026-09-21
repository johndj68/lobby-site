import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import AppEditor from '../AppEditor'

export default async function EditAppPage({
  params: { id },
}: {
  params: { id: string }
}) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/meus-apps')

  const { data: draft, error } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('id', id)
    .eq('created_by', user.id)
    .single()

  if (error || !draft) redirect('/dashboard/meus-apps')

  const { data: plans } = await supabase
    .from('app_plans')
    .select('*')
    .eq('app_draft_id', id)
    .order('display_order', { ascending: true })

  return (
    <DashboardLayout
      section="meus-apps"
      title="Editor de Aplicativo"
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Meus Aplicativos', href: '/dashboard/meus-apps' },
        { label: 'Editor' },
      ]}
    >
      <AppEditor initialDraft={draft} initialPlans={plans || []} />
    </DashboardLayout>
  )
}
