import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AcceptInviteClient from './AcceptInviteClient'

interface PageProps {
  params: Promise<{ appId: string }>
  searchParams: Promise<{ token: string }>
}

export default async function AcceptInvitePage({ params, searchParams }: PageProps) {
  const { appId } = await params
  const { token } = await searchParams

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get invitation details without accepting
  const tokenHash = await import('crypto').then(c => c.createHash('sha256').update(token).digest('hex'))

  // Só os campos que AcceptInviteClient de fato exibe/valida — este objeto
  // vira prop de Client Component, ou seja, é serializado no payload RSC
  // que chega no navegador. token_hash (e qualquer outro campo interno)
  // não tem motivo pra sair do servidor pra essa tela.
  const { data: invitation } = await supabase
    .from('app_team_invitations')
    .select('invited_email, expires_at, status, permissions, scope')
    .eq('token_hash', tokenHash)
    .single()

  if (!invitation) {
    redirect('/dashboard')
  }

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('name')
    .eq('id', appId)
    .single()

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AcceptInviteClient
        appId={appId}
        token={token}
        invitation={invitation}
        draft={draft}
        user={user}
      />
    </Suspense>
  )
}
