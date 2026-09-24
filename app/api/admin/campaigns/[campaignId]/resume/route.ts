import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** Retoma a exibição — revalida requisitos reais antes de voltar a
 *  participar do carrossel; nunca retoma com o período já vencido. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, paused_at, cancelled_at, ends_at, review_status, live_creative_id, app_draft_id, application_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  if (!campaign.paused_at) return NextResponse.json({ error: 'Campanha não está pausada.' }, { status: 409 })
  if (new Date(campaign.ends_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'O período desta campanha já venceu — reagende antes de retomar.' }, { status: 400 })
  }
  if (campaign.review_status !== 'aprovado' || !campaign.live_creative_id) {
    return NextResponse.json({ error: 'O anúncio precisa estar aprovado para retomar a exibição.' }, { status: 400 })
  }
  const { data: purchase } = await supabase
    .from('campaign_purchases')
    .select('status')
    .eq('campaign_id', campaignId)
    .in('status', ['paid', 'isento'])
    .limit(1)
    .maybeSingle()
  if (!purchase) {
    return NextResponse.json({ error: 'Não há pagamento confirmado ou isenção válida para esta campanha.' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('sponsored_campaigns')
    .update({ paused_at: null, paused_by: null, paused_reason: null })
    .eq('id', campaignId)
    .not('paused_at', 'is', null)
    .select('id')
    .single()
  if (error || !updated) return NextResponse.json({ error: 'Não foi possível retomar agora — tente novamente.' }, { status: 409 })

  await logAppAdminEvent(supabase, {
    appDraftId: campaign.app_draft_id, applicationId: campaign.application_id, campaignId,
    actorId: user.id, action: 'resume_campaign', reason: null,
    previousStatus: 'pausada', newStatus: 'ativa',
  })

  return NextResponse.json({ ok: true })
}
