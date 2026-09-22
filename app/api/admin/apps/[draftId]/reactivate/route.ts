import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkPublishEligibility, logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Reativa um app suspenso — revalida as mesmas condições de publicação
 * (versão aprovada, sem bloqueios, oferta e ativação configuradas) antes de
 * voltar a marcar is_published=true. Não reativa campanhas nem cobra de
 * novo (seção 12) — só a elegibilidade de exibição no catálogo.
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
    return NextResponse.json({ error: 'Sem permissão para reativar aplicativos.' }, { status: 403 })
  }

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name, application_id')
    .eq('id', draftId)
    .single()
  if (!draft) return NextResponse.json({ error: 'Aplicativo não encontrado.' }, { status: 404 })
  if (!draft.application_id) {
    return NextResponse.json({ error: 'Este aplicativo nunca foi publicado.' }, { status: 400 })
  }

  const { data: application } = await supabase
    .from('applications')
    .select('id, suspended_at')
    .eq('id', draft.application_id)
    .single()
  if (!application) return NextResponse.json({ error: 'Registro público não encontrado.' }, { status: 404 })
  if (!application.suspended_at) {
    return NextResponse.json({ error: 'Este aplicativo não está suspenso.' }, { status: 409 })
  }

  const eligibility = await checkPublishEligibility(supabase, draftId)
  if (!eligibility.ok) {
    return NextResponse.json({ error: `Não é possível reativar: ${eligibility.error}` }, { status: 400 })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('applications')
    .update({
      is_published: true,
      suspended_at: null,
      suspended_by: null,
      suspended_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.application_id)
    .not('suspended_at', 'is', null) // guard de concorrência
    .select('id')
    .single()

  if (updateErr || !updated) {
    return NextResponse.json({ error: 'Não foi possível reativar agora — tente novamente.' }, { status: 409 })
  }

  await logAppAdminEvent(supabase, {
    appDraftId: draftId,
    applicationId: draft.application_id,
    actorId: user.id,
    action: 'reactivate',
    previousStatus: 'suspenso',
    newStatus: 'publicado',
  })

  return NextResponse.json({ ok: true, app: draft.name })
}
