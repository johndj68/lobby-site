import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'
import { sendEmail } from '@/lib/notifications'

/**
 * Decisão de revisão do anúncio em análise — approve|request_changes|reject.
 * Aprovar promove a versão pra live_creative_id (a versão anterior no ar,
 * se houver, continua preservada no histórico, nunca apagada). Ajustes e
 * rejeição exigem motivo; nota interna e mensagem ao parceiro são campos
 * separados (seção 9).
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
    return NextResponse.json({ error: 'Sem permissão para revisar anúncios.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { action, reason, internalNotes } = body
  if (!['approve', 'request_changes', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }
  if (action !== 'approve' && (!reason || typeof reason !== 'string' || !reason.trim())) {
    return NextResponse.json({ error: 'Informe o motivo.' }, { status: 400 })
  }

  const { data: latest, error: fetchError } = await supabase
    .from('ad_creatives')
    // hint !ad_creatives_campaign_id_fkey necessário: há duas FKs entre
    // ad_creatives e sponsored_campaigns (campaign_id e live_creative_id),
    // sem o hint o PostgREST recusa o embed (PGRST201, ambíguo).
    .select('id, review_status, campaign_id, sponsored_campaigns!ad_creatives_campaign_id_fkey(app_draft_id, application_id, app_drafts(created_by))')
    .eq('campaign_id', campaignId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    console.error('[creative/review] fetch error', fetchError)
    return NextResponse.json({ error: 'Não foi possível carregar o anúncio agora — tente novamente.' }, { status: 500 })
  }

  if (!latest || latest.review_status !== 'em_revisao') {
    return NextResponse.json({ error: 'Não há versão em análise para esta campanha.' }, { status: 409 })
  }

  const newStatus = action === 'approve' ? 'aprovado' : action === 'request_changes' ? 'ajustes_solicitados' : 'rejeitado'

  const { error: updateErr } = await supabase
    .from('ad_creatives')
    .update({
      review_status: newStatus,
      reviewer_id: user.id,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: typeof internalNotes === 'string' ? internalNotes.trim() || null : null,
      partner_feedback: action !== 'approve' ? reason.trim() : null,
    })
    .eq('id', latest.id)
  if (updateErr) return NextResponse.json({ error: 'Não foi possível registrar a decisão.' }, { status: 500 })

  const campaignUpdate: Record<string, unknown> = { review_status: newStatus }
  if (action === 'approve') {
    campaignUpdate.live_creative_id = latest.id
    campaignUpdate.is_approved = true
  }
  await supabase.from('sponsored_campaigns').update(campaignUpdate).eq('id', campaignId)

  const campaignRef = Array.isArray(latest.sponsored_campaigns) ? latest.sponsored_campaigns[0] : latest.sponsored_campaigns
  const draftRef = campaignRef ? (Array.isArray(campaignRef.app_drafts) ? campaignRef.app_drafts[0] : campaignRef.app_drafts) : null

  await logAppAdminEvent(supabase, {
    appDraftId: campaignRef?.app_draft_id ?? null,
    applicationId: campaignRef?.application_id ?? null,
    campaignId,
    actorId: user.id,
    action: action === 'approve' ? 'review_creative_approve' : action === 'request_changes' ? 'review_creative_changes' : 'review_creative_reject',
    reason: action !== 'approve' ? reason.trim() : null,
    previousStatus: 'em_revisao',
    newStatus,
    creativeId: latest.id,
    internalNote: typeof internalNotes === 'string' ? internalNotes.trim() || null : null,
  })

  const ownerId = draftRef?.created_by
  if (ownerId) {
    const { data: ownerProfile } = await supabase.from('profiles').select('email, full_name').eq('id', ownerId).single()
    if (ownerProfile?.email) {
      const subject = action === 'approve' ? '[LOBBY] Seu anúncio foi aprovado' : action === 'request_changes' ? '[LOBBY] Ajustes solicitados no seu anúncio' : '[LOBBY] Seu anúncio foi rejeitado'
      const message = action === 'approve'
        ? 'Seu anúncio de destaque patrocinado foi aprovado e entra na fila de veiculação assim que o pagamento for confirmado.'
        : `${action === 'request_changes' ? 'Foram solicitados ajustes no seu anúncio' : 'Seu anúncio foi rejeitado'}: ${reason.trim()}`
      sendEmail(ownerProfile.email, subject, `<p>${message}</p>`).catch(err => console.error('[creative/review] email error', err))
    }
  }

  return NextResponse.json({ ok: true })
}
