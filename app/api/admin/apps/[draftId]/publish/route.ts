import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkPublishEligibility, isAllowedImageUrl, logAppAdminEvent, slugify } from '@/lib/services/app-publish'

/** Gera um slug único em applications.slug, tentando "-2", "-3"... antes de
 *  cair num sufixo aleatório. */
async function uniqueSlug(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, name: string): Promise<string> {
  const base = slugify(name)
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const { data } = await supabase.from('applications').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Publica um app do marketplace: seta app_drafts.status='published' E
 * sincroniza public.applications — a tabela que app/page.tsx (home) e o
 * catálogo público realmente leem. Ver app_drafts.application_id (FK 1:1).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const { draftId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para publicar aplicativos.' }, { status: 403 })
  }

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name, status, created_by, application_id, short_description, full_description, logo_url, category, category_id, media_gallery')
    .eq('id', draftId)
    .single()
  if (!draft) return NextResponse.json({ error: 'Aplicativo não encontrado.' }, { status: 404 })

  // A verdade sobre "publicado" é applications.is_published/suspended_at —
  // não app_drafts.status (esse só marca que o app já passou por um publish
  // alguma vez; suspender NUNCA mexe nele, de propósito, pra preservar
  // histórico). Checar status aqui bloquearia republicar um app suspenso
  // fora do fluxo de "Reativar" incorretamente ou vice-versa.
  if (draft.application_id) {
    const { data: existingApplication } = await supabase
      .from('applications')
      .select('is_published, suspended_at')
      .eq('id', draft.application_id)
      .single()
    if (existingApplication?.suspended_at) {
      return NextResponse.json({ error: 'Este aplicativo está suspenso. Use "Reativar" para publicá-lo de novo.' }, { status: 409 })
    }
    if (existingApplication?.is_published) {
      return NextResponse.json({ error: 'Este aplicativo já está publicado.' }, { status: 409 })
    }
  }

  const eligibility = await checkPublishEligibility(supabase, draftId)
  if (!eligibility.ok) return NextResponse.json({ error: eligibility.error }, { status: 400 })
  const { latestSubmission, plans } = eligibility

  // Nome público do parceiro — company_name se tiver, senão o nome da pessoa.
  const { data: partnerProfile } = await supabase
    .from('profiles')
    .select('full_name, company_name')
    .eq('id', draft.created_by)
    .single()
  const developerName = partnerProfile?.company_name || partnerProfile?.full_name || 'Parceiro LOBBY'

  // Múltiplas ofertas não cabem nas colunas price/billing_period (uma só
  // cada) de applications — mesma regra do resto do admin: não escolher uma
  // arbitrariamente. Com 1 oferta só, essa é a exibida publicamente.
  const singlePlan = plans.length === 1 ? plans[0] : null
  const mainImage = Array.isArray(draft.media_gallery)
    ? (draft.media_gallery as { type: string; url: string }[]).find(m => m.type === 'main')?.url
    : undefined
  const safeLogoUrl = isAllowedImageUrl(draft.logo_url) ? draft.logo_url : null
  const safePreviewUrl = isAllowedImageUrl(mainImage) ? mainImage : safeLogoUrl

  const applicationPayload = {
    name: draft.name || 'Sem nome',
    description: draft.full_description,
    short_description: draft.short_description,
    category: draft.category || 'Outros',
    category_id: draft.category_id ?? null,
    developer_name: developerName,
    logo_url: safeLogoUrl,
    preview_image_url: safePreviewUrl,
    price: singlePlan?.price ?? null,
    price_currency: singlePlan?.currency ?? 'BRL',
    billing_period: singlePlan?.billing_period ?? null,
    is_free: singlePlan ? (singlePlan.price === null || singlePlan.price === 0) : false,
    is_published: true,
    is_lobby_made: false,
    suspended_at: null,
    suspended_by: null,
    suspended_reason: null,
    updated_at: new Date().toISOString(),
  }

  let applicationId = draft.application_id as string | null
  if (applicationId) {
    const { error: appUpdateErr } = await supabase.from('applications').update(applicationPayload).eq('id', applicationId)
    if (appUpdateErr) {
      console.error('[publish] applications update', appUpdateErr)
      return NextResponse.json({ error: 'Falha ao atualizar o catálogo público. Tente novamente.' }, { status: 500 })
    }
  } else {
    const slug = await uniqueSlug(supabase, applicationPayload.name)
    const { data: created, error: appInsertErr } = await supabase
      .from('applications')
      .insert({ ...applicationPayload, slug })
      .select('id')
      .single()
    if (appInsertErr || !created) {
      console.error('[publish] applications insert', appInsertErr)
      return NextResponse.json({ error: 'Falha ao criar o registro no catálogo público. Tente novamente.' }, { status: 500 })
    }
    applicationId = created.id
  }

  // Guard `.eq('status', draft.status)` evita corrida se dois técnicos
  // clicarem publicar ao mesmo tempo (cobre tanto o publish novo quanto o
  // caso de reparo, já que draft.status é o valor lido no topo da rota).
  const { data: updated, error: updateErr } = await supabase
    .from('app_drafts')
    .update({ status: 'published', application_id: applicationId })
    .eq('id', draftId)
    .eq('status', draft.status)
    .select('id, status')
    .single()

  if (updateErr || !updated) {
    return NextResponse.json({ error: 'Não foi possível publicar agora — o status pode ter mudado em outra sessão. Recarregue e tente novamente.' }, { status: 409 })
  }

  await supabase
    .from('app_submissions')
    .update({ published_at: new Date().toISOString() })
    .eq('id', latestSubmission.id)

  await logAppAdminEvent(supabase, {
    appDraftId: draftId,
    applicationId,
    actorId: user.id,
    action: 'publish',
    previousStatus: draft.status,
    newStatus: 'published',
  })

  return NextResponse.json({ ok: true, app: draft.name, submissionId: latestSubmission.id, applicationId })
}
