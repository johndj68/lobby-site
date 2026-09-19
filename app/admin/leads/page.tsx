import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { resources as staticResources } from '@/lib/data'
import LeadsClient from './LeadsClient'

export interface MaterialRank {
  resourceId: string
  name:       string
  category:   string
  count:      number
}

export default async function LeadsPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  // Busca todos os downloads e metadados de recursos em paralelo
  const [
    { data: leads },
    { data: dbResources },
  ] = await Promise.all([
    supabase.from('downloads').select('*').order('created_at', { ascending: false }),
    supabase.from('resource_metadata').select('id, title, category'),
  ])

  /* ── Calcula ranking: conta downloads por resource_id ── */
  const rankMap: Record<string, number> = {}
  for (const l of (leads ?? [])) {
    if (l.resource_id) rankMap[l.resource_id] = (rankMap[l.resource_id] ?? 0) + 1
  }

  const ranking: MaterialRank[] = Object.entries(rankMap)
    .sort(([, a], [, b]) => b - a)
    .map(([resourceId, count]) => {
      const dbRes     = (dbResources ?? []).find(r => r.id === resourceId)
      const staticRes = staticResources.find(r => r.id === resourceId)
      return {
        resourceId,
        name:     dbRes?.title     ?? staticRes?.title          ?? `Material #${resourceId.slice(0, 6)}`,
        category: dbRes?.category  ?? (staticRes?.category as string) ?? '—',
        count,
      }
    })

  return (
    <LeadsClient
      user={user}
      profile={profile}
      leads={leads ?? []}
      ranking={ranking}
    />
  )
}
