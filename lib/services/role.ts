import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lê só a role do usuário. Sem dependência de next/navigation de propósito
 * — usado pelo middleware.ts (Edge Runtime), que não pode chamar o
 * redirect() de Server Component; o middleware faz seu próprio
 * NextResponse.redirect com o valor retornado aqui.
 */
export async function getProfileRole(supabase: SupabaseClient, userId: string): Promise<string | undefined> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return data?.role
}
