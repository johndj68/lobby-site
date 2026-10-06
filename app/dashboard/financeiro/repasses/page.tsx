import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import RepassesClient from './RepassesClient'

export const metadata: Metadata = { title: 'Repasses e extrato | LOBBY', robots: { index: false, follow: false } }

interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroRepassesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  // Todo o resto da página busca dado client-side via RPC (mesmo padrão de
  // VisaoGeralClient/VendasClient) — permite "Atualizar" sem recarregar a
  // página e mantém uma única fonte de verdade (as RPCs, não duas
  // implementações server+client da mesma consulta).
  return <RepassesClient key={partnerId ?? 'self'} partnerId={partnerId} />
}
