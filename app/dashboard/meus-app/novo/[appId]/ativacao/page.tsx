import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Ativação e Entrega | LOBBY',
  description: 'Configure como seus clientes vão acessar o aplicativo',
}

interface PageProps {
  params: Promise<{ appId: string }>
}

export default async function AtivacaoPage({ params }: PageProps) {
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

  // Load activation config
  const { data: config } = await supabase
    .from('app_activation_config')
    .select('*')
    .eq('app_draft_id', appId)
    .single()

  // Load plans
  const { data: plans } = await supabase
    .from('app_plans')
    .select('*')
    .eq('app_draft_id', appId)
    .order('display_order')

  return (
    <div>
      <h1>Ativação e entrega</h1>
      <p>Carregando...</p>
    </div>
  )
}
