import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { fetchCategoryTree, fetchCategoryPendencyRows } from '@/lib/services/categories'
import CategoriasClient from './CategoriasClient'

interface SearchParams {
  tab?: string; categoria?: string; q?: string; status?: string; pai?: string; organizar?: string
  pq?: string; ptipo?: string; ppartner?: string; ppublicacao?: string
}

export default async function CategoriasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const [{ tree, flat, error: treeError }, { rows: pendencyRows, error: pendencyError }, { data: rawEvents }] = await Promise.all([
    fetchCategoryTree(supabase),
    fetchCategoryPendencyRows(supabase),
    supabase.from('app_admin_events').select('id, category_id, action, reason, previous_status, new_status, actor_id, created_at').not('category_id', 'is', null).order('created_at', { ascending: false }),
  ])

  const actorIds = [...new Set((rawEvents ?? []).map(e => e.actor_id).filter(Boolean))] as string[]
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const actorMap = new Map((actors ?? []).map(a => [a.id, a.full_name || a.email || 'Usuário removido']))
  const events = (rawEvents ?? []).map(e => ({ ...e, actorName: e.actor_id ? (actorMap.get(e.actor_id) ?? 'Usuário removido') : 'Sistema' }))

  const indicators = {
    categoriasAtivas: flat.filter(c => !c.parentId && c.status === 'active').length,
    subcategoriasAtivas: flat.filter(c => c.parentId && c.status === 'active').length,
    appsSemCategoria: pendencyRows.filter(r => r.publicationStatus === 'publicado').length,
  }

  return (
    <CategoriasClient
      user={user} profile={profile}
      tree={tree} flat={flat} loadError={treeError}
      pendencyRows={pendencyRows} pendencyError={pendencyError}
      events={events}
      indicators={indicators}
      searchParams={{
        tab: sp.tab === 'pendencias' ? 'pendencias' : 'categorias',
        categoria: sp.categoria ?? null,
        q: sp.q ?? '', status: sp.status ?? 'todas', pai: sp.pai ?? 'todas', organizar: sp.organizar === '1',
        pq: sp.pq ?? '', ptipo: sp.ptipo ?? 'todos', ppartner: sp.ppartner ?? 'todos', ppublicacao: sp.ppublicacao ?? 'todas',
      }}
    />
  )
}
