import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import AdminLayout from '@/components/layout/AdminLayout'
import SubmissionsClient from './SubmissionsClient'

export default async function SubmissionsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  // Check if admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

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
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Submissões de Aplicativos</h1>
          <p className="text-gray-600">Analise e aprove apps de parceiros</p>
        </div>

        <SubmissionsClient initialSubmissions={submissions || []} />
      </div>
    </AdminLayout>
  )
}
