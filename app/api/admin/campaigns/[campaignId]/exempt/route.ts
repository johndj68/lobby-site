import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { logAppAdminEvent } from '@/lib/services/app-publish'
import { confirmReservationOrFlagConflict } from '@/lib/services/campaigns'

/**
 * Concede isenção de pagamento — só técnico líder, com motivo obrigatório.
 * Marca como "Isento", nunca como "Pago" (seção 12). Confirma a reserva de
 * capacidade na mesma operação; se a vaga sumiu, registra pendência e NÃO
 * finge que a campanha entrou em exibição.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Isenção só pode ser concedida por um técnico líder.' }, { status: 403 })
  }

  const { reason, packageId } = await req.json().catch(() => ({}))
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo da isenção.' }, { status: 400 })
  }

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, package_id, review_status, live_creative_id, app_draft_id, application_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  if (campaign.review_status !== 'aprovado' || !campaign.live_creative_id) {
    return NextResponse.json({ error: 'O anúncio precisa estar aprovado antes de conceder isenção.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: purchase, error: insertErr } = await admin
    .from('campaign_purchases')
    .insert({
      campaign_id: campaignId,
      package_id: packageId ?? campaign.package_id,
      payer_user_id: user.id,
      amount: 0,
      currency: 'BRL',
      kind: 'isento',
      status: 'isento',
      isento_reason: reason.trim(),
      isento_granted_by: user.id,
      isento_granted_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (insertErr || !purchase) {
    console.error('[campaigns/exempt]', insertErr)
    return NextResponse.json({ error: 'Não foi possível registrar a isenção.' }, { status: 500 })
  }

  const confirmed = await confirmReservationOrFlagConflict(admin, campaignId)

  await logAppAdminEvent(supabase, {
    appDraftId: campaign.app_draft_id, applicationId: campaign.application_id, campaignId,
    actorId: user.id, action: 'grant_exemption', reason: reason.trim(),
    previousStatus: 'sem_pagamento', newStatus: confirmed.ok ? 'isento' : 'isento_com_pendencia_de_conciliacao',
  })

  if (!confirmed.ok) {
    return NextResponse.json({
      ok: true,
      warning: 'Isenção registrada, mas a vaga do espaço expirou antes da confirmação — a campanha ficou com pendência de conciliação e não entra em exibição automaticamente. Reagende ou libere manualmente.',
    })
  }

  return NextResponse.json({ ok: true })
}
