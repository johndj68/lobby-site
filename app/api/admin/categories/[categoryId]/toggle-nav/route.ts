import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/** Visibilidade na navegação é independente de status ativo/inativo
 *  (seção 13) — uma categoria ativa pode ficar fora do menu e continuar
 *  acessível por filtro/URL. */
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

  const { data: current } = await supabase.from('app_categories').select('id, show_in_nav').eq('id', categoryId).single()
  if (!current) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })

  const newValue = !current.show_in_nav
  const { error } = await supabase.from('app_categories').update({ show_in_nav: newValue }).eq('id', categoryId)
  if (error) return NextResponse.json({ error: 'Não foi possível atualizar agora.' }, { status: 500 })

  await logAppAdminEvent(supabase, {
    categoryId, actorId: user.id, action: 'toggle_category_nav', reason: null,
    previousStatus: String(current.show_in_nav), newStatus: String(newValue),
  })

  return NextResponse.json({ ok: true, showInNav: newValue })
}
