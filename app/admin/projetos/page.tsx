import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import { projects as staticProjects } from '@/lib/data'
import ProjetosAdminClient from './ProjetosAdminClient'

/** Mapeia slug → tipo de mockup visual para os projetos estáticos */
function getMockupType(slug: string): string {
  if (slug.includes('financeiro') || slug.includes('dashboard')) return 'finance'
  if (slug.includes('automacao') || slug.includes('atendimento')) return 'automation'
  if (slug.includes('portal')) return 'portal'
  return 'default'
}

export default async function AdminProjetosPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  // Busca projetos já no banco
  const { data: dbProjects } = await supabase
    .from('lobby_projects')
    .select('*')
    .order('created_at', { ascending: false })

  // Auto-seed: insere projetos estáticos que ainda não existem no banco
  // (migração única — depois de inseridos, ficam editáveis pelo painel)
  const existingSlugs = new Set((dbProjects ?? []).map((p: { slug: string }) => p.slug))
  const missing = staticProjects.filter(p => !existingSlugs.has(p.slug))

  if (missing.length > 0) {
    await supabase.from('lobby_projects').upsert(
      missing.map(p => ({
        title:       p.title,
        description: p.description,
        category:    p.category as string,
        slug:        p.slug,
        impact:      p.impact ?? null,
        tags:        p.tags ?? [],
        mockup_type: getMockupType(p.slug),
      })),
      { onConflict: 'slug', ignoreDuplicates: true }
    )
  }

  // Re-busca para garantir que tem tudo (incluindo os recém inseridos)
  const { data: allProjects } = await supabase
    .from('lobby_projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <ProjetosAdminClient
      user={user}
      profile={profile}
      isLeader={profile?.is_leader === true}
      initialProjects={allProjects ?? []}
    />
  )
}
