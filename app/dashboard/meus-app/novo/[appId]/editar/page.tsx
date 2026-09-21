import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { notFound } from 'next/navigation'
import EditorClient from './EditorClient'

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
  const { user, profile } = await requireClientSession(supabase)

  // Load draft
  const { data: draft, error } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (error || !draft) {
    notFound()
  }

  return <EditorClient draft={draft} user={user} profile={profile} />
}
