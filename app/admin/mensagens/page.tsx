/* Página de mensagens do painel admin (rota: /admin/mensagens)
 *
 * Acessível apenas por técnicos (requireTechnicianSession).
 * Não busca dados no servidor — MensagensClient (Client Component) carrega
 * as mensagens via Supabase Realtime diretamente no navegador para
 * manter o chat atualizado em tempo real sem recarregar a página.
 *
 * Suspense: envolve o Client Component para habilitar streaming do RSC.
 * Sem ele, qualquer await no Client Component bloquearia o renderizador.
 */
import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import MensagensClient from './MensagensClient'

export default async function AdminMensagensPage() {
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida sessão de técnico; redireciona se não autenticado como técnico/líder
  const { user, profile } = await requireTechnicianSession(supabase)

  return (
    // Suspense necessário para envolver Client Components que usam hooks de dados assíncronos
    <Suspense>
      {/* MensagensClient: interface de chat com Realtime, lista de threads por projeto */}
      <MensagensClient user={user} profile={profile} />
    </Suspense>
  )
}
