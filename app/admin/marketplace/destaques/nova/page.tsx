import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { partnerDisplayName } from '@/lib/partners'
import NovaCampanhaClient from './NovaCampanhaClient'

export default async function NovaCampanhaPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const [{ data: drafts }, { data: spaces }] = await Promise.all([
    supabase.from('app_drafts').select('id, name, logo_url, created_by, application_id').not('application_id', 'is', null).order('name'),
    supabase.from('ad_spaces').select('id, name').eq('is_active', true),
  ])

  const partnerIds = [...new Set((drafts ?? []).map(d => d.created_by))]
  const { data: partners } = partnerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name, role').in('id', partnerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null; role: string }[] }
  const partnerById = new Map((partners ?? []).map(p => [p.id, p]))

  const apps = (drafts ?? []).map(d => ({
    id: d.id, name: d.name || 'Sem nome', logoUrl: d.logo_url,
    partnerName: partnerById.get(d.created_by)?.role === 'technician' ? 'LOBBY · Produto próprio' : partnerDisplayName(partnerById.get(d.created_by) ?? { company_name: null, full_name: null, email: null }),
  }))

  return <NovaCampanhaClient user={user} profile={profile} apps={apps} spaces={spaces ?? []} />
}
