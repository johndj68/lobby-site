import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import PreviaClient from './PreviaClient'

export const metadata: Metadata = { title: 'Prévia | LOBBY', robots: { index: false, follow: false } }

export default async function PreviaAppPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  // RLS (dono OU app_team_members) decide o acesso — mesma regra da página
  // de acompanhamento, sem checagem extra aqui.
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name')
    .eq('id', appId)
    .maybeSingle()

  if (!draft) notFound()

  const { data: submission } = await supabase
    .from('app_submissions')
    .select('id, submitted_at, data, content_snapshot')
    .eq('app_draft_id', appId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!submission) notFound()

  return (
    <PreviaClient
      appId={appId}
      appName={draft.name || 'Aplicativo sem nome'}
      submittedAt={submission.submitted_at}
      previewData={submission.content_snapshot ?? submission.data ?? {}}
    />
  )
}
