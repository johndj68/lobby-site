import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** CRUD de espaços de publicidade — leader-only (config comercial/técnica
 *  sensível, mesmo critério de permissão financeira usado em Ofertas). */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Gerenciar espaços requer técnico líder.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  const { slug, name, description, maxConcurrentCampaigns, swapIntervalSeconds, acceptedFormats } = body
  if (!slug || !name) return NextResponse.json({ error: 'Informe identificador e nome do espaço.' }, { status: 400 })
  if (!maxConcurrentCampaigns || maxConcurrentCampaigns < 1) {
    return NextResponse.json({ error: 'Informe a quantidade máxima de campanhas simultâneas (≥ 1).' }, { status: 400 })
  }

  const { data: created, error } = await supabase
    .from('ad_spaces')
    .insert({
      slug, name, description: description ?? null,
      max_concurrent_campaigns: maxConcurrentCampaigns,
      swap_interval_seconds: swapIntervalSeconds ?? 6,
      accepted_formats: acceptedFormats ?? null,
    })
    .select('id')
    .single()
  if (error || !created) return NextResponse.json({ error: 'Não foi possível criar o espaço (identificador já existe?).' }, { status: 409 })

  await logAppAdminEvent(supabase, { actorId: user.id, action: 'update_space', reason: null, previousStatus: 'inexistente', newStatus: `criado: ${name}` })
  return NextResponse.json({ ok: true, id: created.id })
}
