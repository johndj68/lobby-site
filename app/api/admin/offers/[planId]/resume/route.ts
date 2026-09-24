import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkPublishEligibility, logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Retoma novas vendas de uma oferta pausada — revalida as mesmas condições
 * de elegibilidade do app inteiro (checkPublishEligibility: revisão
 * aprovada, sem bloqueios, ativação configurada) antes de voltar a
 * status='active', igual ao que /reactivate já faz no nível do app.
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
    return NextResponse.json({ error: 'Sem permissão para retomar ofertas.' }, { status: 403 })
  }

  const { data: plan } = await supabase
    .from('app_plans')
    .select('id, name, app_draft_id, status, billing_period, app_drafts(application_id)')
    .eq('id', planId)
    .single()
  if (!plan) return NextResponse.json({ error: 'Oferta não encontrada.' }, { status: 404 })
  if (plan.status !== 'paused') {
    return NextResponse.json({ error: 'Esta oferta não está pausada.' }, { status: 409 })
  }
  if (!plan.billing_period) {
    return NextResponse.json({ error: 'Defina a modalidade de cobrança antes de retomar.' }, { status: 400 })
  }

  const eligibility = await checkPublishEligibility(supabase, plan.app_draft_id)
  if (!eligibility.ok) {
    return NextResponse.json({ error: `Não é possível retomar: ${eligibility.error}` }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('app_plans')
    .update({ status: 'active', paused_at: null, paused_by: null, paused_reason: null })
    .eq('id', planId)
    .eq('status', 'paused')
    .select('id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Não foi possível retomar agora — tente novamente.' }, { status: 409 })
  }

  const applicationId = Array.isArray(plan.app_drafts) ? plan.app_drafts[0]?.application_id : (plan.app_drafts as { application_id: string | null } | null)?.application_id
  await logAppAdminEvent(supabase, {
    appDraftId: plan.app_draft_id,
    applicationId: applicationId ?? null,
    planId,
    actorId: user.id,
    action: 'resume_offer',
    reason: null,
    previousStatus: 'paused',
    newStatus: 'active',
  })

  return NextResponse.json({ ok: true, offer: plan.name })
}
