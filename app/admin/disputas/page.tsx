import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import DisputasClient, { type DisputeRow } from './DisputasClient'

export default async function DisputasPage() {
  const supabase = await createServerSupabaseClient()
  // Financeiro sensível — só líder, mesmo padrão de repasses/financeiro/créditos.
  const { user, profile } = await requireLeaderSession(supabase)

  const { data: disputes } = await supabase
    .from('payment_disputes')
    .select('*')
    .order('opened_at', { ascending: false })

  return (
    <DisputasClient
      user={user}
      profile={profile}
      disputes={(disputes ?? []) as DisputeRow[]}
    />
  )
}
