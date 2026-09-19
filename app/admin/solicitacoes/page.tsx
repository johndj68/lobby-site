import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import SolicitacoesClient from './SolicitacoesClient'

export interface Contact {
  id:            string
  name:          string
  email:         string
  phone?:        string
  company?:      string
  interest_area?: string
  message:       string
  created_at:    string
  status?:       string   // novo | em_analise | respondido | arquivado
  priority?:     string   // alta | media | baixa
  assignee_id?:  string   // id do técnico atribuído
}

export interface ResponseTemplate {
  id:      string
  title:   string
  subject: string
  body:    string
}

export interface ContactResponse {
  id:            string
  contact_id:    string
  technician_id: string | null
  subject:       string
  message:       string
  is_draft:      boolean
  sent_at:       string | null
  created_at:    string
}

export interface ContactActivity {
  id:            string
  contact_id:    string
  technician_id: string | null
  action:        string
  note:          string | null
  created_at:    string
}

export default async function SolicitacoesPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  const isLeader = profile?.is_leader === true

  // Busca contatos, técnicos, modelos de resposta e histórico em paralelo
  const [
    { data: contacts },
    { data: technicians },
    { data: templates },
    { data: responses },
    { data: activity },
  ] = await Promise.all([
    (() => {
      const q = supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
      // Líder vê todas; técnico regular vê só não atribuídas + as suas
      return isLeader ? q : q.or(`assignee_id.is.null,assignee_id.eq.${user.id}`)
    })(),

    // Lista todos os técnicos disponíveis para atribuição
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'technician')
      .order('full_name', { ascending: true }),

    supabase
      .from('response_templates')
      .select('id, title, subject, body')
      .order('sort_order', { ascending: true }),

    supabase
      .from('contact_responses')
      .select('*')
      .order('created_at', { ascending: false }),

    supabase
      .from('contact_activity')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  const responsesByContact = (responses ?? []).reduce<Record<string, ContactResponse[]>>((acc, r) => {
    (acc[r.contact_id] ??= []).push(r)
    return acc
  }, {})

  const activityByContact = (activity ?? []).reduce<Record<string, ContactActivity[]>>((acc, a) => {
    (acc[a.contact_id] ??= []).push(a)
    return acc
  }, {})

  return (
    <SolicitacoesClient
      user={user}
      profile={profile}
      isLeader={isLeader}
      contacts={contacts ?? []}
      technicians={technicians ?? []}
      templates={templates ?? []}
      responses={responsesByContact}
      activity={activityByContact}
    />
  )
}
