import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { logAppAdminEvent } from '@/lib/services/app-publish'
import { formatOfferPrice } from '@/lib/services/offers'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para aprovar mudança de preço.' }, { status: 403 })
  }

  // plan_price_change_requests não tem policy de UPDATE pra
  // authenticated (de propósito — ver comentário na migração da Task
  // 1) e aprovar precisa escrever em app_plans de um plano que não é
  // do técnico — mesmo padrão já usado em
  // app/api/admin/campaigns/[campaignId]/refund/route.ts: checar
  // role com o client de sessão (`supabase`, acima), depois trocar
  // pro client de service-role (`admin`) pra toda leitura/escrita
  // privilegiada daqui pra baixo.
  const admin = createAdminClient()

  const { data: request } = await admin
    .from('plan_price_change_requests')
    .select(`
      id, app_plan_id, status, requested_price, requested_billing_period,
      app_plans ( id, app_draft_id, price, currency, billing_period, app_drafts ( application_id ) )
    `)
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  if (request.status !== 'pendente') {
    return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
  }

  const plan = Array.isArray(request.app_plans) ? request.app_plans[0] : request.app_plans
  const draft = plan ? (Array.isArray(plan.app_drafts) ? plan.app_drafts[0] : plan.app_drafts) : null

  // Aplica de verdade — só marca o pedido como aprovado depois de
  // confirmar que o UPDATE realmente afetou o plano (nunca marcar
  // resolvido se a aplicação falhou silenciosamente).
  const { data: updatedPlan, error: planError } = await admin
    .from('app_plans')
    .update({ price: request.requested_price, billing_period: request.requested_billing_period })
    .eq('id', request.app_plan_id)
    .select('id, price, currency, billing_period')
    .single()

  if (planError || !updatedPlan) {
    console.error('[price-requests approve] failed to apply plan update', planError)
    return NextResponse.json({ error: 'Não foi possível aplicar o novo preço. O plano pode ter sido removido.' }, { status: 500 })
  }

  const { data: resolvedRequest, error: requestError } = await admin
    .from('plan_price_change_requests')
    .update({ status: 'aprovado', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pendente')
    .select('id')
    .single()

  if (requestError || !resolvedRequest) {
    console.error('[price-requests approve] plan updated but request status failed', requestError)
    return NextResponse.json({ error: 'Preço aplicado, mas não foi possível atualizar o status do pedido. Avise o time técnico.' }, { status: 500 })
  }

  // Best-effort — o preço e o status do pedido já foram aplicados com
  // sucesso nesse ponto, então uma falha aqui não deve derrubar a
  // resposta de sucesso. Mesma ação (update_plan_price) que a rota
  // irmã app/api/admin/offers/[planId]/route.ts registra quando edita
  // preço/moeda/modalidade direto.
  if (plan) {
    try {
      await logAppAdminEvent(admin, {
        appDraftId: plan.app_draft_id,
        applicationId: draft?.application_id ?? null,
        planId: request.app_plan_id,
        actorId: user.id,
        action: 'update_plan_price',
        reason: null,
        previousStatus: formatOfferPrice(plan.price, plan.currency, plan.billing_period),
        newStatus: formatOfferPrice(updatedPlan.price, updatedPlan.currency, updatedPlan.billing_period),
      })
    } catch (logError) {
      console.error('[price-requests approve] failed to log admin event', logError)
    }
  }

  return NextResponse.json({ ok: true })
}
