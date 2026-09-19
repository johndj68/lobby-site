/* Página de clientes do painel admin (rota: /admin/clientes)
 *
 * Restrita a técnicos líderes (requireLeaderSession).
 * Busca todos os projetos de clientes e os agrupa por client_id no servidor,
 * de modo que ClientesClient receba a lista já estruturada por cliente.
 *
 * Agrupamento server-side: evita enviar dados redundantes de cliente ao Client
 * Component — cada cliente aparece uma vez, com seus projetos aninhados.
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import AdminShell from '@/components/layout/AdminShell'
import ClientesClient from './ClientesClient'

export default async function ClientesPage() {
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida que o usuário é técnico líder; redireciona caso contrário
  const { user, profile } = await requireLeaderSession(supabase)

  /* Busca todos os projetos de clientes com os dados do cliente embutidos
     (client_name, client_email, client_company são desnormalizados na tabela).
     Ordenados pelo mais recentemente atualizado para que clientes ativos
     apareçam no topo após o agrupamento. */
  const { data: rows } = await supabase
    .from('client_projects')
    .select('id, client_id, title, status, progress, updated_at, client_name, client_email, client_company')
    .order('updated_at', { ascending: false })

  /* Agrupa os projetos por client_id usando um Map para acesso O(1).
     Chave: client_id | Valor: dados do cliente + lista de projetos aninhados */
  const map = new Map<string, {
    client_id: string
    client_name?: string
    client_email?: string
    client_company?: string
    projects: { id: string; title: string; status: string; progress: number; updated_at: string }[]
  }>()

  for (const row of (rows ?? [])) {
    if (!map.has(row.client_id)) {
      map.set(row.client_id, {
        client_id: row.client_id,
        client_name: row.client_name ?? undefined,
        client_email: row.client_email ?? undefined,
        client_company: row.client_company ?? undefined,
        projects: [],
      })
    }
    map.get(row.client_id)!.projects.push({
      id: row.id,
      title: row.title,
      status: row.status,
      progress: row.progress,
      updated_at: row.updated_at,
    })
  }

  const clients = Array.from(map.values()).sort((a, b) =>
    (b.projects[0]?.updated_at ?? '').localeCompare(a.projects[0]?.updated_at ?? '')
  )

  return (
    <AdminShell user={user} profile={profile}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Clientes
          </h1>
          <p className="mt-1 text-sm text-white/40">Todos os clientes com projetos cadastrados.</p>
        </div>
        <ClientesClient clients={clients} />
      </div>
    </AdminShell>
  )
}
