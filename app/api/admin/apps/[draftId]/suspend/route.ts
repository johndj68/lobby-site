import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Suspende a publicação de um app — remove da vitrine (applications.is_published
 * =false) sem apagar nada: app_drafts.status continua 'published' (histórico
 * da versão aprovada preservado, seção 12), pedidos/licenças anteriores não
 * são tocados aqui (fluxos próprios cuidam disso, não esta rota).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const { draftId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para suspender aplicativos.' }, { status: 403 })
  }

  const { reason } = await req.json().catch(() => ({ reason: null }))
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo da suspensão.' }, { status: 400 })
  }

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name, application_id')
    .eq('id', draftId)
    .single()
  if (!draft) return NextResponse.json({ error: 'Aplicativo não encontrado.' }, { status: 404 })
  if (!draft.application_id) {
    return NextResponse.json({ error: 'Este aplicativo nunca foi publicado — não há o que suspender.' }, { status: 400 })
  }

  const { data: application } = await supabase
    .from('applications')
    .select('id, is_published, suspended_at')
    .eq('id', draft.application_id)
    .single()
  if (!application) return NextResponse.json({ error: 'Registro público não encontrado.' }, { status: 404 })
  if (application.suspended_at) {
    return NextResponse.json({ error: 'Este aplicativo já está suspenso.' }, { status: 409 })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('applications')
    .update({
      is_published: false,
      suspended_at: new Date().toISOString(),
      suspended_by: user.id,
      suspended_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.application_id)
    .is('suspended_at', null) // guard de concorrência
    .select('id')
    .single()

  if (updateErr || !updated) {
    return NextResponse.json({ error: 'Não foi possível suspender agora — tente novamente.' }, { status: 409 })
  }

  await logAppAdminEvent(supabase, {
    appDraftId: draftId,
    applicationId: draft.application_id,
    actorId: user.id,
    action: 'suspend',
    reason: reason.trim(),
    previousStatus: 'publicado',
    newStatus: 'suspenso',
  })

  return NextResponse.json({ ok: true, app: draft.name })
}
