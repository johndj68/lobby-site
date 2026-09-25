import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Autoatendimento do parceiro — cria uma campanha rascunho pro PRÓPRIO
 * aplicativo publicado. Mesma checagem de dono usada em
 * app/api/apps/plans/route.ts (created_by = auth.uid()), sem admin
 * envolvido. Nasce sem aprovação/cobrança/reserva.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { appDraftId, internalName, spaceId } = body

  if (!appDraftId || typeof appDraftId !== 'string') {
    return NextResponse.json({ error: 'Selecione o aplicativo desta campanha.' }, { status: 400 })
  }
  if (!internalName || typeof internalName !== 'string' || !internalName.trim()) {
    return NextResponse.json({ error: 'Informe o nome interno da campanha.' }, { status: 400 })
  }

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, application_id')
    .eq('id', appDraftId)
    .eq('created_by', user.id)
    .single()
  if (!draft) return NextResponse.json({ error: 'Aplicativo não encontrado ou não pertence a você.' }, { status: 403 })
  if (!draft.application_id) {
    return NextResponse.json({ error: 'Só é possível contratar destaque para um aplicativo já publicado.' }, { status: 400 })
  }

  let resolvedSpaceId = spaceId
  if (!resolvedSpaceId) {
    const { data: defaultSpace } = await supabase.from('ad_spaces').select('id').eq('slug', 'home_carousel').single()
    resolvedSpaceId = defaultSpace?.id ?? null
  }

  const { data: created, error } = await supabase
    .from('sponsored_campaigns')
    .insert({
      application_id: draft.application_id,
      app_draft_id: appDraftId,
      space_id: resolvedSpaceId,
      internal_name: internalName.trim(),
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
    console.error('[campaigns POST partner]', error)
    return NextResponse.json({ error: 'Não foi possível criar a campanha agora — tente novamente.' }, { status: 500 })
  }

  // Auditoria via client admin: app_admin_events só aceita escrita de
  // técnico via RLS — o parceiro nunca tem policy de insert lá, e a
  // trilha de auditoria precisa existir mesmo assim.
  await logAppAdminEvent(createAdminClient(), {
    appDraftId, applicationId: draft.application_id, campaignId: created.id,
    actorId: user.id, action: 'create_campaign', reason: null,
    previousStatus: 'inexistente', newStatus: 'rascunho',
  })

  return NextResponse.json({ ok: true, id: created.id })
}
