import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'
import { formatOfferPrice } from '@/lib/services/offers'

const BILLING_PERIODS = ['one-time', 'monthly', 'yearly', 'lifetime']
const EDITABLE_FIELDS = [
  'name', 'description', 'currency', 'price', 'billing_period', 'features', 'limits',
  'users_limit', 'support_level', 'activation_method', 'activation_instructions',
] as const

/**
 * Edita os dados comerciais de uma oferta existente. Não versiona preço em
 * tabela própria (nenhum pedido consome isso hoje) — grava o valor anterior
 * e o novo em app_admin_events quando preço/moeda/modalidade mudam, o que já
 * dá trilha de auditoria (seção 21) e base pra versionamento real quando o
 * checkout de apps existir.
 *
 * Editar aqui NUNCA reescreve o snapshot (`data` jsonb) de uma submissão já
 * enviada para análise — app_submissions guarda sua própria cópia, então a
 * versão em análise fica intacta (seção 8/16).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para editar ofertas.' }, { status: 403 })
  }

  const { data: plan } = await supabase
    .from('app_plans')
    .select('id, app_draft_id, name, price, currency, billing_period, status, app_drafts(application_id)')
    .eq('id', planId)
    .single()
  if (!plan) return NextResponse.json({ error: 'Oferta não encontrada.' }, { status: 404 })
  if (plan.status === 'archived') {
    return NextResponse.json({ error: 'Esta oferta está arquivada — reative-a antes de editar.' }, { status: 409 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })

  if (body.billing_period != null && !BILLING_PERIODS.includes(body.billing_period)) {
    return NextResponse.json({ error: 'Modalidade de cobrança inválida.' }, { status: 400 })
  }
  if (body.price != null && (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0)) {
    return NextResponse.json({ error: 'Preço inválido.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('app_plans')
    .update(updates)
    .eq('id', planId)
    .select('id, price, currency, billing_period')
    .single()

  if (error || !updated) {
    console.error('[offers PATCH]', error)
    return NextResponse.json({ error: 'Não foi possível salvar agora — tente novamente.' }, { status: 500 })
  }

  const priceChanged = 'price' in updates || 'currency' in updates || 'billing_period' in updates
  if (priceChanged) {
    const applicationId = Array.isArray(plan.app_drafts) ? plan.app_drafts[0]?.application_id : (plan.app_drafts as { application_id: string | null } | null)?.application_id
    await logAppAdminEvent(supabase, {
      appDraftId: plan.app_draft_id,
      applicationId: applicationId ?? null,
      planId,
      actorId: user.id,
      action: 'update_plan_price',
      reason: null,
      previousStatus: formatOfferPrice(plan.price, plan.currency, plan.billing_period),
      newStatus: formatOfferPrice(updated.price, updated.currency, updated.billing_period),
    })
  }

  return NextResponse.json({ ok: true })
}
