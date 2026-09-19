/* Cliente Supabase para uso em Server Components e Route Handlers do Next.js.
   Diferente do cliente browser (supabase.ts), este lê e grava cookies via
   next/headers para manter a sessão do usuário entre requisições server-side.
   Deve ser chamado apenas em contextos que rodam no servidor (async Server
   Components, Server Actions, middleware). */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/* Cria e retorna uma instância do cliente Supabase configurada para o servidor.
   É async porque cookies() do Next.js retorna uma Promise nesta versão do App Router.
   O adapter de cookies passado ao createServerClient permite que o Supabase SSR
   leia o token de sessão dos cookies da requisição e renove-o quando necessário,
   mantendo o usuário autenticado entre navegações sem precisar de um redirect. */
export async function createServerSupabaseClient() {
  // Acessa o jar de cookies da requisição atual — disponível apenas no servidor
  const cookieStore = await cookies()

  return createServerClient(
    // URL do projeto Supabase — mesma variável usada pelo cliente browser
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Chave anônima — as RLS policies do banco controlam o que cada role pode acessar
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        /* Retorna todos os cookies da requisição para que o Supabase
           possa encontrar o token de sessão (sb-*-auth-token). */
        getAll() {
          return cookieStore.getAll()
        },
        /* Grava cookies de sessão atualizados na resposta (ex.: token renovado).
           O try/catch ignora erros que ocorrem quando setAll é chamado dentro de
           um Server Component puro — nesse contexto não é possível modificar
           headers/cookies, então a falha silenciosa é intencional. */
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component — ignored
          }
        },
      },
      // Explícito em vez de depender do default da lib (@supabase/ssr não
      // marca secure=true por padrão em nenhum ambiente): secure só em
      // produção pra não quebrar dev local em http.
      cookieOptions: {
        sameSite: 'lax',
        secure:   process.env.NODE_ENV === 'production',
      },
    }
  )
}
