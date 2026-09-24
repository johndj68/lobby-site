import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

const EDITABLE_FIELDS: Record<string, string> = {
  name: 'name', description: 'description', durationDays: 'duration_days', price: 'price', currency: 'currency',
  cancellationPolicy: 'cancellation_policy', pausePolicy: 'pause_policy', status: 'status',
}

/**
 * Edita um pacote — NUNCA altera contratos já feitos: preço/duração/
 * condições ficam preservados em campaign_purchases.package_terms_snapshot
 * no momento da contratação (seção 10), então mudar o pacote aqui só afeta
 * novas contratações a partir de agora.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const { packageId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Gerenciar pacotes requer técnico líder.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  if (body.status && !['draft', 'active', 'archived'].includes(body.status)) {
    return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) updates[column] = body[key]
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })

  const { error } = await supabase.from('ad_packages').update(updates).eq('id', packageId)
  if (error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })

  await logAppAdminEvent(supabase, { actorId: user.id, action: 'update_package', reason: null, previousStatus: 'editado', newStatus: JSON.stringify(updates) })
  return NextResponse.json({ ok: true })
}
