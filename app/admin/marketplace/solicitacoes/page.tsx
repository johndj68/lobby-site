import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import SubmissionsClient from './SubmissionsClient'

export default async function SubmissionsPage() {
  const supabase = await createServerSupabaseClient()

  // requireTechnicianSession already validates technician role
  const { user, profile } = await requireTechnicianSession(supabase)

  // Fetch submissions with app info
  const { data: submissions } = await supabase
    .from('app_submissions')
    .select(`
      id,
      status,
      submitted_at,
      app_draft_id,
      submitted_by,
      public_feedback,
      app_drafts(id, name, short_description, logo_url, category)
    `)
    .order('submitted_at', { ascending: false })

  return (
    <SubmissionsClient initialSubmissions={(submissions as any) || []} />
  )
}
