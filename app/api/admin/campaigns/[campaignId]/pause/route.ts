import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** Pausa a exibição — interrompe participação no carrossel imediatamente,
 *  sem estender prazo, liberar reserva ou reembolsar (seção 20). */
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
    return NextResponse.json({ error: 'Informe o motivo da pausa.' }, { status: 400 })
  }

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, paused_at, cancelled_at, app_draft_id, application_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  if (campaign.cancelled_at) return NextResponse.json({ error: 'Campanha já encerrada/cancelada.' }, { status: 409 })
  if (campaign.paused_at) return NextResponse.json({ error: 'Campanha já está pausada.' }, { status: 409 })

  const { data: updated, error } = await supabase
    .from('sponsored_campaigns')
    .update({ paused_at: new Date().toISOString(), paused_by: user.id, paused_reason: reason.trim() })
    .eq('id', campaignId)
    .is('paused_at', null)
    .select('id')
    .single()
  if (error || !updated) return NextResponse.json({ error: 'Não foi possível pausar agora — tente novamente.' }, { status: 409 })

  await logAppAdminEvent(supabase, {
    appDraftId: campaign.app_draft_id, applicationId: campaign.application_id, campaignId,
    actorId: user.id, action: 'pause_campaign', reason: reason.trim(),
    previousStatus: 'ativa', newStatus: 'pausada',
  })

  return NextResponse.json({ ok: true })
}
