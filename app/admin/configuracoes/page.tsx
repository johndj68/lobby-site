/* Página de configurações do painel admin (rota: /admin/configuracoes)
 *
 * Acessível apenas por técnicos (requireTechnicianSession).
 * Busca os modelos de resposta (response_templates) cadastrados no banco
 * e os passa para ConfiguracoesClient, que permite criar, editar e excluir templates.
 *
 * Templates são usados no módulo de solicitações para responder contatos
 * com texto pré-definido, agilizando o atendimento da equipe.
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import ConfiguracoesClient from './ConfiguracoesClient'

export default async function ConfiguracoesPage() {
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida sessão de técnico; redireciona se não for técnico ou líder autenticado
  const { user, profile } = await requireTechnicianSession(supabase)

  // Busca modelos de resposta ordenados por sort_order (ordem definida pelo usuário)
  const { data: templates } = await supabase
    .from('response_templates')
    .select('id, title, subject, body')
    .order('sort_order', { ascending: true })

  // ConfiguracoesClient: CRUD de templates de resposta com drag-and-drop de reordenação
  return <ConfiguracoesClient user={user} profile={profile} templates={templates ?? []} />
}
