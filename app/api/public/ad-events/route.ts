import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit-redis'

/**
 * Registra impressão/clique de uma campanha patrocinada — endpoint público
 * (sem sessão), usado pelo carrossel da home. Revalida no servidor que o
 * creativeId é de fato o live_creative_id atual da campanha antes de
 * gravar (nunca confia em elegibilidade alegada pelo cliente). Impressão
 * duplicada (mesmo view_id+campanha) é engolida como sucesso silencioso —
 * o índice único parcial já garante a deduplicação (seção 19).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const limit = await checkRateLimit({ key: `ad-events:${ip}`, limit: 120, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ ok: false }, { status: 429 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false }, { status: 400 })
  const { campaignId, creativeId, eventType, viewId } = body

  if (!campaignId || !eventType || !viewId || !['impression', 'click'].includes(eventType)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  if (typeof viewId !== 'string' || viewId.length > 100) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const admin = createAdminClient()

  // Só grava se o creative informado é de fato o que está no ar agora pra
  // essa campanha — nunca confia no que o cliente alega estar vendo.
  const { data: campaign } = await admin
    .from('sponsored_campaigns')
    .select('live_creative_id')
    .eq('id', campaignId)
    .single()
  if (!campaign || campaign.live_creative_id !== creativeId) {
    return NextResponse.json({ ok: true }) // silencioso — nada de erro informativo pra bots
  }

  const ua = req.headers.get('user-agent') ?? ''
  const deviceType = /mobile|android|iphone/i.test(ua) ? 'mobile' : /tablet|ipad/i.test(ua) ? 'tablet' : 'desktop'

  const { error } = await admin.from('ad_events').insert({
    campaign_id: campaignId, creative_id: creativeId, event_type: eventType, view_id: viewId, device_type: deviceType,
  })

  // Violação do índice único de dedup de impressão = já contada; sucesso.
  if (error && error.code !== '23505') {
    console.error('[public/ad-events]', error)
  }

  return NextResponse.json({ ok: true })
}
