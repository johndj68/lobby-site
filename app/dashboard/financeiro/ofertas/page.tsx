import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import OfertasPromocoesClient from './OfertasPromocoesClient'

export const metadata: Metadata = { title: 'Ofertas e promoções | LOBBY', robots: { index: false, follow: false } }

interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroOfertasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  // Todo o resto busca client-side via RPC (mesmo padrão de
  // VisaoGeralClient/VendasClient/RepassesClient) — permite "Atualizar"
  // sem recarregar a página e corrige a lacuna real de antes: o admin
  // aprovava/rejeitava e o parceiro só via o estado novo se recarregasse
  // a página inteira (aqui era puramente server-fetch-once).
  return <OfertasPromocoesClient key={partnerId ?? 'self'} partnerId={partnerId} />
}
