import type { createServerSupabaseClient } from '@/lib/supabase-server'

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export class ApiAuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message)
  }
}

/**
 * Guard de líder pra Route Handler (não pode usar redirect() como
 * requireLeaderSession em Server Component — precisa devolver JSON com
 * status certo). Mesma regra de negócio (role='technician' + is_leader=true),
 * centralizada aqui em vez de repetida em cada rota nova de conciliação.
 */
export async function requireLeaderApi(supabase: ServerClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new ApiAuthError(401, 'Não autenticado.')

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    throw new ApiAuthError(403, 'Conciliação requer técnico líder.')
  }

  return { user, profile }
}
