import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** Cria um pacote — nasce em rascunho por padrão; preço/condições reais
 *  cadastrados antes de ativar (seção 10, não inventa valor comercial). */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Gerenciar pacotes requer técnico líder.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  const { spaceId, name, description, durationDays, price, currency, cancellationPolicy, pausePolicy } = body
  if (!spaceId || !name || !durationDays || durationDays < 1) {
    return NextResponse.json({ error: 'Informe espaço, nome e duração (dias) do pacote.' }, { status: 400 })
  }
  if (price != null && (typeof price !== 'number' || price < 0)) {
    return NextResponse.json({ error: 'Preço inválido.' }, { status: 400 })
  }

  const { data: created, error } = await supabase
    .from('ad_packages')
    .insert({
      space_id: spaceId, name, description: description ?? null, duration_days: durationDays,
      price: price ?? null, currency: currency || 'BRL',
      cancellation_policy: cancellationPolicy ?? null, pause_policy: pausePolicy ?? null,
      status: 'draft',
    })
    .select('id')
    .single()
  if (error || !created) return NextResponse.json({ error: 'Não foi possível criar o pacote.' }, { status: 500 })

  await logAppAdminEvent(supabase, { actorId: user.id, action: 'update_package', reason: null, previousStatus: 'inexistente', newStatus: `criado: ${name}` })
  return NextResponse.json({ ok: true, id: created.id })
}
