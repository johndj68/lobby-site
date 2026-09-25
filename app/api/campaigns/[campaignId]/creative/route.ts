import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/** Mesma lógica de app/api/admin/campaigns/[campaignId]/creative/route.ts,
 *  mas gated por dono do app_draft em vez de técnico. cta_href nunca vem
 *  do cliente — sempre derivado do slug do app (seção 8). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, app_draft_id, app_drafts(created_by, applications(slug))')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })

  type AppRef = { created_by: string; applications: { slug: string } | { slug: string }[] | null }
  const draftRef = Array.isArray(campaign.app_drafts) ? campaign.app_drafts[0] : (campaign.app_drafts as AppRef | null)
  if (!draftRef || draftRef.created_by !== user.id) {
    return NextResponse.json({ error: 'Esta campanha não pertence a você.' }, { status: 403 })
  }
  const appRef = Array.isArray(draftRef.applications) ? draftRef.applications[0] : draftRef.applications
  const ctaHref = appRef?.slug ? `/app/${appRef.slug}` : null

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { title, description, imageUrl, imageAlt, ctaLabel } = body

  const { data: latest } = await supabase
    .from('ad_creatives')
    .select('id, version, review_status')
    .eq('campaign_id', campaignId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const payload = {
    title: typeof title === 'string' ? title.trim() || null : null,
    description: typeof description === 'string' ? description.trim() || null : null,
    image_url: typeof imageUrl === 'string' ? imageUrl : null,
    image_alt: typeof imageAlt === 'string' ? imageAlt.trim() || null : null,
    cta_label: typeof ctaLabel === 'string' && ctaLabel.trim() ? ctaLabel.trim() : 'Conhecer aplicativo',
    cta_href: ctaHref,
  }

  if (latest && (latest.review_status === 'rascunho' || latest.review_status === 'ajustes_solicitados')) {
    const { error } = await supabase.from('ad_creatives').update(payload).eq('id', latest.id)
    if (error) return NextResponse.json({ error: 'Não foi possível salvar o anúncio.' }, { status: 500 })
    return NextResponse.json({ ok: true, id: latest.id, version: latest.version })
  }

  const nextVersion = (latest?.version ?? 0) + 1
  const { data: created, error } = await supabase
    .from('ad_creatives')
    .insert({ campaign_id: campaignId, version: nextVersion, review_status: 'rascunho', created_by: user.id, ...payload })
    .select('id')
    .single()
  if (error || !created) return NextResponse.json({ error: 'Não foi possível criar a versão do anúncio.' }, { status: 500 })
  return NextResponse.json({ ok: true, id: created.id, version: nextVersion })
}
