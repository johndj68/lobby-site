import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import SubmissionsPanel from '@/components/admin/SubmissionsPanel'

export const metadata: Metadata = {
  title: 'Submissões de Aplicativos | Admin',
  description: 'Painel de análise de submissões de aplicativos',
}

export default async function SubmissionsPage() {
  const supabase = await createServerSupabaseClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Role check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  // Fetch submissions
  const { data: submissions } = await supabase
    .from('app_submissions')
    .select(
      `
      id,
      app_draft_id,
      status,
      submitted_at,
      reviewed_at,
      data,
      app_drafts!inner (
        organization_id,
        created_by
      )
    `
    )
    .order('submitted_at', { ascending: false })

  return <SubmissionsPanel submissions={(submissions as any) || []} />
}
