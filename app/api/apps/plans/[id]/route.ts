import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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
    .select('app_draft_id, price, billing_period')
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

  const priceChanged = Object.prototype.hasOwnProperty.call(updates, 'price') && updates.price !== plan.price
  const billingChanged = Object.prototype.hasOwnProperty.call(updates, 'billing_period') && updates.billing_period !== plan.billing_period
  // price/billing_period nunca vão no UPDATE direto — ou não mudaram
  // (otherUpdates já reflete isso, sem efeito) ou mudaram e precisam
  // virar pedido (abaixo), nunca os dois ao mesmo tempo.
  const { price: _price, billing_period: _billingPeriod, ...otherUpdates } = updates

  let pendingRequest = null
  if (priceChanged || billingChanged) {
    const { data: existingPending } = await supabase
      .from('plan_price_change_requests')
      .select('id')
      .eq('app_plan_id', id)
      .eq('status', 'pendente')
      .maybeSingle()

    if (existingPending) {
      return NextResponse.json(
        { error: 'Já existe um pedido de mudança de preço aguardando aprovação pra este plano.' },
        { status: 409 }
      )
    }

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
      console.error('[plans PATCH] failed to create price change request', requestError)
      return NextResponse.json({ error: 'Não foi possível registrar o pedido de mudança de preço.' }, { status: 500 })
    }
    pendingRequest = request
  }

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
