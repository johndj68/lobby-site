import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { getStepCompletion } from '@/lib/services/app-draft-steps'
import { derivePublicationStatus, deriveReviewStatus, type ApplicationRow, type SubmissionRow } from '@/lib/marketplace'
import AcompanharClient, { type ChecklistGroup } from './AcompanharClient'

export const metadata: Metadata = { title: 'Acompanhar aplicativo | LOBBY', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

// Mesma ideia de "grupo combinado" do editor (comecar/revisão): Mídia e
// Funcionalidades viram um grupo só na Preparação do anúncio porque é assim
// que a etapa 2 do wizard já apresenta as coisas — funcionalidades nunca
// bloqueia (é aviso, não obrigatório), então o grupo reflete o item que
// realmente bloqueia (mídia).
function combineGroup(id: string, label: string, icon: string, primary: { status: string; summary: string; editRoute: string; editTab?: string; issues: { message: string; editField?: string }[] }): ChecklistGroup {
  const state = primary.status === 'complete' ? 'complete' : primary.status === 'warning' ? 'complete' : 'pending'
  return {
    id, label, icon,
    state: state as ChecklistGroup['state'],
    summary: primary.issues[0]?.message ?? primary.summary,
    editRoute: primary.editRoute, editTab: primary.editTab, editField: primary.issues[0]?.editField,
  }
}

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
      id, name, short_description, logo_url, category, status, created_at, updated_at, last_edited_at, created_by, application_id, website_url,
      applications(id, slug, is_published, suspended_at, suspended_reason)
    `)
    .eq('id', appId)
    .maybeSingle()

  if (!draft) notFound()

  type DraftWithApp = typeof draft & { applications: ApplicationRow | ApplicationRow[] | null }
  const d = draft as DraftWithApp
  const application = Array.isArray(d.applications) ? (d.applications[0] ?? null) : d.applications

  const [{ data: submissions }, { data: membership }, completion] = await Promise.all([
    supabase.from('app_submissions')
      .select('id, app_draft_id, status, submitted_at, reviewed_at, reviewer_id, submitted_by, public_feedback, published_at')
      .eq('app_draft_id', appId).order('submitted_at', { ascending: false }),
    supabase.from('app_team_members').select('role, permissions').eq('app_draft_id', appId).eq('user_id', user.id).maybeSingle(),
    getStepCompletion(supabase, draft),
  ])
  const allSubmissions = (submissions ?? []) as (SubmissionRow & { published_at: string | null; public_feedback: string | null })[]

  const latestSubmission = allSubmissions[0] ?? null
  const publishedSubmission = allSubmissions.find(s => s.published_at) ?? null
  const publication = derivePublicationStatus(application)
  const review = deriveReviewStatus(latestSubmission, publication.key === 'publicado', publishedSubmission?.id ?? null)
  const isOwner = d.created_by === user.id
  const canEdit = isOwner || membership?.role === 'owner' || !!membership?.permissions?.includes('edit')

  // Toda mensagem pública já decidida vira um item na aba Mensagens — cada
  // uma amarrada à sua própria submissão (versão), nunca misturada com a
  // pendência da versão atual.
  const messages = allSubmissions.filter(s => s.reviewed_at && s.public_feedback)

  // Nome do dono (só quando o usuário está vendo via app_team_members) —
  // RLS de profiles só libera o próprio perfil; get_app_owners é a mesma RPC
  // (SECURITY DEFINER) já usada pela prévia e por esta página antes.
  type OwnerRow = { full_name: string | null; company_name: string | null }
  type ChecklistRow = { section: string; item_key: string; item_label: string; item_description: string | null; status: string }
  const [ownersRes, checklistRes, ownProfileRes] = await Promise.all([
    !isOwner
      ? supabase.rpc('get_app_owners', { p_app_draft_ids: [appId] }) as unknown as Promise<{ data: OwnerRow[] | null }>
      : Promise.resolve({ data: [] as OwnerRow[] }),
    latestSubmission
      ? supabase.rpc('get_submission_checklist_public', { p_submission_id: latestSubmission.id }) as unknown as Promise<{ data: ChecklistRow[] | null }>
      : Promise.resolve({ data: [] as ChecklistRow[] }),
    isOwner
      ? supabase.from('profiles').select('full_name, company_name').eq('id', user.id).single()
      : Promise.resolve({ data: null as OwnerRow | null }),
  ])
  const owners = ownersRes.data
  const checklist = checklistRes.data
  const organizationName = isOwner
    ? (ownProfileRes.data?.company_name || ownProfileRes.data?.full_name || null)
    : (owners?.[0] ? (owners[0].company_name || owners[0].full_name) : null)

  // Preparação do anúncio — só faz sentido enquanto o parceiro ainda pode
  // agir no rascunho (rascunho ou ajustes pedidos); em análise/aprovado/
  // publicado a "Checklist da versão enviada" (RPC acima) já cobre a
  // consulta, sem duplicar régua.
  const showDraftChecklist = review.key === 'rascunho' || review.key === 'ajustes_solicitados' || review.key === 'rejeitado'
  const byId = new Map(completion.review.items.map(i => [i.id, i]))
  const basicInfo = byId.get('basicInfo')!
  const media = byId.get('media')!
  const features = byId.get('features')!
  const offer = byId.get('offer')!
  const activation = byId.get('activation')!

  const checklistGroups: ChecklistGroup[] = showDraftChecklist ? [
    combineGroup('basicInfo', 'Produto e informações básicas', 'FileText', basicInfo),
    combineGroup('media', 'Mídia e funcionalidades', 'ImageIcon', media.status === 'complete' && features.status === 'warning' ? { ...media, issues: [] } : media),
    combineGroup('offer', 'Oferta e planos', 'Tag', offer),
    combineGroup('activation', 'Ativação e suporte', 'Package', activation),
    {
      id: 'review', label: 'Revisão e confirmações', icon: 'ListChecks',
      state: draft.status === 'changes_requested' ? 'pending' : latestSubmission ? 'complete' : (completion.step2 && completion.step3) ? 'in_progress' : 'not_started',
      summary: draft.status === 'changes_requested' ? 'A equipe pediu ajustes nesta versão.' : latestSubmission ? 'Enviado para análise.' : (completion.step2 && completion.step3) ? 'Pronto para revisar e enviar.' : 'Complete as etapas anteriores primeiro.',
      editRoute: 'revisao',
    },
  ] : []

  return (
    <AcompanharClient
      app={{
        id: d.id, name: d.name || 'Aplicativo sem nome', shortDescription: d.short_description, logoUrl: d.logo_url,
        category: d.category || null, updatedAt: d.last_edited_at ?? d.updated_at ?? d.created_at, createdAt: d.created_at,
        applicationSlug: application?.slug ?? null, suspendedReason: application?.suspended_reason ?? null,
        canEdit, isOwner, organizationName, websiteUrl: d.website_url,
      }}
      publication={publication}
      review={review}
      latestSubmission={latestSubmission ? { id: latestSubmission.id, submittedAt: latestSubmission.submitted_at, status: latestSubmission.status } : null}
      messages={messages.map(m => ({ id: m.id, text: m.public_feedback!, at: m.reviewed_at!, status: m.status, submittedAt: m.submitted_at }))}
      history={allSubmissions.map(s => ({ id: s.id, status: s.status, submittedAt: s.submitted_at, reviewedAt: s.reviewed_at, publishedAt: s.published_at }))}
      checklist={(checklist ?? []).map(c => ({
        section: c.section, itemKey: c.item_key, itemLabel: c.item_label, itemDescription: c.item_description, status: c.status,
      }))}
      checklistGroups={checklistGroups}
      nextStep={!completion.step2 ? 2 : !completion.step3 ? 3 : 4}
    />
  )
}
