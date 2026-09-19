import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import FinanceiroClient from './FinanceiroClient'
import type { FinancialTransaction } from '@/types'
import type { PendingEbookPurchase } from '@/lib/ebooks'

export default async function FinanceiroPage() {
  const supabase = await createServerSupabaseClient()
  // Só técnico líder passa daqui — cliente, técnico comum e não
  // autenticado são redirecionados dentro de requireLeaderSession.
  const { user, profile } = await requireLeaderSession(supabase)

  const { data: transactions } = await supabase
    .from('financial_transactions')
    .select('*')
    .order('sale_date', { ascending: false })
    .limit(500)

  // Compras de e-books ainda não confirmadas — sem gateway real, o líder
  // confirma manualmente aqui, o que também lança em financial_transactions.
  const { data: pending } = await supabase
    .from('ebook_purchases')
    .select('id, ebook_id, user_id, amount, status, created_at, resource_metadata(title), profiles(full_name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const pendingPurchases: PendingEbookPurchase[] = (pending ?? []).map((p) => {
    const row = p as unknown as {
      id: string; ebook_id: string; user_id: string; amount: number; status: 'pending'; created_at: string
      resource_metadata: { title: string } | null
      profiles: { full_name: string | null; email: string | null } | null
    }
    return {
      id: row.id, ebook_id: row.ebook_id, user_id: row.user_id, amount: row.amount,
      status: row.status, created_at: row.created_at,
      ebook_title: row.resource_metadata?.title ?? 'E-book removido',
      buyer_name:  row.profiles?.full_name ?? null,
      buyer_email: row.profiles?.email ?? null,
    }
  })

  return (
    <FinanceiroClient
      user={user}
      profile={profile}
      initialTransactions={(transactions ?? []) as FinancialTransaction[]}
      initialPendingPurchases={pendingPurchases}
    />
  )
}
