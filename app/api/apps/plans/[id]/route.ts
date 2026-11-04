import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const BILLING_PERIODS = ['one-time', 'monthly', 'yearly', 'lifetime']
// Deliberadamente mais restrito que o allowlist da rota irmã
// (app/api/admin/offers/[planId]/route.ts): exclui currency (bloqueada
// à parte abaixo) e price/billing_period (campos com gate de aprovação,
// tratados em separado) — e exclui as colunas de ciclo de vida só pra
// admin (status, paused_*, archived_*), que um dono de app nunca deve
// conseguir escrever por aqui.
const EDITABLE_FIELDS = [
  'name', 'description', 'features', 'limits', 'users_limit', 'support_level',
  'activation_method', 'activation_instructions',
] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership via draft — já busca price/billing_period atuais
  // pra comparar com o payload (Etapa 6: mudança nesses dois campos
  // exige aprovação do admin, nunca aplica direto).
  const { data: plan } = await supabase
    .from('app_plans')
    .select('app_draft_id, price, billing_period, currency')
    .eq('id', id)
    .single()

  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', plan.app_draft_id)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updates = await req.json()

  // currency é texto livre em app_plans — mudar aqui driblaria o gate
  // de aprovação de preço por completo (o que esta feature existe pra
  // fechar). Sem UI hoje que chegue a isso, mas a API precisa bloquear
  // de qualquer forma.
  if (Object.prototype.hasOwnProperty.call(updates, 'currency') && updates.currency !== plan.currency) {
    return NextResponse.json({ error: 'Mudança de moeda não é permitida por aqui.' }, { status: 400 })
  }

  if (updates.billing_period != null && !BILLING_PERIODS.includes(updates.billing_period)) {
    return NextResponse.json({ error: 'Modalidade de cobrança inválida.' }, { status: 400 })
  }
  if (updates.price != null && (typeof updates.price !== 'number' || !Number.isFinite(updates.price) || updates.price < 0)) {
    return NextResponse.json({ error: 'Preço inválido.' }, { status: 400 })
  }

  const priceChanged = Object.prototype.hasOwnProperty.call(updates, 'price') && updates.price !== plan.price
  const billingChanged = Object.prototype.hasOwnProperty.call(updates, 'billing_period') && updates.billing_period !== plan.billing_period
  // price/billing_period nunca vão no UPDATE direto — ou não mudaram
  // (otherUpdates já reflete isso, sem efeito) ou mudaram e precisam
  // virar pedido (abaixo), nunca os dois ao mesmo tempo. Allowlist
  // (não denylist) pra nunca deixar passar colunas de ciclo de vida
  // só pra admin — mesmo padrão da rota irmã
  // app/api/admin/offers/[planId]/route.ts.
  const otherUpdates: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in updates) otherUpdates[field] = updates[field]
  }

  if (priceChanged || billingChanged) {
    const { data: existingPending, error: existingPendingError } = await supabase
      .from('plan_price_change_requests')
      .select('id')
      .eq('app_plan_id', id)
      .eq('status', 'pendente')
      .maybeSingle()

    if (existingPendingError) {
      console.error('[plans PATCH] failed to check existing pending request', existingPendingError)
      return NextResponse.json({ error: 'Não foi possível verificar pedidos pendentes. Tente novamente.' }, { status: 500 })
    }

    if (existingPending) {
      return NextResponse.json(
        { error: 'Já existe um pedido de mudança de preço aguardando aprovação pra este plano.' },
        { status: 409 }
      )
    }
  }

  // Aplica os outros campos primeiro — se o INSERT do pedido de preço
  // falhar depois, o usuário só vê um 500 e pode tentar de novo (sem
  // ficar travado num 409 por um pedido pendente órfão).
  const { data, error } = await supabase
    .from('app_plans')
    .update(otherUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[plans PATCH]', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  let pendingRequest = null
  if (priceChanged || billingChanged) {
    const { data: request, error: requestError } = await supabase
      .from('plan_price_change_requests')
      .insert({
        app_plan_id: id,
        requested_by: user.id,
        current_price: plan.price,
        requested_price: updates.price ?? plan.price,
        current_billing_period: plan.billing_period,
        requested_billing_period: updates.billing_period ?? plan.billing_period,
      })
      .select()
      .single()

    if (requestError || !request) {
      if (requestError?.code === '23505') {
        return NextResponse.json(
          { error: 'Já existe um pedido de mudança de preço aguardando aprovação pra este plano.' },
          { status: 409 }
        )
      }
      console.error('[plans PATCH] failed to create price change request', requestError)
      return NextResponse.json(
        { error: 'Outras alterações foram salvas, mas não foi possível registrar o pedido de mudança de preço. Tente editar o preço novamente.' },
        { status: 500 }
      )
    }
    pendingRequest = request
  }

  return NextResponse.json({ plan: data, pending_request: pendingRequest })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: plan } = await supabase
    .from('app_plans')
    .select('app_draft_id')
    .eq('id', id)
    .single()

  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', plan.app_draft_id)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase
    .from('app_plans')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[plans DELETE]', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
