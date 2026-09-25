import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/** Árvore pública de categorias ativas — sem dado sensível, consumida pelo
 *  seletor do editor do parceiro e pela home. RLS já restringe a leitura a
 *  status='active', mas filtramos explícito aqui também. */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('app_categories')
    .select('id, parent_id, name, slug, icon')
    .eq('status', 'active')
    .order('display_order', { ascending: true })

  if (error) {
    console.error('[categories/tree]', error)
    return NextResponse.json({ error: 'Não foi possível carregar categorias agora.' }, { status: 500 })
  }

  const rows = data ?? []
  const parents = rows.filter(r => !r.parent_id).map(p => ({
    id: p.id, name: p.name, slug: p.slug, icon: p.icon,
    children: rows.filter(c => c.parent_id === p.id).map(c => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon })),
  }))

  return NextResponse.json({ categories: parents })
}
