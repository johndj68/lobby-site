/* Cliente Supabase para uso em componentes client-side (navegador).
   Deve ser importado apenas em arquivos com "use client" ou em
   hooks/contextos que rodam no browser — nunca em Server Components.
   Usa as variáveis NEXT_PUBLIC_* que são expostas ao cliente,
   portanto NÃO inclua a service role key aqui. */

import { createBrowserClient } from '@supabase/ssr'

/* Cria e retorna uma instância do cliente Supabase configurada para
   o ambiente de browser. A função é chamada a cada vez que precisamos
   de acesso ao Supabase no lado do cliente (autenticação, leitura de
   dados em tempo real, uploads, etc.).
   As variáveis de ambiente com "!" indicam que são obrigatórias —
   a aplicação lançará erro em build se não estiverem definidas. */
export function createClient() {
  return createBrowserClient(
    // URL do projeto Supabase (ex.: https://xyzxyz.supabase.co)
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Chave anônima — permissões limitadas pelas RLS policies do banco
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Mesmas opções explícitas de cookie do cliente server (lib/supabase-server.ts)
      // — precisam bater, senão o browser e o servidor discordam sobre o cookie.
      cookieOptions: {
        sameSite: 'lax',
        secure:   process.env.NODE_ENV === 'production',
      },
    }
  )
}
