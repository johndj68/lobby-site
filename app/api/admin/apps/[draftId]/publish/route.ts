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

    // applications não tem coluna de dono própria — app_drafts.application_id
    // é a única fonte de "a quem pertence" essa linha. draft.application_id
    // só deveria ter sido setado por um publish anterior DESTE MESMO draft.
    // Se outro draft (de outro parceiro, por exemplo) já reivindicou esse
    // mesmo application_id, reutilizá-lo aqui sobrescreve o conteúdo de
    // quem realmente é dono. Esta é só a checagem rápida pra devolver um
    // erro amigável antes de montar o payload inteiro — a RPC abaixo
    // repete a MESMA checagem dentro da transação (TOCTOU-safe de verdade,
    // já que entre esta leitura e a chamada da RPC outra requisição ainda
    // pode ter mudado o estado).
    const { data: conflictingDraft } = await supabase
      .from('app_drafts')
      .select('id')
      .eq('application_id', draft.application_id)
      .neq('id', draftId)
      .maybeSingle()
    if (conflictingDraft) {
      console.error('[publish] application_id conflict', { draftId, applicationId: draft.application_id, conflictingDraft: conflictingDraft.id })
      return NextResponse.json({ error: 'Este aplicativo já está vinculado a outro rascunho. Não é possível publicar.' }, { status: 409 })
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
  }

  const existingApplicationId = draft.application_id as string | null
  // Slug só é gerado (e só importa) na criação — reaproveitar um
  // application_id existente nunca muda o slug já publicado.
  const slug = existingApplicationId ? null : await uniqueSlug(supabase, applicationPayload.name)

  // Escreve applications + app_drafts dentro de uma única transação no
  // banco (publish_app_draft, migration 20261105110000) — antes eram duas
  // chamadas de rede separadas, e um crash entre elas podia deixar um app
  // publicado no catálogo sem o link de volta pro draft, e um retry criava
  // um SEGUNDO registro em applications pro mesmo draft (listing
  // duplicado/fantasma). A função também repete a checagem de conflito de
  // application_id dentro da transação, fechando o TOCTOU da checagem
  // acima.
  const { data: publishResult, error: publishError } = await supabase.rpc('publish_app_draft', {
    p_draft_id: draftId,
    p_expected_status: draft.status,
    p_application_id: existingApplicationId,
    p_slug: slug,
    p_name: applicationPayload.name,
    p_description: applicationPayload.description,
    p_short_description: applicationPayload.short_description,
    p_category: applicationPayload.category,
    p_category_id: applicationPayload.category_id,
    p_developer_name: applicationPayload.developer_name,
    p_logo_url: applicationPayload.logo_url,
    p_preview_image_url: applicationPayload.preview_image_url,
    p_price: applicationPayload.price,
    p_price_currency: applicationPayload.price_currency,
    p_billing_period: applicationPayload.billing_period,
    p_is_free: applicationPayload.is_free,
  })

  if (publishError || !publishResult) {
    console.error('[publish] publish_app_draft rpc', publishError)
    const message = publishError?.message.includes('vinculado a outro rascunho')
      ? publishError.message
      : publishError?.message.includes('Recarregue')
        ? publishError.message
        : 'Não foi possível publicar agora. Tente novamente.'
    return NextResponse.json({ error: message }, { status: 409 })
  }

  const applicationId = (publishResult as { application_id: string }).application_id

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
