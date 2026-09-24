import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Arquiva uma oferta — sai de comercialização preservando tudo: a linha em
 * app_plans nunca é apagada (histórico, e qualquer código de ativação já
 * emitido continua referenciando plan_id normalmente). Reversível: não há
 * rota de "desarquivar" nesta entrega porque nada pede isso — se precisar,
 * é a mesma forma (voltar status para 'draft').
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para arquivar ofertas.' }, { status: 403 })
  }

  const { reason } = await req.json().catch(() => ({ reason: null }))

  const { data: plan } = await supabase
    .from('app_plans')
    .select('id, name, app_draft_id, status, app_drafts(application_id)')
    .eq('id', planId)
    .single()
  if (!plan) return NextResponse.json({ error: 'Oferta não encontrada.' }, { status: 404 })
  if (plan.status === 'archived') {
    return NextResponse.json({ error: 'Esta oferta já está arquivada.' }, { status: 409 })
  }

  const previousStatus = plan.status
  const { data: updated, error } = await supabase
    .from('app_plans')
    .update({ status: 'archived', archived_at: new Date().toISOString(), archived_by: user.id })
    .eq('id', planId)
    .neq('status', 'archived')
    .select('id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Não foi possível arquivar agora — tente novamente.' }, { status: 409 })
  }

  const applicationId = Array.isArray(plan.app_drafts) ? plan.app_drafts[0]?.application_id : (plan.app_drafts as { application_id: string | null } | null)?.application_id
  await logAppAdminEvent(supabase, {
    appDraftId: plan.app_draft_id,
    applicationId: applicationId ?? null,
    planId,
    actorId: user.id,
    action: 'archive_offer',
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    previousStatus,
    newStatus: 'archived',
  })

  return NextResponse.json({ ok: true, offer: plan.name })
}
