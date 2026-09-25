import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

const EDITABLE_FIELDS: Record<string, string> = {
  name: 'name', description: 'description', isActive: 'is_active',
  maxConcurrentCampaigns: 'max_concurrent_campaigns', swapIntervalSeconds: 'swap_interval_seconds',
  acceptedFormats: 'accepted_formats',
}

/** Edita um espaço existente — não afeta reservas/campanhas já
 *  confirmadas (a mudança vale pra próximas checagens de capacidade). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const { spaceId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Gerenciar espaços requer técnico líder.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) updates[column] = body[key]
  }
  if (updates.max_concurrent_campaigns != null && Number(updates.max_concurrent_campaigns) < 1) {
    return NextResponse.json({ error: 'Capacidade máxima precisa ser ao menos 1.' }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })

  const { error } = await supabase.from('ad_spaces').update(updates).eq('id', spaceId)
  if (error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })

  await logAppAdminEvent(supabase, { actorId: user.id, action: 'update_space', reason: null, previousStatus: 'editado', newStatus: JSON.stringify(updates) })
  return NextResponse.json({ ok: true })
}
