import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import ConfiguracoesRecebimentoClient from './ConfiguracoesRecebimentoClient'

export const metadata: Metadata = { title: 'Configurações de recebimento | LOBBY', robots: { index: false, follow: false } }

interface SearchParams {
  parceiro?: string
}

export default async function FinanceiroConfiguracoesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)
  const sp = await searchParams
  const partnerId = sp.parceiro || null

  // Client-side fetch (mesmo padrão das outras abas desta sessão) — permite
  // refletir na hora uma edição feita agora mesmo (sem recarregar a página)
  // e checar permissão (financeiro_configuracoes) de verdade via RPC.
  return <ConfiguracoesRecebimentoClient key={partnerId ?? 'self'} partnerId={partnerId} />
}
