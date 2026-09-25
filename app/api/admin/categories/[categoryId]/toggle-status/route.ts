import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Ativa/desativa — nunca exclui, nunca suspende aplicativos, nunca mexe em
 * ofertas/pagamentos (seção 13). Desativar o pai não apaga o status dos
 * filhos: eles só ficam publicamente indisponíveis enquanto o pai estiver
 * inativo (checado na leitura, não gravado nos filhos).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const { categoryId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const { data: current } = await supabase.from('app_categories').select('id, name, status, parent_id').eq('id', categoryId).single()
  if (!current) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })

  const newStatus = current.status === 'active' ? 'inactive' : 'active'
  const { error } = await supabase.from('app_categories').update({ status: newStatus }).eq('id', categoryId)
  if (error) return NextResponse.json({ error: 'Não foi possível atualizar agora.' }, { status: 500 })

  let childrenCount = 0
  if (!current.parent_id) {
    const { count } = await supabase.from('app_categories').select('id', { count: 'exact', head: true }).eq('parent_id', categoryId).eq('status', 'active')
    childrenCount = count ?? 0
  }

  await logAppAdminEvent(supabase, {
    categoryId, actorId: user.id, action: 'toggle_category_status', reason: null,
    previousStatus: current.status, newStatus,
  })

  return NextResponse.json({
    ok: true, status: newStatus,
    impactNote: newStatus === 'inactive' && childrenCount > 0
      ? `${childrenCount} subcategoria(s) ativa(s) ficam publicamente indisponíveis enquanto esta categoria estiver inativa (o status individual delas é preservado).`
      : null,
  })
}
