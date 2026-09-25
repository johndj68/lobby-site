import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Corrige a classificação de UM aplicativo — só o campo category_id, nunca
 * outros campos pendentes do app (seção 15/16). `target` diz se mexe na
 * versão pública (`applications`) ou no rascunho (`app_drafts`); nunca
 * reescreve o snapshot já enviado em app_submissions.data.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const { target, id, categoryId } = await req.json().catch(() => ({}))
  if (!id || (target !== 'application' && target !== 'draft')) {
    return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
  }
  if (categoryId) {
    const { data: category } = await supabase.from('app_categories').select('id, status').eq('id', categoryId).single()
    if (!category) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
    if (category.status !== 'active') return NextResponse.json({ error: 'Selecione uma categoria ativa.' }, { status: 400 })
  }

  const table = target === 'application' ? 'applications' : 'app_drafts'
  const { data: before } = await supabase.from(table).select('id, category_id').eq('id', id).single()
  if (!before) return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 })

  const { error } = await supabase.from(table).update({ category_id: categoryId ?? null }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Não foi possível salvar agora.' }, { status: 500 })

  await logAppAdminEvent(supabase, {
    categoryId: categoryId ?? null,
    applicationId: target === 'application' ? id : undefined,
    appDraftId: target === 'draft' ? id : undefined,
    actorId: user.id, action: 'reclassify_app', reason: `Classificação corrigida (${target === 'application' ? 'versão pública' : 'rascunho'}).`,
    previousStatus: before.category_id ?? 'sem categoria', newStatus: categoryId ?? 'sem categoria',
  })

  return NextResponse.json({ ok: true })
}
