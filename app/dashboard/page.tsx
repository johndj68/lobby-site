import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { resources as staticResources } from '@/lib/data'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  // Busca métricas reais em paralelo (não bloqueia uma à outra)
  const activeStatuses = ['solicitado', 'em_analise', 'em_desenvolvimento', 'em_validacao']

  const [
    { count: downloadsCount },
    { count: openContactsCount },
    { count: dbResourcesCount },
    { count: activeProjectsCount },
    { data: recentProjects },
  ] = await Promise.all([
    // Materiais que o usuário baixou
    supabase
      .from('downloads')
      .select('*', { count: 'exact', head: true })
      .eq('email', user.email ?? ''),

    // Solicitações desse usuário em aberto (novo ou em análise)
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('email', user.email ?? '')
      .in('status', ['novo', 'em_analise']),

    // Materiais no banco (adicionados pelo técnico)
    supabase
      .from('resource_metadata')
      .select('*', { count: 'exact', head: true }),

    // Projetos do cliente ainda em andamento (exclui concluído/pausado)
    supabase
      .from('client_projects')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', user.id)
      .in('status', activeStatuses),

    // Projetos reais do cliente, mais recentes primeiro
    supabase
      .from('client_projects')
      .select('id, title, status, progress, updated_at')
      .eq('client_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(3),
  ])

  // Total de materiais = DB + estáticos que não estão no DB
  const totalResources = Math.max(
    (dbResourcesCount ?? 0) || staticResources.length,
    staticResources.length
  )

  return (
    <DashboardClient
      user={user}
      profile={profile}
      metrics={{
        downloads:  downloadsCount  ?? 0,
        contacts:   openContactsCount ?? 0,
        resources:  totalResources,
        projects:   activeProjectsCount ?? 0,
      }}
      projects={recentProjects ?? []}
    />
  )
}
