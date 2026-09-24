import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** Envia o anúncio da própria campanha pra revisão do admin. */
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
    .select('id, app_draft_id, application_id, app_drafts(created_by)')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  const draftRef = Array.isArray(campaign.app_drafts) ? campaign.app_drafts[0] : (campaign.app_drafts as { created_by: string } | null)
  if (!draftRef || draftRef.created_by !== user.id) {
    return NextResponse.json({ error: 'Esta campanha não pertence a você.' }, { status: 403 })
  }

  const { data: latest } = await supabase
    .from('ad_creatives')
    .select('id, review_status, title, image_url')
    .eq('campaign_id', campaignId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) return NextResponse.json({ error: 'Crie o anúncio antes de enviar para revisão.' }, { status: 400 })
  if (latest.review_status !== 'rascunho' && latest.review_status !== 'ajustes_solicitados') {
    return NextResponse.json({ error: 'Esta versão já foi enviada para revisão.' }, { status: 409 })
  }
  if (!latest.title || !latest.image_url) {
    return NextResponse.json({ error: 'Preencha ao menos título e imagem antes de enviar para revisão.' }, { status: 400 })
  }

  const { error } = await supabase.from('ad_creatives').update({ review_status: 'em_revisao' }).eq('id', latest.id)
  if (error) return NextResponse.json({ error: 'Não foi possível enviar para revisão.' }, { status: 500 })

  await logAppAdminEvent(createAdminClient(), {
    appDraftId: campaign.app_draft_id, applicationId: campaign.application_id, campaignId,
    actorId: user.id, action: 'submit_creative', reason: null,
    previousStatus: latest.review_status, newStatus: 'em_revisao',
  })

  return NextResponse.json({ ok: true })
}
