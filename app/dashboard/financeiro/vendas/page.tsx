import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'
import VendasClient from './VendasClient'

export const metadata: Metadata = { title: 'Vendas | LOBBY', robots: { index: false, follow: false } }

interface SoldApp {
  application_id:   string
  application_name: string
}

interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroVendasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  const { data, error } = await supabase.rpc('get_partner_sold_apps', { p_partner_id: partnerId }) as unknown as { data: SoldApp[] | null; error: unknown }

  if (error) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-bold" style={{ color: colors.text }}>Vendas</h2>
        <p className="text-sm" style={{ color: colors.textSecondary }}>Não foi possível carregar o filtro de apps. Tente novamente em instantes.</p>
      </div>
    )
  }

  return <VendasClient soldApps={data ?? []} partnerId={partnerId} />
}
