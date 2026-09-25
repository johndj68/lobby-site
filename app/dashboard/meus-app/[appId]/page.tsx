import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { derivePublicationStatus, deriveReviewStatus, type ApplicationRow, type SubmissionRow } from '@/lib/marketplace'
import AcompanharClient from './AcompanharClient'

export const metadata: Metadata = { title: 'Acompanhar aplicativo | LOBBY', robots: { index: false, follow: false } }

export default async function AcompanharAppPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  // RLS (dono OU app_team_members) decide o que este usuário pode ver —
  // sem filtro extra por created_by aqui. Se não tiver acesso, a linha
  // simplesmente não volta e cai no notFound() abaixo.
  const { data: draft } = await supabase
    .from('app_drafts')
    .select(`
      id, name, short_description, logo_url, category, status, created_at, updated_at, created_by, application_id,
      applications(id, slug, is_published, suspended_at, suspended_reason)
    `)
    .eq('id', appId)
    .maybeSingle()

  if (!draft) notFound()

  type DraftWithApp = typeof draft & { applications: ApplicationRow | ApplicationRow[] | null }
  const d = draft as DraftWithApp
  const application = Array.isArray(d.applications) ? (d.applications[0] ?? null) : d.applications

  const { data: submissions } = await supabase
    .from('app_submissions')
    .select('id, app_draft_id, status, submitted_at, reviewed_at, reviewer_id, submitted_by, public_feedback, published_at')
    .eq('app_draft_id', appId)
    .order('submitted_at', { ascending: false })
  const allSubmissions = (submissions ?? []) as (SubmissionRow & { published_at: string | null; public_feedback: string | null })[]

  const { data: membership } = await supabase
    .from('app_team_members').select('role, permissions').eq('app_draft_id', appId).eq('user_id', user.id).maybeSingle()

  const latestSubmission = allSubmissions[0] ?? null
  const publishedSubmission = allSubmissions.find(s => s.published_at) ?? null
  const publication = derivePublicationStatus(application)
  const review = deriveReviewStatus(latestSubmission, publication.key === 'publicado', publishedSubmission?.id ?? null)
  const isOwner = d.created_by === user.id
  const canEdit = isOwner || membership?.role === 'owner' || !!membership?.permissions?.includes('edit')

  // Mensagem pública mais recente já DECIDIDA (não expõe internal_notes) —
  // se a submissão atual ainda não foi revisada, não existe mensagem ainda.
  const latestDecided = allSubmissions.find(s => s.reviewed_at) ?? null

  // Nome do dono (só quando o usuário está vendo via app_team_members) e
  // checklist da versão atual — ambos via RPC estreita (o dono/nome geral e
  // o checklist com `note` interno continuam fora de alcance direto).
  type OwnerRow = { app_draft_id: string; owner_id: string; full_name: string | null; company_name: string | null }
  type ChecklistRow = { section: string; item_key: string; item_label: string; item_description: string | null; status: string }
  const [ownersRes, checklistRes] = await Promise.all([
    !isOwner
      ? supabase.rpc('get_app_owners', { p_app_draft_ids: [appId] }) as unknown as Promise<{ data: OwnerRow[] | null }>
      : Promise.resolve({ data: [] as OwnerRow[] }),
    latestSubmission
      ? supabase.rpc('get_submission_checklist_public', { p_submission_id: latestSubmission.id }) as unknown as Promise<{ data: ChecklistRow[] | null }>
      : Promise.resolve({ data: [] as ChecklistRow[] }),
  ])
  const owners = ownersRes.data
  const checklist = checklistRes.data
  const ownerName = owners?.[0] ? (owners[0].company_name || owners[0].full_name) : null

  return (
    <AcompanharClient
      app={{
        id: d.id, name: d.name || 'Aplicativo sem nome', shortDescription: d.short_description, logoUrl: d.logo_url,
        category: d.category || 'Não definida', updatedAt: d.updated_at || d.created_at, applicationSlug: application?.slug ?? null,
        suspendedReason: application?.suspended_reason ?? null, canEdit, ownerName,
      }}
      publication={publication}
      review={review}
      latestSubmission={latestSubmission ? {
        id: latestSubmission.id, submittedAt: latestSubmission.submitted_at, status: latestSubmission.status,
      } : null}
      latestMessage={latestDecided ? { text: latestDecided.public_feedback, at: latestDecided.reviewed_at } : null}
      history={allSubmissions.map(s => ({ id: s.id, status: s.status, submittedAt: s.submitted_at, reviewedAt: s.reviewed_at }))}
      checklist={(checklist ?? []).map(c => ({
        section: c.section, itemKey: c.item_key, itemLabel: c.item_label, itemDescription: c.item_description, status: c.status,
      }))}
    />
  )
}
