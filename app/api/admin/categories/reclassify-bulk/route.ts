import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'

/**
 * Reclassificação em lote — seleção explícita de itens, revalida cada um
 * (versão/permissão) e retorna resultado por item, nunca tudo-ou-nada
 * silencioso; não sobrescreve mudança concorrente (checa category_id ainda
 * bater com o valor visto na prévia antes de aplicar).
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const { items, categoryId } = await req.json().catch(() => ({}))
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos um aplicativo.' }, { status: 400 })
  }
  if (categoryId) {
    const { data: category } = await supabase.from('app_categories').select('id, status').eq('id', categoryId).single()
    if (!category || category.status !== 'active') return NextResponse.json({ error: 'Selecione uma categoria ativa.' }, { status: 400 })
  }

  const results: { id: string; ok: boolean; error?: string }[] = []
  for (const item of items as { target: 'application' | 'draft'; id: string; expectedCategoryId: string | null }[]) {
    const table = item.target === 'application' ? 'applications' : 'app_drafts'
    const { data: currentRow } = await supabase.from(table).select('id, category_id').eq('id', item.id).single()
    if (!currentRow) { results.push({ id: item.id, ok: false, error: 'Não encontrado.' }); continue }
    if ((currentRow.category_id ?? null) !== (item.expectedCategoryId ?? null)) {
      results.push({ id: item.id, ok: false, error: 'Classificação mudou desde a prévia — não aplicado.' })
      continue
    }
    const { error } = await supabase.from(table).update({ category_id: categoryId ?? null }).eq('id', item.id)
    if (error) { results.push({ id: item.id, ok: false, error: 'Falha ao salvar.' }); continue }
    results.push({ id: item.id, ok: true })

    await logAppAdminEvent(supabase, {
      categoryId: categoryId ?? null,
      applicationId: item.target === 'application' ? item.id : undefined,
      appDraftId: item.target === 'draft' ? item.id : undefined,
      actorId: user.id, action: 'reclassify_apps_bulk', reason: 'Reclassificação em lote.',
      previousStatus: currentRow.category_id ?? 'sem categoria', newStatus: categoryId ?? 'sem categoria',
    })
  }

  return NextResponse.json({ ok: true, results })
}
