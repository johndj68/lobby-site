import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'

export const metadata: Metadata = {
  title: 'Meus Aplicativos | LOBBY',
  description: 'Acompanhe seus aplicativos publicados.',
}

export default async function MyAppsPage() {
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold mb-2" style={{ color: colors.text }}>
          Meus Aplicativos
        </h1>
        <p style={{ color: colors.textSecondary }}>
          Aqui aparecerão os aplicativos que você publicou no marketplace.
        </p>
      </div>

      <div className="border-2 border-dashed rounded-2xl p-12 text-center" style={{ borderColor: colors.border }}>
        <p className="text-lg" style={{ color: colors.textSecondary }}>
          Nenhum aplicativo publicado ainda.
        </p>
        <a
          href="/dashboard/meus-app/novo"
          className="inline-block mt-4 px-6 py-2 rounded-lg text-white font-semibold"
          style={{ backgroundColor: colors.primary }}
        >
          Publicar novo app →
        </a>
      </div>
    </div>
  )
}
