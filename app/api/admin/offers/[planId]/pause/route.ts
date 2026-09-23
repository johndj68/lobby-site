import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Pausa novas vendas de UMA oferta específica — não suspende o aplicativo
 * inteiro (isso já existe em /api/admin/apps/[draftId]/suspend), não
 * cancela assinaturas nem afeta pedidos anteriores (não existem pedidos de
 * app no projeto ainda; quando existirem, esta ação continua sem tocá-los).
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
    return NextResponse.json({ error: 'Sem permissão para pausar ofertas.' }, { status: 403 })
  }

  const { reason } = await req.json().catch(() => ({ reason: null }))
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'Informe o motivo da pausa.' }, { status: 400 })
  }

  const { data: plan } = await supabase
    .from('app_plans')
    .select('id, name, app_draft_id, status, app_drafts(application_id)')
    .eq('id', planId)
    .single()
  if (!plan) return NextResponse.json({ error: 'Oferta não encontrada.' }, { status: 404 })
  if (plan.status !== 'active' && plan.status !== 'draft') {
    return NextResponse.json({ error: `Esta oferta já está ${plan.status === 'paused' ? 'pausada' : 'arquivada'}.` }, { status: 409 })
  }

  const previousStatus = plan.status
  const { data: updated, error } = await supabase
    .from('app_plans')
    .update({ status: 'paused', paused_at: new Date().toISOString(), paused_by: user.id, paused_reason: reason.trim() })
    .eq('id', planId)
    .eq('status', previousStatus) // guarda de concorrência
    .select('id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Não foi possível pausar agora — tente novamente.' }, { status: 409 })
  }

  const applicationId = Array.isArray(plan.app_drafts) ? plan.app_drafts[0]?.application_id : (plan.app_drafts as { application_id: string | null } | null)?.application_id
  await logAppAdminEvent(supabase, {
    appDraftId: plan.app_draft_id,
    applicationId: applicationId ?? null,
    planId,
    actorId: user.id,
    action: 'pause_offer',
    reason: reason.trim(),
    previousStatus,
    newStatus: 'paused',
  })

  return NextResponse.json({ ok: true, offer: plan.name })
}
