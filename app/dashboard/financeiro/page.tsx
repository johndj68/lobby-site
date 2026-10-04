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

  // CTA adaptada pro estado "sem vendas" (seção 11 do pedido) — mesma
  // lógica de app_drafts por created_by/status já usada em
  // app/dashboard/meus-app/MeusAppsClient.tsx pra decidir "Continuar
  // cadastro" vs "Ver meus aplicativos".
  const { data: drafts } = await supabase
    .from('app_drafts')
    .select('id, status')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const latestDraft = drafts?.[0] ?? null
  const emptyStateCta = !latestDraft
    ? { label: 'Cadastrar meu aplicativo', href: '/dashboard/meus-app/novo' }
    : latestDraft.status !== 'published'
      ? { label: 'Continuar cadastro', href: `/dashboard/meus-app/novo/${latestDraft.id}/editar` }
      : { label: 'Ver meus aplicativos', href: '/dashboard/meus-app' }

  return <VisaoGeralClient key={partnerId ?? 'self'} partnerId={partnerId} apps={soldApps ?? []} emptyStateCta={emptyStateCta} />
}
