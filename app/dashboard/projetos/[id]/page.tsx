/* Página de detalhe de um projeto do cliente (rota: /dashboard/projetos/[id])
 *
 * Server Component com rota dinâmica.
 * Busca o projeto pelo ID garantindo que client_id = usuário logado
 * (impede que um cliente veja projetos de outros clientes).
 * Retorna 404 automaticamente se o projeto não existir ou não pertencer ao usuário.
 *
 * Também resolve o nome do técnico responsável (lead_technician_id)
 * para exibição amigável — sem esse passo a UI mostraria apenas o UUID.
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import ProjectDetailClient from './ProjectDetailClient'
import type { ClientProject } from '@/types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  // Usa o client autenticado (RLS-scoped), não o admin client: garante que o
  // título só é lido se o projeto pertencer ao usuário logado, evitando
  // vazamento do título de projetos de outros clientes via <title>.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = user
    ? await supabase.from('client_projects').select('title').eq('id', id).eq('client_id', user.id).single()
    : { data: null }
  return {
    title: data?.title ? `${data.title} | LOBBY` : 'Projeto | LOBBY',
    robots: { index: false, follow: false },
  }
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Resolve o ID da URL (params é assíncrono no Next.js App Router)
  const { id } = await params
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida sessão de cliente; redireciona para /login se não autenticado
  const { user, profile } = await requireClientSession(supabase)

  /* Busca o projeto filtrando também por client_id para segurança:
     garante que um cliente não consiga ver o projeto de outro
     simplesmente acessando /dashboard/projetos/[id_alheio]. */
  const { data: project } = await supabase
    .from('client_projects')
    .select('*')
    .eq('id', id)
    .eq('client_id', user.id)
    .single()

  // Se o projeto não existir ou não pertencer ao usuário, retorna 404
  if (!project) notFound()

  /* Resolve o nome do técnico responsável pelo projeto.
     A UI antes mostrava "Equipe LOBBY" fixo mesmo quando já havia
     alguém aceito — agora exibe o nome real do técnico responsável. */
  let leadTechnicianName: string | null = null
  if (project.lead_technician_id) {
    // Busca nome ou e-mail do técnico para exibição amigável
    const { data: tech } = await supabase
      .from('profiles').select('full_name, email').eq('id', project.lead_technician_id).single()
    leadTechnicianName = tech?.full_name || tech?.email || null
  }

  return (
    // ProjectDetailClient: exibe progresso, timeline, relatórios e chat do projeto
    <ProjectDetailClient
      user={user}
      profile={profile}
      project={project as ClientProject}
      leadTechnicianName={leadTechnicianName}
    />
  )
}
