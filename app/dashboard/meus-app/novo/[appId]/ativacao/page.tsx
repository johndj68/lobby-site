import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { notFound } from 'next/navigation'
import ActivationClient from './ActivationClient'

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

  // Lotes de código de ativação por plano — usado na aba "Planos e
  // preços" pra mostrar estoque disponível/entregue (gap 4).
  const { data: batches } = await supabase
    .from('app_activation_codes_batch')
    .select('id, plan_id, batch_name, total_codes, available, delivered, imported_at')
    .eq('app_draft_id', appId)
    .order('imported_at', { ascending: false })

  return (
    <ActivationClient
      draft={draft}
      config={config}
      plans={plans || []}
      batches={batches || []}
    />
  )
}
