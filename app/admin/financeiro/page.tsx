import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireLeaderSession } from '@/lib/services/profile'
import FinanceiroClient from './FinanceiroClient'
import type { FinancialTransaction } from '@/types'
import type { PendingEbookPurchase } from '@/lib/ebooks'
import type { PaidEbookPurchase } from '@/components/admin/finance/RefundEbookPurchaseModal'
import type { PaidAppPurchase } from '@/components/admin/finance/RefundAppPurchaseModal'

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

  // E-books já pagos (via crédito ou manual) — mostrados pra permitir
  // reembolso; ebook via crédito nunca aparece em financial_transactions
  // (consumo de crédito não é receita nova, Etapa 2), então precisa vir
  // direto de ebook_purchases pra ter ação de reembolso em algum lugar.
  const { data: paid } = await supabase
    .from('ebook_purchases')
    .select('id, ebook_id, amount, payment_provider, resource_metadata(title), profiles(full_name, email)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(200)

  const paidEbookPurchases: PaidEbookPurchase[] = (paid ?? []).map((p) => {
    const row = p as unknown as {
      id: string; amount: number; payment_provider: string | null
      resource_metadata: { title: string } | null
      profiles: { full_name: string | null; email: string | null } | null
    }
    return {
      id: row.id, amount: row.amount, payment_provider: row.payment_provider,
      ebook_title: row.resource_metadata?.title ?? 'E-book removido',
      buyer_name:  row.profiles?.full_name ?? null,
      buyer_email: row.profiles?.email ?? null,
    }
  })

  // Apps vendidos (status='paid') — mostrados pra permitir reembolso via
  // Stripe. Inclui apps da própria LOBBY e de parceiro (partner_id nulo
  // ou não) — o reembolso funciona pros dois casos.
  const { data: paidApps } = await supabase
    .from('app_purchases')
    .select('id, application_name, plan_name, amount, refunded_amount, refund_status, paid_at, refund_window_days, profiles!app_purchases_buyer_user_id_fkey(full_name, email)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(200)

  const paidAppPurchases: PaidAppPurchase[] = (paidApps ?? []).map((p) => {
    const row = p as unknown as {
      id: string; application_name: string; plan_name: string; amount: number
      refunded_amount: number; refund_status: 'processing' | 'refunded' | null; paid_at: string
      refund_window_days: number
      profiles: { full_name: string | null; email: string | null } | null
    }
    return {
      id: row.id, application_name: row.application_name, plan_name: row.plan_name,
      amount: row.amount, refunded_amount: row.refunded_amount, refund_status: row.refund_status,
      paid_at: row.paid_at, refund_window_days: row.refund_window_days,
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
      initialPaidEbookPurchases={paidEbookPurchases}
      initialPaidAppPurchases={paidAppPurchases}
    />
  )
}
