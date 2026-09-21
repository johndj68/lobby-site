import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import SubmissionsClient from './SubmissionsClient'

export default async function SubmissionsPage() {
  const supabase = await createServerSupabaseClient()

  const { user, profile } = await requireTechnicianSession(supabase)
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Fetch submissions
  const { data: submissions } = await supabase
    .from('app_submissions')
    .select(`
      id,
      status,
      submitted_at,
      app_draft_id,
      submitted_by,
      reviewer_notes,
      data
    `)
    .order('submitted_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Submissões de Aplicativos</h1>
        <p className="text-gray-600">Analise e aprove apps de parceiros</p>
      </div>

      <SubmissionsClient initialSubmissions={submissions || []} />
    </div>
  )
}
