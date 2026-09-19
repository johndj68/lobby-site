import type { SupabaseClient } from '@supabase/supabase-js'

// Sentinela pra thread "Suporte geral" (sem projeto) — precisa bater
// exatamente com o default da coluna project_id em supabase/migrations/
// 20260826140000_typing_status_table.sql (colunas de PK não aceitam null).
export const GENERAL_THREAD_ID = '00000000-0000-0000-0000-000000000000'

export type TypingRole = 'client' | 'technician'

export interface TypingStatusRow {
  client_id:  string
  project_id: string
  role:       TypingRole
  typing:     boolean
  updated_at: string
}

/** Publica (upsert) o estado local de "digitando" na thread ativa. */
export async function setTypingStatus(
  sb:        SupabaseClient,
  clientId:  string,
  projectId: string | null,
  role:      TypingRole,
  typing:    boolean,
): Promise<void> {
  await sb.from('typing_status').upsert(
    {
      client_id:  clientId,
      project_id: projectId ?? GENERAL_THREAD_ID,
      role,
      typing,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,project_id,role' },
  )
}
