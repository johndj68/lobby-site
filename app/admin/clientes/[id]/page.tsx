import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireLeaderSession } from '@/lib/services/profile'
import AdminShell from '@/components/layout/AdminShell'
import ClienteDetalheClient from './ClienteDetalheClient'

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const FALLBACK: Metadata = { title: 'Cliente | LOBBY Admin', robots: { index: false, follow: false } }

  // generateMetadata roda separado do corpo da página — requireLeaderSession()
  // lá embaixo não protege esta função. Sem essa checagem, o nome/e-mail de
  // qualquer cliente vazava via <title> pra quem acessasse a URL sem ser líder.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return FALLBACK
  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) return FALLBACK

  const { data } = await createAdminClient()
    .from('profiles')
    .select('full_name, email')
    .eq('id', id)
    .single()
  const name = data?.full_name ?? data?.email ?? 'Cliente'
  return {
    title: `${name} | LOBBY Admin`,
    robots: { index: false, follow: false },
  }
}

export default async function ClienteDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireLeaderSession(supabase)
  const admin = createAdminClient()

  const [
    { data: clientProfile },
    { data: wallet },
    { data: projects },
    { data: purchases },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, email, company_name, interest_area, phone, document, onboarded, created_at')
      .eq('id', id)
      .single(),

    admin
      .from('client_credit_wallets')
      .select('balance, total_purchased, total_spent')
      .eq('user_id', id)
      .maybeSingle(),

    admin
      .from('client_projects')
      .select('id, title, status, progress, priority, deadline, created_at, updated_at')
      .eq('client_id', id)
      .order('updated_at', { ascending: false }),

    admin
      .from('credit_purchases')
      .select('id, credits_amount, amount_paid, currency, status, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!clientProfile) notFound()

  // Contacts are matched by email (contacts table has no user_id FK)
  const { data: contacts } = clientProfile.email
    ? await admin
        .from('contacts')
        .select('id, name, email, interest_area, message, created_at')
        .eq('email', clientProfile.email)
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: [] }

  return (
    <AdminShell user={user} profile={profile}>
      <ClienteDetalheClient
        clientProfile={clientProfile}
        wallet={wallet ?? null}
        projects={projects ?? []}
        purchases={purchases ?? []}
        contacts={contacts ?? []}
      />
    </AdminShell>
  )
}
