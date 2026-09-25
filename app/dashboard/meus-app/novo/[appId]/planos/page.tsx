import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { getStepCompletion } from '@/lib/services/app-draft-steps'
import PlanosClient from './PlanosClient'

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

  return (
    <PlanosClient
      appId={appId}
      appName={draft.name || 'Aplicativo sem nome'}
      initialPlans={(plans ?? []).map(p => ({
        id: p.id, name: p.name, currency: p.currency || 'BRL', price: p.price, billing_period: p.billing_period,
        features: p.features ?? [], users_limit: p.users_limit, support_level: p.support_level,
      }))}
      completion={{ 1: completion.step1, 2: completion.step2, 3: completion.step3 }}
    />
  )
}
