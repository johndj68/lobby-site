import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** Envia a versão rascunho/ajustes_solicitados do anúncio pra revisão —
 *  a partir daqui ela fica imutável até uma decisão (seção 9). */
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
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const { data: latest, error: fetchError } = await supabase
    .from('ad_creatives')
    // ad_creatives.campaign_id -> sponsored_campaigns E sponsored_campaigns.live_creative_id
    // -> ad_creatives são DUAS relações entre as mesmas tabelas — sem o hint
    // `!ad_creatives_campaign_id_fkey` o PostgREST recusa o embed (PGRST201,
    // ambíguo) e retornaria data=null aqui, fácil de confundir com "não
    // existe rascunho ainda".
    .select('id, review_status, title, image_url, campaign_id, sponsored_campaigns!ad_creatives_campaign_id_fkey(app_draft_id, application_id)')
    .eq('campaign_id', campaignId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    console.error('[creative/submit] fetch error', fetchError)
    return NextResponse.json({ error: 'Não foi possível carregar o anúncio agora — tente novamente.' }, { status: 500 })
  }
  if (!latest) return NextResponse.json({ error: 'Crie o anúncio antes de enviar para revisão.' }, { status: 400 })
  if (latest.review_status !== 'rascunho' && latest.review_status !== 'ajustes_solicitados') {
    return NextResponse.json({ error: 'Esta versão já foi enviada para revisão.' }, { status: 409 })
  }
  if (!latest.title || !latest.image_url) {
    return NextResponse.json({ error: 'Preencha ao menos título e imagem antes de enviar para revisão.' }, { status: 400 })
  }

  const { error } = await supabase.from('ad_creatives').update({ review_status: 'em_revisao' }).eq('id', latest.id)
  if (error) return NextResponse.json({ error: 'Não foi possível enviar para revisão.' }, { status: 500 })

  const campaignRef = Array.isArray(latest.sponsored_campaigns) ? latest.sponsored_campaigns[0] : latest.sponsored_campaigns
  await logAppAdminEvent(supabase, {
    appDraftId: campaignRef?.app_draft_id ?? null,
    applicationId: campaignRef?.application_id ?? null,
    campaignId,
    actorId: user.id,
    action: 'submit_creative',
    reason: null,
    previousStatus: latest.review_status,
    newStatus: 'em_revisao',
  })

  return NextResponse.json({ ok: true })
}
