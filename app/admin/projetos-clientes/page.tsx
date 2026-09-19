import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import ProjetosClientesClient from './ProjetosClientesClient'

export default async function AdminProjetosClientesPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const [
    { data: clientProjects },
    { data: clients },
    { data: technicians },
    { data: team },
  ] = await Promise.all([
    supabase
      .from('client_projects')
      .select('*')
      .order('updated_at', { ascending: false }),

    // Clientes: role='client' OU role nulo (cadastros antigos sem role definido)
    supabase
      .from('profiles')
      .select('id, full_name, email, company_name, phone')
      .or('role.eq.client,role.is.null')
      .order('full_name', { ascending: true }),

    // Todos os técnicos (pra montar o seletor de "adicionar técnico")
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'technician')
      .order('full_name', { ascending: true }),

    // Equipes de todos os projetos
    supabase
      .from('client_project_team')
      .select('id, project_id, technician_id, status, invited_by'),
  ])

  return (
    <ProjetosClientesClient
      user={user}
      profile={profile}
      isLeader={profile?.is_leader === true}
      initialProjects={clientProjects ?? []}
      clients={clients ?? []}
      technicians={technicians ?? []}
      initialTeam={team ?? []}
    />
  )
}
