/* Página de gestão da equipe técnica (rota: /admin/equipe)
 *
 * Restrita a técnicos líderes (requireLeaderSession) — técnicos comuns
 * não têm acesso a esta seção.
 *
 * Busca todos os perfis com role='technician' para exibir a lista de
 * membros da equipe. EquipeClient permite convidar novos técnicos,
 * promover a líder e gerenciar o acesso de cada membro.
 */
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import EquipeClient from './EquipeClient'

export default async function EquipePage() {
  // Cria cliente Supabase autenticado no servidor
  const supabase = await createServerSupabaseClient()
  // Valida que o usuário é técnico líder; redireciona caso contrário
  const { user, profile } = await requireLeaderSession(supabase)

  /* Busca todos os técnicos da plataforma incluindo is_leader
     para diferenciá-los visualmente (líderes têm badge especial). */
  const { data: technicians } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_leader, created_at')
    .eq('role', 'technician')
    .order('full_name', { ascending: true }) // ordem alfabética por nome

  return (
    // EquipeClient: lista de membros com ações de convite, promoção e remoção
    <EquipeClient
      user={user}
      profile={profile}
      technicians={technicians ?? []}
    />
  )
}
