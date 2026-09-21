import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { notFound } from 'next/navigation'
import SucessoClient from './SucessoClient'

interface PageProps {
  params: Promise<{ appId: string }>
}

export default async function SuccessPage({ params }: PageProps) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  // Load submission
  const { data: submission } = await supabase
    .from('app_submissions')
    .select('*')
    .eq('app_draft_id', appId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  if (!submission) notFound()

  // Load draft
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (!draft) notFound()

  return <SucessoClient draft={draft} submission={submission} />
}
