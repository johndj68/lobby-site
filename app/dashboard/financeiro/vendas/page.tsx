import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import VendasClient from './VendasClient'

export const metadata: Metadata = { title: 'Vendas | LOBBY', robots: { index: false, follow: false } }

interface SoldApp {
  application_id:   string
  application_name: string
}

export default async function FinanceiroVendasPage() {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  const { data } = await supabase.rpc('get_partner_sold_apps') as unknown as { data: SoldApp[] | null }

  return <VendasClient soldApps={data ?? []} />
}
