import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** Encerra/cancela a campanha — libera a reserva de capacidade, preserva
 *  histórico e pagamentos (nunca exclui). Reembolso é uma ação separada. */
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

  const { reason } = await req.json().catch(() => ({ reason: null }))
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo do encerramento.' }, { status: 400 })
  }

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, cancelled_at, app_draft_id, application_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  if (campaign.cancelled_at) return NextResponse.json({ error: 'Campanha já está encerrada.' }, { status: 409 })

  const { data: updated, error } = await supabase
    .from('sponsored_campaigns')
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: user.id, cancelled_reason: reason.trim(), is_active: false })
    .eq('id', campaignId)
    .is('cancelled_at', null)
    .select('id')
    .single()
  if (error || !updated) return NextResponse.json({ error: 'Não foi possível encerrar agora — tente novamente.' }, { status: 409 })

  await supabase.from('ad_reservations').update({ status: 'released' }).eq('campaign_id', campaignId).in('status', ['held', 'confirmed'])

  await logAppAdminEvent(supabase, {
    appDraftId: campaign.app_draft_id, applicationId: campaign.application_id, campaignId,
    actorId: user.id, action: 'cancel_campaign', reason: reason.trim(),
    previousStatus: 'ativa_ou_pausada', newStatus: 'encerrada',
  })

  return NextResponse.json({ ok: true })
}
