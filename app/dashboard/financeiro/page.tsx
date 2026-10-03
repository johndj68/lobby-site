import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import VisaoGeralClient from './VisaoGeralClient'

export const metadata: Metadata = { title: 'Vendas e financeiro | LOBBY', robots: { index: false, follow: false } }

interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroVisaoGeralPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  // Apps pro filtro — mesma RPC já usada pela aba Vendas, lida aqui no
  // servidor só pra montar a lista inicial (o client refaz as próprias
  // buscas financeiras ao trocar período/app, mesmo padrão de
  // VendasClient.tsx).
  const { data: soldApps } = await supabase.rpc('get_partner_sold_apps', { p_partner_id: partnerId }) as unknown as { data: { application_id: string; application_name: string }[] | null }

  return <VisaoGeralClient partnerId={partnerId} apps={soldApps ?? []} userId={user.id} />
}
