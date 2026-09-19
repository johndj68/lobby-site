/* Página de relatórios do painel admin (rota: /admin/relatorios)
 *
 * Restrita a técnicos líderes (requireLeaderSession).
 * Agrega métricas do sistema em múltiplas consultas e passa os dados
 * compilados para RelatoriosClient (Client Component), que renderiza
 * o dashboard de indicadores.
 *
 * Métricas coletadas:
 *  - Projetos: total, ativos, concluídos, aguardando aprovação
 *  - Clientes: total cadastrados, quantidade com projeto ativo
 *  - Créditos: total emitido vs. total gasto (soma de todas as carteiras)
 *  - Leads:    total de downloads e downloads no mês corrente
 *  - Mensagens: total e não lidas
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import AdminShell from '@/components/layout/AdminShell'
import RelatoriosClient from './RelatoriosClient'

export default async function RelatoriosPage() {
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida que o usuário é técnico líder; redireciona caso contrário
  const { user, profile } = await requireLeaderSession(supabase)

  /* ── Dados de projetos ──
     Busca id, status e client_progress (para detectar projetos aguardando aprovação).
     client_progress.approvalRequired + approvalStatus determinam se o projeto
     está na fila de aprovação do cliente. */
  const { data: projects } = await supabase
    .from('client_projects')
    .select('id, status, client_progress')

  const total = projects?.length ?? 0
  const active = projects?.filter(p => p.status === 'ativo' || p.status === 'em_andamento').length ?? 0
  const completed = projects?.filter(p => p.status === 'concluido').length ?? 0
  const pending_approval = projects?.filter(p => {
    const cp = p.client_progress as { approvalRequired?: boolean; approvalStatus?: string } | null
    return cp?.approvalRequired && (!cp?.approvalStatus || cp?.approvalStatus === 'aguardando')
  }).length ?? 0

  // Clients
  const { count: totalClients } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'client')

  const activeClientIds = new Set(
    projects?.filter(p => p.status === 'ativo' || p.status === 'em_andamento')
      .map(p => (p as { client_id?: string }).client_id)
      .filter(Boolean)
  )

  // Credits
  const { data: wallets } = await supabase
    .from('client_credit_wallets')
    .select('total_purchased, total_spent')

  const total_issued = wallets?.reduce((a, w) => a + (w.total_purchased ?? 0), 0) ?? 0
  const total_spent  = wallets?.reduce((a, w) => a + (w.total_spent ?? 0), 0) ?? 0

  // Leads
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { count: totalLeads } = await supabase.from('downloads').select('id', { count: 'exact', head: true })
  const { count: thisMonthLeads } = await supabase.from('downloads').select('id', { count: 'exact', head: true }).gte('created_at', monthStart)

  // Messages
  const { count: totalMessages } = await supabase.from('messages').select('id', { count: 'exact', head: true })
  const { count: unreadMessages } = await supabase.from('messages').select('id', { count: 'exact', head: true }).is('read_at', null)

  return (
    <AdminShell user={user} profile={profile}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Relatórios
          </h1>
          <p className="mt-1 text-sm text-white/40">Métricas e visão geral do sistema.</p>
        </div>
        <RelatoriosClient
          projects={{ total, active, completed, pending_approval }}
          clients={{ total: totalClients ?? 0, with_active_project: activeClientIds.size }}
          credits={{ total_issued, total_spent }}
          leads={{ total: totalLeads ?? 0, this_month: thisMonthLeads ?? 0 }}
          messages={{ total: totalMessages ?? 0, unread: unreadMessages ?? 0 }}
        />
      </div>
    </AdminShell>
  )
}
