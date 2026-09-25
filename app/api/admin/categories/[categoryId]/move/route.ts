import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'
import { validateParentAssignment, checkDuplicateName } from '@/lib/services/categories'

/** Move a categoria pra outro pai (ou para raiz, newParentId=null) —
 *  revalida ciclo/profundidade no backend dentro da própria operação
 *  persistida (seção 11), não só na tela. */
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

  const { data: current } = await supabase.from('app_categories').select('id, name, parent_id').eq('id', categoryId).single()
  if (!current) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })

  const { newParentId } = await req.json().catch(() => ({ newParentId: null }))

  const check = await validateParentAssignment(supabase, { categoryId, newParentId: newParentId ?? null })
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  if (await checkDuplicateName(supabase, { name: current.name, parentId: newParentId ?? null, excludeId: categoryId })) {
    return NextResponse.json({ error: 'Já existe uma categoria com esse nome no destino escolhido.' }, { status: 409 })
  }

  const { error } = await supabase.from('app_categories').update({ parent_id: newParentId ?? null }).eq('id', categoryId)
  if (error) return NextResponse.json({ error: 'Não foi possível mover agora.' }, { status: 500 })

  await logAppAdminEvent(supabase, {
    categoryId, actorId: user.id, action: 'move_category', reason: null,
    previousStatus: current.parent_id ?? 'raiz', newStatus: newParentId ?? 'raiz',
  })

  return NextResponse.json({ ok: true })
}
