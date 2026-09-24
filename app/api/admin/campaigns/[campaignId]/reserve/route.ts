import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Tenta reservar capacidade do espaço pro período configurado da campanha —
 * chamado antes do checkout (e de novo se as datas mudarem/reagendar).
 * RPC é security definer restrita a service_role; a checagem de permissão
 * (quem pode reservar) vive aqui, não na função (seção 11).
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
    return NextResponse.json({ error: 'Sem permissão para reservar espaço.' }, { status: 403 })
  }

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, space_id, starts_at, ends_at, app_draft_id, application_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  if (!campaign.space_id) return NextResponse.json({ error: 'Selecione um espaço antes de reservar.' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.rpc('reserve_ad_capacity', {
    p_campaign_id: campaignId,
    p_space_id: campaign.space_id,
    p_starts_at: campaign.starts_at,
    p_ends_at: campaign.ends_at,
  })

  if (error) {
    if (error.message?.includes('CAPACITY_EXCEEDED')) {
      return NextResponse.json({ error: 'Capacidade do espaço esgotada para esse período.' }, { status: 409 })
    }
    if (error.message?.includes('INVALID_PERIOD')) {
      return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
    }
    console.error('[campaigns/reserve]', error)
    return NextResponse.json({ error: 'Não foi possível reservar agora — tente novamente.' }, { status: 500 })
  }

  await logAppAdminEvent(supabase, {
    appDraftId: campaign.app_draft_id, applicationId: campaign.application_id, campaignId,
    actorId: user.id, action: 'reserve_capacity', reason: null,
    previousStatus: 'sem_reserva', newStatus: 'reservada_temporariamente',
  })

  return NextResponse.json({ ok: true })
}
