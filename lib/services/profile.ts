import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Garante sessão de cliente autenticado nas rotas /dashboard/**.
 * Redireciona pra /login se não autenticado, pra /admin se for técnico.
 *
 * Só pra Server Components/Actions — depende de redirect() do
 * next/navigation. Middleware usa lib/services/role.ts em vez disso.
 */
export async function requireClientSession(supabase: SupabaseClient) {
  // Verifica se há um usuário autenticado na sessão atual
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Busca o perfil para checar se é técnico (técnicos usam /admin, não /dashboard)
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  if (profile?.role === 'technician') redirect('/admin')

  return { user, profile }
}

/**
 * Garante sessão de técnico autenticado nas rotas /admin/**.
 * Redireciona pra /admin/login se não autenticado ou não técnico.
 */
export async function requireTechnicianSession(supabase: SupabaseClient) {
  // Verifica autenticação — sem sessão vai para a tela de login do admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  // Busca o perfil para confirmar que o usuário tem role de técnico
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  if (profile?.role !== 'technician') redirect('/admin/login')

  return { user, profile }
}

/**
 * Garante sessão de técnico líder (profiles.role='technician' AND
 * is_leader=true) — o projeto não tem uma role "tecnico_lider" separada,
 * is_leader já cumpre esse papel (mesmo campo que restringe /admin/equipe).
 * Técnico comum autenticado é redirecionado pra /admin, não pra login.
 */
export async function requireLeaderSession(supabase: SupabaseClient) {
  // Reutiliza requireTechnicianSession para não duplicar a lógica de auth
  const { user, profile } = await requireTechnicianSession(supabase)
  // is_leader === true é a única distinção entre técnico comum e líder no banco
  if (profile?.is_leader !== true) redirect('/admin')
  return { user, profile }
}
