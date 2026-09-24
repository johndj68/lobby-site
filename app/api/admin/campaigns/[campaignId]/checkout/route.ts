import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { createCampaignCheckoutSession } from '@/lib/services/campaigns'

/**
 * Cria a sessão de checkout Stripe pra cobrança da campanha — usada quando o
 * próprio admin conduz a contratação (ex.: parceiro pediu por outro canal).
 * Nunca marca como pago aqui — só o evento autenticado do provedor confirma
 * (mesmo endpoint de webhook já existente, seção 12).
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
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const rl = checkRateLimit({ key: `campaign-checkout:${user.id}`, limit: 5, windowMs: 60_000 })
  const limited = rateLimitResponse(rl)
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const packageId = body.packageId
  if (!packageId || typeof packageId !== 'string') {
    return NextResponse.json({ error: 'Selecione um pacote.' }, { status: 400 })
  }

  const { data: campaign } = await supabase.from('sponsored_campaigns').select('id, review_status, live_creative_id').eq('id', campaignId).single()
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })
  if (campaign.review_status !== 'aprovado' || !campaign.live_creative_id) {
    return NextResponse.json({ error: 'O anúncio precisa estar aprovado antes de gerar cobrança.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const result = await createCampaignCheckoutSession(admin, {
    campaignId,
    packageId,
    payerUserId: user.id,
    payerEmail: user.email ?? null,
    successUrl: `${siteUrl}/admin/marketplace/destaques/${campaignId}?checkout=success`,
    cancelUrl: `${siteUrl}/admin/marketplace/destaques/${campaignId}?checkout=canceled`,
  })

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ url: result.url })
}
