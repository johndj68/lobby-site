import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** Reagenda o período — exige capacidade disponível na nova janela
 *  (revalida via reserve_ad_capacity), preserva histórico da alteração. */
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

  const { startsAt, endsAt, compensationNote } = await req.json().catch(() => ({}))
  if (!startsAt || !endsAt || isNaN(Date.parse(startsAt)) || isNaN(Date.parse(endsAt))) {
    return NextResponse.json({ error: 'Informe um período válido.' }, { status: 400 })
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return NextResponse.json({ error: 'O término precisa ser posterior ao início.' }, { status: 400 })
  }

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, space_id, starts_at, ends_at, app_draft_id, application_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  if (!campaign.space_id) return NextResponse.json({ error: 'Campanha sem espaço definido.' }, { status: 400 })

  const admin = createAdminClient()
  const { error: rpcError } = await admin.rpc('reserve_ad_capacity', {
    p_campaign_id: campaignId, p_space_id: campaign.space_id, p_starts_at: startsAt, p_ends_at: endsAt,
  })
  if (rpcError) {
    if (rpcError.message?.includes('CAPACITY_EXCEEDED')) {
      return NextResponse.json({ error: 'Sem capacidade disponível no novo período — escolha outra janela.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Não foi possível revalidar a capacidade agora.' }, { status: 500 })
  }

  await supabase.from('sponsored_campaigns').update({ starts_at: startsAt, ends_at: endsAt }).eq('id', campaignId)

  await logAppAdminEvent(supabase, {
    appDraftId: campaign.app_draft_id, applicationId: campaign.application_id, campaignId,
    actorId: user.id, action: 'reschedule_campaign',
    reason: typeof compensationNote === 'string' && compensationNote.trim() ? compensationNote.trim() : null,
    previousStatus: `${campaign.starts_at} → ${campaign.ends_at}`,
    newStatus: `${startsAt} → ${endsAt}`,
  })

  return NextResponse.json({ ok: true })
}
