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

export default async function FinanceiroVendasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)
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

  // CTA do estado vazio "nunca houve venda" — mesma lógica de
  // app/dashboard/financeiro/page.tsx (Visão geral), reaproveitada aqui
  // em vez de duplicada com critério diferente.
  const { data: drafts } = await supabase
    .from('app_drafts')
    .select('id, status')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const latestDraft = drafts?.[0] ?? null
  const emptyStateCta = !latestDraft
    ? { label: 'Cadastrar aplicativo', href: '/dashboard/meus-app/novo' }
    : latestDraft.status !== 'published'
      ? { label: 'Continuar cadastro', href: `/dashboard/meus-app/novo/${latestDraft.id}/editar` }
      : { label: 'Ver meus aplicativos', href: '/dashboard/meus-app' }

  return <VendasClient key={partnerId ?? 'self'} soldApps={data ?? []} partnerId={partnerId} emptyStateCta={emptyStateCta} />
}
