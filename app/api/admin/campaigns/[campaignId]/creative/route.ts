import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Cria ou atualiza a versão RASCUNHO do anúncio de uma campanha. Nunca
 * aceita cta_href do cliente — é sempre recalculado a partir do slug do
 * aplicativo da campanha, evitando link livre pra fora (seção 8).
 *
 * Se já existe uma versão rascunho/ajustes_solicitados, atualiza nela em vez
 * de criar uma nova a cada salvamento; só nasce versão nova quando a
 * anterior já foi enviada pra revisão (em_revisao/aprovado/rejeitado).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para editar anúncios.' }, { status: 403 })
  }

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, app_draft_id, app_drafts(applications(slug))')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })

  type AppRef = { applications: { slug: string } | { slug: string }[] | null }
  const draftRef = Array.isArray(campaign.app_drafts) ? campaign.app_drafts[0] : (campaign.app_drafts as AppRef | null)
  const appRef = draftRef ? (Array.isArray(draftRef.applications) ? draftRef.applications[0] : draftRef.applications) : null
  const ctaHref = appRef?.slug ? `/app/${appRef.slug}` : null

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { title, description, imageUrl, imageAlt, ctaLabel, internalNotes } = body

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
    internal_notes: typeof internalNotes === 'string' ? internalNotes.trim() || null : null,
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
