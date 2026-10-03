import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

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
    .select('id, app_plan_id, status, requested_price, requested_billing_period')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  if (request.status !== 'pendente') {
    return NextResponse.json({ error: 'Este pedido já foi resolvido.' }, { status: 409 })
  }

  // Aplica de verdade — só marca o pedido como aprovado depois de
  // confirmar que o UPDATE realmente afetou o plano (nunca marcar
  // resolvido se a aplicação falhou silenciosamente).
  const { data: updatedPlan, error: planError } = await admin
    .from('app_plans')
    .update({ price: request.requested_price, billing_period: request.requested_billing_period })
    .eq('id', request.app_plan_id)
    .select('id')
    .single()

  if (planError || !updatedPlan) {
    console.error('[price-requests approve] failed to apply plan update', planError)
    return NextResponse.json({ error: 'Não foi possível aplicar o novo preço. O plano pode ter sido removido.' }, { status: 500 })
  }

  const { error: requestError } = await admin
    .from('plan_price_change_requests')
    .update({ status: 'aprovado', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (requestError) {
    console.error('[price-requests approve] plan updated but request status failed', requestError)
    return NextResponse.json({ error: 'Preço aplicado, mas não foi possível atualizar o status do pedido. Avise o time técnico.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
