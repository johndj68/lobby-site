/* Página de configurações de conta do cliente (rota: /dashboard/conta)
 *
 * Server Component — valida sessão e passa user + profile para o formulário.
 * AccountForm (Client Component) gerencia a edição de nome, empresa e senha.
 * Sem busca adicional: os dados necessários já vêm de requireClientSession.
 */
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minha Conta | LOBBY', robots: { index: false, follow: false } }

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import AccountForm from './AccountForm'

export default async function ContaPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  // Só parceiros (dono de pelo menos 1 app_draft) veem a seção de dados de
  // recebimento — mesmo modelo de "parceiro" já usado em lib/partners.ts.
  const { count: draftsCount } = await supabase
    .from('app_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)

  return <AccountForm user={user} profile={profile} isPartner={!!draftsCount && draftsCount > 0} />
}
