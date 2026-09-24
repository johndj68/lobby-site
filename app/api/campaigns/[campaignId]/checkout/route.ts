import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { createCampaignCheckoutSession } from '@/lib/services/campaigns'

/**
 * Contratação real pelo parceiro — exige aceite explícito das condições do
 * pacote (seção 12: nunca simulado pelo admin) e garante o hold de
 * capacidade antes de ir pro Stripe.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const rl = checkRateLimit({ key: `campaign-checkout:${user.id}`, limit: 5, windowMs: 60_000 })
  const limited = rateLimitResponse(rl)
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const { packageId, acceptedTerms } = body
  if (!packageId || typeof packageId !== 'string') return NextResponse.json({ error: 'Selecione um pacote.' }, { status: 400 })
  if (acceptedTerms !== true) return NextResponse.json({ error: 'É preciso aceitar as condições do pacote para contratar.' }, { status: 400 })

  const { data: campaign } = await supabase
    .from('sponsored_campaigns')
    .select('id, space_id, starts_at, ends_at, review_status, live_creative_id, app_drafts(created_by)')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  const draftRef = Array.isArray(campaign.app_drafts) ? campaign.app_drafts[0] : (campaign.app_drafts as { created_by: string } | null)
  if (!draftRef || draftRef.created_by !== user.id) {
    return NextResponse.json({ error: 'Esta campanha não pertence a você.' }, { status: 403 })
  }
  if (campaign.review_status !== 'aprovado' || !campaign.live_creative_id) {
    return NextResponse.json({ error: 'O anúncio precisa estar aprovado antes de pagar.' }, { status: 400 })
  }
  if (!campaign.space_id) return NextResponse.json({ error: 'Campanha sem espaço definido.' }, { status: 400 })

  const admin = createAdminClient()
  const { error: rpcError } = await admin.rpc('reserve_ad_capacity', {
    p_campaign_id: campaignId, p_space_id: campaign.space_id, p_starts_at: campaign.starts_at, p_ends_at: campaign.ends_at,
  })
  if (rpcError) {
    if (rpcError.message?.includes('CAPACITY_EXCEEDED')) {
      return NextResponse.json({ error: 'Sem capacidade disponível para o período escolhido — ajuste as datas.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Não foi possível reservar o espaço agora.' }, { status: 500 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const result = await createCampaignCheckoutSession(admin, {
    campaignId, packageId, payerUserId: user.id, payerEmail: user.email ?? null,
    successUrl: `${siteUrl}/dashboard/destaques?checkout=success`,
    cancelUrl: `${siteUrl}/dashboard/destaques?checkout=canceled`,
  })

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ url: result.url })
}
