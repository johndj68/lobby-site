import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { getStepCompletion } from '@/lib/services/app-draft-steps'
import ComecarClient from './ComecarClient'

export const metadata: Metadata = { title: 'Começar | LOBBY', robots: { index: false, follow: false } }

export default async function ComecarPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { profile } = await requireClientSession(supabase)

  const { data: draft, error } = await supabase.from('app_drafts').select('*').eq('id', appId).single()
  if (error || !draft) notFound()

  const completion = await getStepCompletion(supabase, draft)

  return (
    <ComecarClient
      draft={{
        id: draft.id, name: draft.name, status: draft.status, websiteUrl: draft.website_url,
        createdAt: draft.created_at, lastEditedAt: draft.last_edited_at ?? draft.updated_at ?? draft.created_at,
      }}
      organizationName={profile?.company_name || profile?.full_name || null}
      completion={{ 1: completion.step1, 2: completion.step2, 3: completion.step3 }}
    />
  )
}
