import 'server-only'
import { createClient } from '@supabase/supabase-js'

// SERVER-ONLY. Nunca importar em componente 'use client' ou em módulo
// alcançável pelo bundle do client — usa a service role key, que bypassa RLS.
// O import 'server-only' acima faz o build falhar (em vez de só confiar no
// comentário) se este módulo algum dia acabar puxado por um bundle de client.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.')
}

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
