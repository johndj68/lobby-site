import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { getStepCompletion } from '@/lib/services/app-draft-steps'
import PlanosClient, { type PendingRequest } from './PlanosClient'

export const metadata: Metadata = { title: 'Oferta e planos | LOBBY', robots: { index: false, follow: false } }

export default async function PlanosPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  await requireClientSession(supabase)

  // RLS (dono ou app_team_members) decide o acesso.
  const { data: draft, error } = await supabase.from('app_drafts').select('*').eq('id', appId).single()
  if (error || !draft) notFound()

  const [{ data: plans }, completion] = await Promise.all([
    supabase.from('app_plans').select('*').eq('app_draft_id', appId).order('display_order', { ascending: true }),
    getStepCompletion(supabase, draft),
  ])

  const planIds = (plans ?? []).map(p => p.id)
  const { data: priceRequests } = planIds.length
    ? await supabase
        .from('plan_price_change_requests')
        .select('id, app_plan_id, status, current_price, requested_price, current_billing_period, requested_billing_period, review_notes')
        .in('app_plan_id', planIds)
        .order('created_at', { ascending: false })
    : { data: [] as never[] }

  // Pedido mais recente de cada plano (já veio ordenado desc) — só
  // pendente/rejeitado viram badge; aprovado já está refletido no
  // price/billing_period atual do plano, não precisa de badge.
  const seenPlanIds = new Set<string>()
  const pendingByPlan: Record<string, PendingRequest> = {}
  for (const r of priceRequests ?? []) {
    if (seenPlanIds.has(r.app_plan_id)) continue
    seenPlanIds.add(r.app_plan_id)
    if (r.status === 'pendente' || r.status === 'rejeitado') {
      pendingByPlan[r.app_plan_id] = {
        id: r.id, status: r.status as 'pendente' | 'rejeitado',
        current_price: r.current_price, requested_price: r.requested_price,
        current_billing_period: r.current_billing_period, requested_billing_period: r.requested_billing_period,
        review_notes: r.review_notes,
      }
    }
  }

  return (
    <PlanosClient
      appId={appId}
      appName={draft.name || 'Aplicativo sem nome'}
      initialPlans={(plans ?? []).map(p => ({
        id: p.id, name: p.name, currency: p.currency || 'BRL', price: p.price, billing_period: p.billing_period,
        features: p.features ?? [], users_limit: p.users_limit, support_level: p.support_level,
      }))}
      initialPendingByPlan={pendingByPlan}
      completion={{ 1: completion.step1, 2: completion.step2, 3: completion.step3 }}
    />
  )
}
