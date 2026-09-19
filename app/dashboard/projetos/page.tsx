/* Página de listagem de projetos do cliente (rota: /dashboard/projetos)
 *
 * Server Component — busca todos os projetos onde client_id = usuário logado,
 * ordenados pela atualização mais recente. Passa os dados para ProjetosClient
 * (Client Component) que gerencia filtros, busca e exibição em cards/lista.
 */
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meus Projetos | LOBBY', robots: { index: false, follow: false } }

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import ProjetosClient from './ProjetosClient'

export default async function DashboardProjetosPage() {
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida sessão de cliente; redireciona para /login se não autenticado
  const { user, profile } = await requireClientSession(supabase)

  // Busca todos os projetos do cliente, mais recentemente atualizados primeiro
  // select('*') traz todos os campos incluindo client_progress (JSON com timeline)
  const { data: clientProjects } = await supabase
    .from('client_projects')
    .select('*')
    .eq('client_id', user.id)
    .order('updated_at', { ascending: false })

  return (
    // ProjetosClient: exibe cards de projeto com status, progresso e filtros interativos
    <ProjetosClient
      user={user}
      profile={profile}
      clientProjects={clientProjects ?? []}
    />
  )
}
