import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Planos e Ofertas | LOBBY',
  description: 'Configure os planos do seu aplicativo',
}

interface PageProps {
  params: Promise<{ appId: string }>
}

export default async function PlanosPage({ params }: PageProps) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  // Load draft to verify ownership
  const { data: draft, error } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (error || !draft) {
    notFound()
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Planos e Ofertas (Etapa 3)</h1>
        <p className="text-gray-600 mb-6">Configure os planos de preço para seu aplicativo.</p>

        <div className="bg-white rounded-lg p-8 border border-gray-200">
          <p className="text-gray-600 mb-4">Etapa 3 em desenvolvimento. Por enquanto, você pode voltar para editar o aplicativo.</p>
          <a
            href={`/partner/novo/${appId}/editar`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            ← Voltar ao editor
          </a>
        </div>
      </div>
    </div>
  )
}
