import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mensagens | LOBBY', robots: { index: false, follow: false } }

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import MensagensClient from './MensagensClient'
import type { ChatThread } from '@/types'

interface Props {
  searchParams: Promise<{ project?: string }>
}

export default async function DashboardMensagensPage({ searchParams }: Props) {
  const { project } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  const [{ data: messages }, { data: projects }] = await Promise.all([
    supabase
      .from('messages')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: true }),
    // Só projetos com técnico responsável viram uma thread — sem um
    // técnico aceitar, não tem com quem conversar sobre aquele projeto.
    supabase
      .from('client_projects')
      .select('id, title, lead_technician_id')
      .eq('client_id', user.id)
      .not('lead_technician_id', 'is', null)
      .order('updated_at', { ascending: false }),
  ])

  const techIds = [...new Set((projects ?? []).map(p => p.lead_technician_id).filter(Boolean))] as string[]
  const { data: techs } = techIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', techIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const techMap = Object.fromEntries((techs ?? []).map(t => [t.id, t]))

  const threads: ChatThread[] = (projects ?? []).map(p => ({
    projectId:       p.id,
    projectTitle:    p.title,
    technicianId:    p.lead_technician_id,
    technicianName:  techMap[p.lead_technician_id as string]?.full_name || techMap[p.lead_technician_id as string]?.email || null,
  }))

  return (
    <MensagensClient
      user={user}
      profile={profile}
      initialMessages={messages ?? []}
      threads={threads}
      initialProjectId={project ?? null}
    />
  )
}
