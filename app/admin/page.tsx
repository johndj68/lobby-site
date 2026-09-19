/* Página principal do painel admin (rota: /admin)
 *
 * Server Component — dashboard de controle para técnicos e líderes.
 * Busca em paralelo todos os dados necessários para montar a visão geral:
 *  - contacts:    solicitações de contato recebidas (filtradas por role)
 *  - technicians: lista de técnicos disponíveis para atribuição
 *  - templates:   modelos de resposta rápida cadastrados
 *  - responses:   respostas enviadas por contato (agrupadas por contact_id)
 *  - activity:    histórico de ações por contato (agrupado por contact_id)
 *  - leads:       downloads de materiais (geração de leads)
 *
 * Diferença líder vs técnico comum:
 *  - Líder vê todos os contatos; técnico vê apenas os não atribuídos + os seus.
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import AdminDashboardClient from './AdminDashboardClient'
import type { ContactResponse, ContactActivity } from './solicitacoes/page'

export default async function AdminDashboardPage() {
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida sessão de técnico; redireciona se não autenticado como técnico/líder
  const { user, profile } = await requireTechnicianSession(supabase)

  // Flag que diferencia técnicos líderes de técnicos comuns
  const isLeader = profile?.is_leader === true

  // Busca contatos, técnicos, modelos de resposta, histórico e leads em paralelo
  const [
    { data: contacts },
    { data: technicians },
    { data: templates },
    { data: responses },
    { data: activity },
    { data: leads },
  ] = await Promise.all([
    (() => {
      const q = supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
      // Líder vê todas; técnico regular vê só não atribuídas + as suas
      return isLeader ? q : q.or(`assignee_id.is.null,assignee_id.eq.${user.id}`)
    })(),

    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'technician')
      .order('full_name', { ascending: true }),

    supabase
      .from('response_templates')
      .select('id, title, subject, body')
      .order('sort_order', { ascending: true }),

    supabase
      .from('contact_responses')
      .select('*')
      .order('created_at', { ascending: false }),

    supabase
      .from('contact_activity')
      .select('*')
      .order('created_at', { ascending: false }),

    supabase
      .from('downloads')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  /* Agrupa as respostas por contact_id para acesso O(1) no cliente.
     Estrutura: { [contact_id]: ContactResponse[] } */
  const responsesByContact = (responses ?? []).reduce<Record<string, ContactResponse[]>>((acc, r) => {
    (acc[r.contact_id] ??= []).push(r)
    return acc
  }, {})

  /* Agrupa as atividades por contact_id para acesso O(1) no cliente.
     Estrutura: { [contact_id]: ContactActivity[] } */
  const activityByContact = (activity ?? []).reduce<Record<string, ContactActivity[]>>((acc, a) => {
    (acc[a.contact_id] ??= []).push(a)
    return acc
  }, {})

  return (
    <AdminDashboardClient
      user={user}
      profile={profile}
      isLeader={isLeader}
      contacts={contacts ?? []}
      technicians={technicians ?? []}
      templates={templates ?? []}
      responses={responsesByContact}
      activity={activityByContact}
      leads={leads ?? []}
    />
  )
}
