import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchCategoryTree } from '@/lib/services/categories'
import { csvSafe } from '@/lib/services/offers'
import { formatDateTimeBR } from '@/lib/marketplace'

const HEADERS = ['ID', 'Categoria', 'Categoria principal', 'Apps publicados (diretos)', 'Status', 'Exibir na navegação', 'Atualizado']

/** Exporta a árvore de categorias em CSV — leader-only, protegido contra
 *  injeção de fórmula. */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, is_leader').eq('id', user.id).single()
  if (profile?.role !== 'technician' || profile.is_leader !== true) {
    return NextResponse.json({ error: 'Exportação restrita a técnicos líderes.' }, { status: 403 })
  }

  const { flat } = await fetchCategoryTree(supabase)
  const byId = new Map(flat.map(c => [c.id, c]))

  const lines = [HEADERS.map(csvSafe).join(',')]
  for (const c of flat) {
    const parentName = c.parentId ? (byId.get(c.parentId)?.name ?? '') : ''
    lines.push([
      csvSafe(c.id), csvSafe(c.name), csvSafe(parentName), csvSafe(c.directPublishedCount),
      csvSafe(c.status === 'active' ? 'Ativa' : 'Inativa'), csvSafe(c.showInNav ? 'Sim' : 'Não'), csvSafe(formatDateTimeBR(c.updatedAt)),
    ].join(','))
  }

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="categorias-lobby-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
