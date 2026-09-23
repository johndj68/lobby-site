import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

const BILLING_PERIODS = ['one-time', 'monthly', 'yearly', 'lifetime']

/**
 * Cria uma nova oferta (app_plans) a partir do admin — sempre presa a um
 * app_draft já existente escolhido pelo técnico; nunca cria organização,
 * app ou parceiro novo aqui (seção 9). Nasce em status='draft': não
 * publica, não cobra, não ativa assinatura nenhuma.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') {
    return NextResponse.json({ error: 'Sem permissão para criar ofertas.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })

  const {
    appDraftId, name, description, currency, price, billingPeriod, features, limits,
    usersLimit, supportLevel, activationMethod, activationInstructions,
  } = body

  if (!appDraftId || typeof appDraftId !== 'string') {
    return NextResponse.json({ error: 'Selecione o aplicativo desta oferta.' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Informe o nome da oferta.' }, { status: 400 })
  }
  if (billingPeriod != null && !BILLING_PERIODS.includes(billingPeriod)) {
    return NextResponse.json({ error: 'Modalidade de cobrança inválida.' }, { status: 400 })
  }
  if (price != null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) {
    return NextResponse.json({ error: 'Preço inválido.' }, { status: 400 })
  }

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id, name, application_id')
    .eq('id', appDraftId)
    .single()
  if (!draft) return NextResponse.json({ error: 'Aplicativo não encontrado.' }, { status: 404 })

  // Idempotência: evita duplicar a mesma oferta por duplo clique/retry —
  // mesmo app_draft_id + nome, ainda não arquivada.
  const { data: existing } = await supabase
    .from('app_plans')
    .select('id')
    .eq('app_draft_id', appDraftId)
    .eq('name', name.trim())
    .neq('status', 'archived')
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `Já existe uma oferta chamada "${name.trim()}" para este aplicativo.` }, { status: 409 })
  }

  const { data: last } = await supabase
    .from('app_plans')
    .select('display_order')
    .eq('app_draft_id', appDraftId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: created, error } = await supabase
    .from('app_plans')
    .insert({
      app_draft_id: appDraftId,
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      currency: currency || 'BRL',
      price: price ?? null,
      billing_period: billingPeriod ?? null,
      features: Array.isArray(features) ? features : null,
      limits: limits ?? null,
      users_limit: usersLimit ?? null,
      support_level: supportLevel ?? null,
      activation_method: activationMethod ?? null,
      activation_instructions: activationInstructions ?? null,
      display_order: (last?.display_order ?? -1) + 1,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[offers POST]', error)
    return NextResponse.json({ error: 'Não foi possível criar a oferta agora — tente novamente.' }, { status: 500 })
  }

  await logAppAdminEvent(supabase, {
    appDraftId,
    applicationId: draft.application_id,
    planId: created.id,
    actorId: user.id,
    action: 'create_offer',
    reason: null,
    previousStatus: 'inexistente',
    newStatus: 'rascunho',
  })

  return NextResponse.json({ ok: true, id: created.id })
}
