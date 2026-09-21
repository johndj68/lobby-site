import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { notFound } from 'next/navigation'
import TeamClient from './TeamClient'

export const metadata: Metadata = {
  title: 'Equipe | LOBBY',
  description: 'Gerencie seu time de desenvolvimento',
}

interface PageProps {
  params: Promise<{ appId: string }>
}

export default async function TeamPage({ params }: PageProps) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  // Load draft
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (!draft) notFound()

  return <TeamClient draft={draft} />
}
