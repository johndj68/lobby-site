import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { notFound } from 'next/navigation'
import EditorClient from './EditorClient'
import { getStepCompletion } from '@/lib/services/app-draft-steps'

export const metadata: Metadata = {
  title: 'Editor de Aplicativo | LOBBY',
  description: 'Edite as informações do seu aplicativo',
}

interface PageProps {
  params: Promise<{ appId: string }>
}

export default async function EditorPage({ params }: PageProps) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { profile } = await requireClientSession(supabase)

  // RLS (dono ou app_team_members) decide o acesso — sem filtro extra por
  // created_by aqui; ver migração 20260925150000.
  const { data: draft, error } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('id', appId)
    .single()

  if (error || !draft) {
    notFound()
  }

  const completion = await getStepCompletion(supabase, draft)
  const reviewByTab: Record<string, 'complete' | 'pending' | 'optional' | 'warning' | undefined> = {
    basico: completion.review.items.find(i => i.id === 'basicInfo')?.status,
    media: completion.review.items.find(i => i.id === 'media')?.status,
    features: completion.review.items.find(i => i.id === 'features')?.status,
    history: completion.review.items.find(i => i.id === 'history')?.status,
    signals: completion.review.items.find(i => i.id === 'signals')?.status,
    faq: completion.review.items.find(i => i.id === 'faq')?.status,
  }

  return (
    <EditorClient
      draft={draft}
      vendorName={profile?.company_name || profile?.full_name || null}
      completion={{ 1: completion.step1, 2: completion.step2, 3: completion.step3 }}
      reviewByTab={reviewByTab}
    />
  )
}
