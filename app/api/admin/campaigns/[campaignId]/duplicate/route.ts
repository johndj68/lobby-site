import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** Duplica como rascunho — copia app/espaço/pacote e o TEXTO do anúncio
 *  (título/descrição/imagem), nunca aprovação, pagamento, reserva ou
 *  métricas (seção 6). */
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

  const { data: original } = await supabase
    .from('sponsored_campaigns')
    .select('id, application_id, app_draft_id, space_id, package_id, internal_name, live_creative_id')
    .eq('id', campaignId)
    .single()
  if (!original) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })

  const { data: created, error } = await supabase
    .from('sponsored_campaigns')
    .insert({
      application_id: original.application_id,
      app_draft_id: original.app_draft_id,
      space_id: original.space_id,
      package_id: original.package_id,
      internal_name: `${original.internal_name ?? 'Campanha'} (cópia)`,
      starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString(),
      review_status: 'rascunho',
      is_approved: false,
      is_active: false,
      is_paid: false,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error || !created) return NextResponse.json({ error: 'Não foi possível duplicar agora.' }, { status: 500 })

  if (original.live_creative_id) {
    const { data: source } = await supabase.from('ad_creatives').select('title, description, image_url, image_alt, cta_label, cta_href').eq('id', original.live_creative_id).single()
    if (source) {
      await supabase.from('ad_creatives').insert({
        campaign_id: created.id, version: 1, review_status: 'rascunho', created_by: user.id,
        title: source.title, description: source.description, image_url: source.image_url,
        image_alt: source.image_alt, cta_label: source.cta_label, cta_href: source.cta_href,
      })
    }
  }

  await logAppAdminEvent(supabase, {
    appDraftId: original.app_draft_id, applicationId: original.application_id, campaignId: created.id,
    actorId: user.id, action: 'duplicate_campaign', reason: `Duplicada a partir de ${campaignId}`,
    previousStatus: 'inexistente', newStatus: 'rascunho',
  })

  return NextResponse.json({ ok: true, id: created.id })
}
