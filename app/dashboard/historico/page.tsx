/* Página de histórico de projetos do cliente (rota: /dashboard/historico)
 *
 * Server Component — busca todos os projetos do cliente com o campo
 * client_progress (JSON) que contém o array updateHistory (linha do tempo).
 * HistoricoClient (Client Component) achata esse histórico de todos os projetos
 * em uma linha do tempo global cronológica, além de exibir cards filtrável por status.
 */
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Histórico | LOBBY', robots: { index: false, follow: false } }

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import HistoricoClient from './HistoricoClient'
import type { ClientProject } from '@/types'

export default async function HistoricoPage() {
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  const { data: projects } = await supabase
    .from('client_projects')
    .select('id, client_id, title, description, category, status, progress, priority, notes, deadline, created_at, updated_at, client_progress')
    .eq('client_id', user.id)
    .order('updated_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1020] sm:text-3xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Histórico
        </h1>
        <p className="mt-1 text-sm text-[#5D6475]">Todos os seus projetos e atualizações em ordem cronológica.</p>
      </div>
      <HistoricoClient projects={(projects ?? []) as unknown as ClientProject[]} />
    </div>
  )
}
