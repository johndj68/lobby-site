import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Cria uma campanha rascunho a partir do admin — sempre presa a um app_draft
 * já publicado (tem application_id) escolhido pelo técnico. Nasce sem
 * aprovação, cobrança ou reserva: só um registro editável.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para criar campanhas.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { appDraftId, spaceId, internalName } = body

  if (!appDraftId || typeof appDraftId !== 'string') {
    return NextResponse.json({ error: 'Selecione o aplicativo desta campanha.' }, { status: 400 })
  }
  if (!internalName || typeof internalName !== 'string' || !internalName.trim()) {
    return NextResponse.json({ error: 'Informe o nome interno da campanha.' }, { status: 400 })
  }

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name, application_id, applications(id, is_published)')
    .eq('id', appDraftId)
    .single()
  if (!draft) return NextResponse.json({ error: 'Aplicativo não encontrado.' }, { status: 404 })
  if (!draft.application_id) {
    return NextResponse.json({ error: 'Este aplicativo ainda não foi publicado — publique antes de criar uma campanha.' }, { status: 400 })
  }

  let resolvedSpaceId = spaceId
  if (!resolvedSpaceId) {
    const { data: defaultSpace } = await supabase.from('ad_spaces').select('id').eq('slug', 'home_carousel').single()
    resolvedSpaceId = defaultSpace?.id ?? null
  }

  // Idempotência: evita duplicar por duplo clique — mesmo app_draft_id +
  // nome interno, ainda não cancelada.
  const { data: existing } = await supabase
    .from('sponsored_campaigns')
    .select('id')
    .eq('app_draft_id', appDraftId)
    .eq('internal_name', internalName.trim())
    .is('cancelled_at', null)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `Já existe uma campanha chamada "${internalName.trim()}" para este aplicativo.` }, { status: 409 })
  }

  const { data: created, error } = await supabase
    .from('sponsored_campaigns')
    .insert({
      application_id: draft.application_id,
      app_draft_id: appDraftId,
      space_id: resolvedSpaceId,
      internal_name: internalName.trim(),
      title: null,
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

  if (error || !created) {
    console.error('[campaigns POST]', error)
    return NextResponse.json({ error: 'Não foi possível criar a campanha agora — tente novamente.' }, { status: 500 })
  }

  await logAppAdminEvent(supabase, {
    appDraftId,
    applicationId: draft.application_id,
    campaignId: created.id,
    actorId: user.id,
    action: 'create_campaign',
    reason: null,
    previousStatus: 'inexistente',
    newStatus: 'rascunho',
  })

  return NextResponse.json({ ok: true, id: created.id })
}
