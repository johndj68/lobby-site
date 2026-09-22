import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

/** "MailCraft #2" -> "mailcraft-2". Sem acento, sem espaço, sem duplo hífen. */
function slugify(name: string): string {
  const base = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
  return base || 'app'
}

/**
 * applications.logo_url/preview_image_url viram <Image> na home (app/page.tsx),
 * e next/image só aceita hosts declarados em next.config.ts (images.remotePatterns
 * — hoje só o storage do Supabase). Uma URL de outro host não quebra a escrita
 * aqui, mas derruba a home inteira com 500 (visto ao vivo com um dado de teste
 * apontando pra via.placeholder.com). Preferível cair pra null a publicar algo
 * que derruba a home pública.
 */
function isAllowedImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const allowedHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
    return new URL(url).hostname === allowedHost
  } catch {
    return false
  }
}

/** Gera um slug único em applications.slug, tentando "-2", "-3"... antes de
 *  cair num sufixo aleatório. */
async function uniqueSlug(supabase: SupabaseClient, name: string): Promise<string> {
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
 * catálogo público realmente leem. Antes desta rota existir, "aprovar" só
 * marcava app_drafts.status='approved'; nada chegava a 'published', e
 * nada nunca escrevia em applications — um app aprovado nunca aparecia
 * de fato pro público. Ver app_drafts.application_id (FK 1:1 nova).
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
    .select('id, name, status, created_by, application_id, short_description, full_description, logo_url, category, media_gallery')
    .eq('id', draftId)
    .single()
  if (!draft) return NextResponse.json({ error: 'Aplicativo não encontrado.' }, { status: 404 })
  // Já publicado E já sincronizado com o catálogo público — nada a fazer.
  // (Se status='published' mas application_id ainda for null, é um publish
  // anterior que falhou na etapa de sincronizar applications — deixa cair
  // pras validações abaixo pra tentar de novo, em vez de travar num 409.)
  if (draft.status === 'published' && draft.application_id) {
    return NextResponse.json({ error: 'Este aplicativo já está publicado.' }, { status: 409 })
  }

  // 1) Versão aprovada — pega a submissão mais recente.
  const { data: submissions } = await supabase
    .from('app_submissions')
    .select('id, status')
    .eq('app_draft_id', draftId)
    .order('submitted_at', { ascending: false })
    .limit(1)
  const latestSubmission = submissions?.[0]
  if (!latestSubmission || latestSubmission.status !== 'approved') {
    return NextResponse.json({ error: 'O aplicativo precisa ter uma versão aprovada na revisão antes de ser publicado.' }, { status: 400 })
  }

  // 2) Ausência de bloqueios — issues de severidade "blocker" ainda não resolvidas.
  const { data: blockers } = await supabase
    .from('review_issues')
    .select('id')
    .eq('submission_id', latestSubmission.id)
    .eq('severity', 'blocker')
    .is('resolved_at', null)
  if (blockers && blockers.length > 0) {
    return NextResponse.json({ error: `Existem ${blockers.length} bloqueio(s) de revisão não resolvido(s).` }, { status: 400 })
  }

  // 3) Configuração comercial válida — pelo menos uma oferta cadastrada.
  const { data: plans } = await supabase
    .from('app_plans')
    .select('id, price, billing_period, currency')
    .eq('app_draft_id', draftId)
    .not('billing_period', 'is', null)
  if (!plans || plans.length === 0) {
    return NextResponse.json({ error: 'Cadastre pelo menos uma oferta (plano/preço) antes de publicar.' }, { status: 400 })
  }

  // 4) Entrega ou ativação disponível.
  const { data: activationConfig } = await supabase
    .from('app_activation_config')
    .select('id, activation_link, support_email')
    .eq('app_draft_id', draftId)
    .maybeSingle()
  if (!activationConfig || (!activationConfig.activation_link && !activationConfig.support_email)) {
    return NextResponse.json({ error: 'Configure a entrega/ativação do aplicativo (link ou e-mail de suporte) antes de publicar.' }, { status: 400 })
  }

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
    developer_name: developerName,
    logo_url: safeLogoUrl,
    preview_image_url: safePreviewUrl,
    price: singlePlan?.price ?? null,
    price_currency: singlePlan?.currency ?? 'BRL',
    billing_period: singlePlan?.billing_period ?? null,
    is_free: singlePlan ? (singlePlan.price === null || singlePlan.price === 0) : false,
    is_published: true,
    is_lobby_made: false,
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

  return NextResponse.json({ ok: true, app: draft.name, submissionId: latestSubmission.id, applicationId })
}
