import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import ConciliacaoClient from './ConciliacaoClient'

export default async function ConciliacaoPage() {
  const supabase = await createServerSupabaseClient()
  // Financeiro sensível — só líder, mesmo padrão de financeiro/repasses/contas.
  const { user, profile } = await requireLeaderSession(supabase)

  return <ConciliacaoClient user={user} profile={profile} />
}
