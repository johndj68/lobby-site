import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { getStepCompletion } from '@/lib/services/app-draft-steps'
import { colors as C } from '@/lib/design-tokens'
import { formatDateTimeBR } from '@/lib/marketplace'
import type { CommercialContent, CommercialPlan } from '@/components/marketplace/AppCommercialView'
import PreviaClient, { type PreviaVersion } from './PreviaClient'

// Prévia é consulta autenticada de dado real — nunca deve virar página
// indexável nem ser servida por cache público (conteúdo pode ser rascunho
// ou versão ainda não aprovada de outro parceiro se a URL vazar).
export const metadata: Metadata = { title: 'Prévia do anúncio | LOBBY', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type RawPlan = { id: string; name: string; currency: string; price: number | null; billing_period: string | null; features: string[] | null; users_limit: number | null; support_level: string | null }
type RawActivation = { activation_method: string | null; activation_link: string | null; support_email: string | null; instructions: unknown } | null

function buildPlans(raw: unknown): CommercialPlan[] {
  // Envios antigos (antes de content_snapshot existir, ou de fixtures de
  // teste fora do fluxo real) podem trazer data.plans em formatos que não
  // são o array de linhas de app_plans — nunca travar a prévia por isso,
  // só tratar como "sem planos capturados nesta versão".
  if (!Array.isArray(raw)) return []
  return (raw as RawPlan[]).filter(p => p && typeof p === 'object' && typeof p.id === 'string').map(p => ({
    id: p.id, name: p.name, currency: p.currency || 'BRL', price: p.price ?? null,
    billingPeriod: p.billing_period ?? null, features: Array.isArray(p.features) ? p.features : [],
    usersLimit: p.users_limit ?? null, supportLevel: p.support_level ?? null,
  }))
}

function buildActivation(raw: RawActivation): CommercialContent['activation'] {
  if (!raw) return null
  const instructions = Array.isArray(raw.instructions)
    ? (raw.instructions as unknown[]).map(i => (typeof i === 'string' ? i : (i as { text?: string })?.text ?? '')).filter(Boolean)
    : []
  return { method: raw.activation_method, link: raw.activation_link, supportEmail: raw.support_email, instructions }
}

function buildContent(draftLike: Record<string, unknown>, developerName: string | null, plans: CommercialPlan[], activation: CommercialContent['activation']): CommercialContent {
  return {
    name: (draftLike.name as string) ?? null,
    developerName,
    category: (draftLike.category as string) ?? null,
    shortDescription: (draftLike.short_description as string) ?? null,
    fullDescription: (draftLike.full_description as string) ?? null,
    logoUrl: (draftLike.logo_url as string) ?? null,
    gallery: (draftLike.media_gallery as CommercialContent['gallery']) ?? [],
    videoUrl: (draftLike.video_url as string) ?? null,
    benefits: (draftLike.benefits as CommercialContent['benefits']) ?? [],
    features: (draftLike.features as CommercialContent['features']) ?? [],
    targetAudience: (draftLike.target_audience as string) ?? null,
    integrations: (draftLike.integrations as CommercialContent['integrations']) ?? [],
    platforms: (draftLike.platforms as string[]) ?? [],
    languages: (draftLike.languages as string[]) ?? [],
    requirements: (draftLike.requirements as string) ?? null,
    plans,
    activation,
    documentationUrl: (draftLike.documentation_url as string) ?? null,
    history: (draftLike.history as CommercialContent['history']) ?? [],
    trustSignals: (draftLike.trust_signals as CommercialContent['trustSignals']) ?? [],
    faq: (draftLike.faq as CommercialContent['faq']) ?? [],
  }
}

const VERSION_LABEL: Record<PreviaVersion, string> = { draft: 'Rascunho atual', submission: 'Versão enviada para análise', published: 'Versão publicada' }

export default async function PreviaAppPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: Promise<{ v?: string; submissionId?: string }> }) {
  const { appId } = await params
  const { v: versionParam, submissionId: submissionIdParam } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  // RLS (dono OU app_team_members) decide o acesso — trocar o id na URL pra
  // um app de outra organização simplesmente não retorna linha nenhuma.
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('*, applications(id, slug, is_published, suspended_at)')
    .eq('id', appId)
    .maybeSingle()

  if (!draft) notFound()

  const application = Array.isArray(draft.applications) ? (draft.applications[0] ?? null) : draft.applications

  const [{ data: membership }, { data: submissions }, { data: livePlans }, { data: liveActivation }] = await Promise.all([
    supabase.from('app_team_members').select('role, permissions').eq('app_draft_id', appId).eq('user_id', user.id).maybeSingle(),
    // Escopado por app_draft_id — um submissionId de outro aplicativo nunca aparece aqui.
    supabase.from('app_submissions').select('id, status, submitted_at, published_at, data, content_snapshot').eq('app_draft_id', appId).order('submitted_at', { ascending: false }),
    supabase.from('app_plans').select('*').eq('app_draft_id', appId).order('display_order', { ascending: true }),
    supabase.from('app_activation_config').select('*').eq('app_draft_id', appId).maybeSingle(),
  ])

  const isOwner = draft.created_by === user.id
  const canEdit = isOwner || membership?.role === 'owner' || !!membership?.permissions?.includes('edit')

  // Nome público do parceiro: RLS de profiles só libera o próprio perfil —
  // quando quem abre é um membro de equipe (não o dono), a leitura direta
  // voltaria nula. get_app_owners é a mesma RPC (SECURITY DEFINER) que a
  // página de acompanhamento já usa pra esse caso — nunca duplicar a regra.
  let developerName: string | null = null
  if (isOwner) {
    const { data: ownProfile } = await supabase.from('profiles').select('full_name, company_name').eq('id', user.id).single()
    developerName = ownProfile?.company_name || ownProfile?.full_name || null
  } else {
    const { data: owners } = await supabase.rpc('get_app_owners', { p_app_draft_ids: [appId] }) as { data: { company_name: string | null; full_name: string | null }[] | null }
    developerName = owners?.[0] ? (owners[0].company_name || owners[0].full_name) : null
  }

  const allSubmissions = submissions ?? []
  const latestSubmission = allSubmissions[0] ?? null
  const publishedSubmission = allSubmissions.find(s => s.published_at) ?? null

  const requested = (versionParam === 'draft' || versionParam === 'submission' || versionParam === 'published') ? versionParam : null
  const version: PreviaVersion = requested ?? (application?.is_published ? 'published' : latestSubmission ? 'submission' : 'draft')

  let targetSubmission: typeof latestSubmission | null = null
  let invalid = false
  if (version === 'submission') {
    targetSubmission = submissionIdParam ? (allSubmissions.find(s => s.id === submissionIdParam) ?? null) : latestSubmission
    if (!targetSubmission) invalid = true
  } else if (version === 'published') {
    targetSubmission = publishedSubmission
    if (!targetSubmission) invalid = true
  }

  const availableVersions = [
    { key: 'draft' as const, label: 'Rascunho', href: `/dashboard/meus-app/${appId}/previa?v=draft` },
    ...(latestSubmission ? [{ key: 'submission' as const, label: 'Enviada', href: `/dashboard/meus-app/${appId}/previa?v=submission&submissionId=${latestSubmission.id}` }] : []),
    ...(publishedSubmission ? [{ key: 'published' as const, label: 'Publicada', href: `/dashboard/meus-app/${appId}/previa?v=published` }] : []),
  ]

  if (invalid) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-lg font-bold" style={{ color: C.text }}>Esta versão não está disponível</p>
        <p className="mt-2 text-sm" style={{ color: C.textSecondary }}>
          {versionParam === 'submission' && submissionIdParam
            ? 'A versão enviada indicada não existe ou não pertence a este aplicativo.'
            : versionParam === 'published'
              ? 'Este aplicativo ainda não foi publicado.'
              : 'Este aplicativo ainda não tem uma versão enviada para análise.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {availableVersions.map(v => (
            <Link key={v.key} href={v.href} className="rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.text }}>
              Ver {v.label.toLowerCase()}
            </Link>
          ))}
          <Link href={`/dashboard/meus-app/${appId}`} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: C.primary }}>
            Voltar ao acompanhamento
          </Link>
        </div>
      </div>
    )
  }

  const plans = version === 'draft' ? buildPlans(livePlans) : buildPlans(targetSubmission?.data?.plans)
  const activation = version === 'draft' ? buildActivation(liveActivation) : buildActivation(targetSubmission?.data?.activation_config ?? null)
  const draftLike = version === 'draft' ? draft : (targetSubmission?.content_snapshot ?? targetSubmission?.data ?? {})
  const content = buildContent(draftLike, developerName, plans, activation)

  const versionDateISO = version === 'draft' ? (draft.last_edited_at ?? draft.updated_at ?? draft.created_at) : targetSubmission!.submitted_at
  const bannerNote = version === 'draft'
    ? 'As alterações deste rascunho ainda não foram publicadas.'
    : version === 'published'
      ? 'Esta prévia corresponde à versão publicada.'
      : `Esta é a versão enviada para análise em ${formatDateTimeBR(targetSubmission!.submitted_at)}.`

  const hasUnpublishedDraftChanges = !!application?.is_published && version !== 'published'

  const backHref = version === 'draft'
    ? { href: `/dashboard/meus-app/novo/${appId}/revisao`, label: 'Voltar à revisão' }
    : { href: `/dashboard/meus-app/${appId}`, label: 'Voltar ao acompanhamento' }

  const editAction = !canEdit ? null : version === 'draft'
    ? { href: `/dashboard/meus-app/novo/${appId}/editar`, label: 'Voltar ao editor' }
    : { href: `/dashboard/meus-app/novo/${appId}/editar`, label: 'Editar rascunho atual', note: 'Esta é uma versão estável. Para alterar o conteúdo, edite o rascunho atual — as mudanças só valem depois de um novo envio.' }

  const pendencies = version === 'draft'
    ? (await getStepCompletion(supabase, draft)).review.items.flatMap(item =>
        item.issues.filter(i => i.severity === 'blocked').map(i => ({ label: i.message, editRoute: i.editRoute ?? item.editRoute, editTab: i.editTab ?? item.editTab, editField: i.editField })))
    : []

  return (
    <PreviaClient
      appId={appId}
      appName={draft.name || 'Aplicativo sem nome'}
      version={version}
      versionLabel={VERSION_LABEL[version]}
      versionDateISO={versionDateISO}
      bannerNote={bannerNote}
      availableVersions={availableVersions}
      backHref={backHref}
      editAction={editAction}
      hasUnpublishedDraftChanges={hasUnpublishedDraftChanges}
      content={content}
      pendencies={pendencies}
      canEdit={canEdit}
    />
  )
}
