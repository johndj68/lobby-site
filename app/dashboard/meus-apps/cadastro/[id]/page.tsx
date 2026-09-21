import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { redirect } from 'next/navigation'
import AppEditor from '../AppEditor'

export default async function EditAppPage({
  params: { id },
}: {
  params: { id: string }
}) {
  const supabase = await createServerSupabaseClient()

  const { user } = await requireClientSession(supabase)

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
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Editor de Aplicativo</h1>
      </div>
      <AppEditor initialDraft={draft} initialPlans={plans || []} />
    </div>
  )
}
