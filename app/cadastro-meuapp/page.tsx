import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import NewAppFlow from '@/components/vendor/NewAppFlow'

export const metadata: Metadata = {
  title: 'Cadastro de App | LOBBY',
  description: 'Cadastre seu aplicativo no marketplace da LOBBY',
}

export default async function CadastroMeuAppPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/login?redirect=/cadastro-meuapp')
  }

  // Check user's organizations
  const { data: orgData } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)

  return <NewAppFlow user={user} hasOrganization={!!orgData?.[0]} />
}
