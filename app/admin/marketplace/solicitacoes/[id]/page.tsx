import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import SubmissionDetailClient from './SubmissionDetailClient'

export const metadata: Metadata = {
  title: 'Análise | Admin LOBBY',
}

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Check admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'technician') {
    notFound()
  }

  // Load submission
  // Nota: reviewer_id referencia auth.users, não profiles — não dá pra
  // embutir "reviewer:reviewer_id(full_name)" (sem FK declarada pra
  // profiles, o PostgREST rejeita o join com PGRST200 e a query inteira
  // falha, o que fazia esta página 404 pra qualquer submissão).
  const { data: submission } = await supabase
    .from('app_submissions')
    .select(`
      *,
      app_drafts(id, name, short_description, logo_url, created_by)
    `)
    .eq('id', id)
    .single()

  if (!submission) notFound()

  // Load checklist items
  const { data: checklistItems } = await supabase
    .from('review_checklist_items')
    .select('*')
    .eq('submission_id', id)

  // Load issues
  const { data: issues } = await supabase
    .from('review_issues')
    .select('*')
    .eq('submission_id', id)

  return (
    <SubmissionDetailClient
      submission={submission}
      checklistItems={checklistItems || []}
      issues={issues || []}
    />
  )
}
