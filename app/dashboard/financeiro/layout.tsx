import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import FinanceiroSellerGate from './FinanceiroSellerGate'

interface ViewablePartner {
  partner_id:    string
  partner_label: string
}

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  // user/profile não são usados aqui — o layout raiz (app/dashboard/
  // layout.tsx) já fez essa mesma checagem e já monta o DashboardShell
  // pra toda rota /dashboard/**. Esta chamada é só pra garantir a sessão
  // antes de usar `supabase` nas queries abaixo (RLS/RPC exigem
  // usuário autenticado).
  await requireClientSession(supabase)

  // Mesma query (sem filtro explícito por usuário) de app/dashboard/meus-app/
  // page.tsx — a RLS de app_drafts já restringe a "próprio OU membro de
  // app_team_members". Qualquer linha = o usuário já vende pelo menos um app.
  const { data: drafts } = await supabase.from('app_drafts').select('id').limit(1)
  const isSeller = (drafts?.length ?? 0) > 0

  // Etapa 5: donos cujo financeiro este usuário pode ver via permissão
  // de equipe (role=owner ou qualquer capacidade financeiro_*) — popula
  // o seletor do FinanceiroSellerGate. Falha aqui não deve quebrar a
  // página inteira (o usuário ainda pode ver o próprio financeiro) —
  // só o seletor fica vazio.
  const { data: viewablePartners } = await supabase.rpc('get_financeiro_viewable_partners') as unknown as { data: ViewablePartner[] | null }

  return (
    <FinanceiroSellerGate isSeller={isSeller} viewablePartners={viewablePartners ?? []}>
      {children}
    </FinanceiroSellerGate>
  )
}
