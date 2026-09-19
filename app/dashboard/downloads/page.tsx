/* Página de downloads do cliente (rota: /dashboard/downloads)
 *
 * Server Component que busca todos os registros de download associados
 * ao e-mail do usuário logado. Cada download representa um material
 * (e-book, guia, template) que o cliente baixou anteriormente.
 *
 * A busca usa o e-mail em vez do user.id porque o registro de download
 * é criado antes do cadastro (leads anônimos que depois criam conta).
 */
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Downloads | LOBBY', robots: { index: false, follow: false } }

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import DownloadsClient from './DownloadsClient'

export default async function DownloadsPage() {
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida sessão de cliente; redireciona para /login se não autenticado
  const { user, profile } = await requireClientSession(supabase)

  // Busca downloads pelo e-mail do usuário, mais recentes primeiro
  // Filtra por e-mail (não por user_id) para incluir downloads pré-cadastro
  const { data: downloads } = await supabase
    .from('downloads')
    .select('*')
    .eq('email', user.email)
    .order('created_at', { ascending: false })

  // DownloadsClient: lista os materiais baixados com link para re-download
  return <DownloadsClient user={user} profile={profile} downloads={downloads} />
}
