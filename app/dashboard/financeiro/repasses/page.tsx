import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import RepassesClient from './RepassesClient'

export const metadata: Metadata = { title: 'Repasses e extrato | LOBBY', robots: { index: false, follow: false } }

interface QueueRow {
  sale_id:          string
  sale_kind?:       'app_purchase' | 'subscription_invoice'
  application_name: string
  plan_name:        string
  net_amount:       number
  paid_at:          string
  release_date:     string
  days_remaining:   number
  status:           'retido' | 'elegivel'
}

interface HistoryRow {
  payout_id:        string
  reference:        string
  notes:            string | null
  payout_status:    'confirmado' | 'revertido'
  total_amount:     number
  created_at:        string
  reverted_at:       string | null
  revert_reason:     string | null
  item_id:           string | null
  item_kind:         'app_purchase_main' | 'app_purchase_reserve' | 'subscription_invoice' | null
  item_amount:        number | null
  application_name:   string | null
  plan_name:          string | null
  sale_paid_at:       string | null
}

type RpcResult<T> = { data: T | null; error: { message: string } | null }

export default async function FinanceiroRepassesPage() {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  const [mainRes, reserveRes, historyRes] = await Promise.all([
    supabase.rpc('get_partner_payout_queue_main'),
    supabase.rpc('get_partner_payout_queue_reserve'),
    supabase.rpc('get_partner_payout_history'),
  ]) as unknown as [RpcResult<QueueRow[]>, RpcResult<QueueRow[]>, RpcResult<HistoryRow[]>]

  return (
    <RepassesClient
      mainQueue={mainRes.data ?? []}
      mainError={!!mainRes.error}
      reserveQueue={reserveRes.data ?? []}
      reserveError={!!reserveRes.error}
      history={historyRes.data ?? []}
      historyError={!!historyRes.error}
    />
  )
}
