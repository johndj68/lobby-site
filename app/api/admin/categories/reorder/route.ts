import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Reordena um escopo completo e explícito — todas as categorias-raiz, ou
 * todas as subcategorias de UM pai. Nunca aceita uma lista parcial (ex.:
 * resultado de busca/filtro) como se fosse o conjunto inteiro — seção 14:
 * valida que orderedIds bate exatamente com o conjunto real do escopo
 * antes de gravar qualquer coisa.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const { parentId, orderedIds } = await req.json().catch(() => ({}))
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: 'Lista de ordenação inválida.' }, { status: 400 })
  }

  let query = supabase.from('app_categories').select('id')
  query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null)
  const { data: scopeRows } = await query
  const scopeIds = new Set((scopeRows ?? []).map(r => r.id))

  if (scopeIds.size !== orderedIds.length || !orderedIds.every((id: string) => scopeIds.has(id))) {
    return NextResponse.json({ error: 'A lista enviada não corresponde ao conjunto completo deste nível — recarregue e tente de novo.' }, { status: 409 })
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('app_categories').update({ display_order: i }).eq('id', orderedIds[i])
    if (error) {
      console.error('[categories/reorder]', error)
      return NextResponse.json({ error: 'Falha ao salvar a ordenação — tente novamente.' }, { status: 500 })
    }
  }

  await logAppAdminEvent(supabase, {
    actorId: user.id, action: 'reorder_categories', reason: null,
    previousStatus: parentId ? `subcategorias de ${parentId}` : 'raiz', newStatus: orderedIds.join(','),
  })

  return NextResponse.json({ ok: true })
}
