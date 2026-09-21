import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { notFound } from 'next/navigation'
import ReviewClient from './ReviewClient'

export const metadata: Metadata = {
  title: 'Revisão | LOBBY',
  description: 'Revise seu aplicativo antes de enviar',
}

interface PageProps {
  params: Promise<{ appId: string }>
}

export default async function ReviewPage({ params }: PageProps) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  // Load draft
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (!draft) notFound()

  return <ReviewClient draft={draft} />
}
