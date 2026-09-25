import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'
import { checkDuplicateName, validateParentAssignment, validateSlugFormat, slugIsTaken, suggestUniqueSlug, validateIconName } from '@/lib/services/categories'

/** Cria categoria ou subcategoria (parentId presente = subcategoria).
 *  Nasce com o que foi informado — abrir/salvar o formulário nunca publica
 *  nada (categorias não têm rascunho/aprovação, só status ativo/inativo). */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') return NextResponse.json({ error: 'Sem permissão para gerenciar categorias.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  const { name, description, icon, parentId, showInNav } = body
  let { slug } = body

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    return NextResponse.json({ error: 'Nome precisa ter entre 2 e 80 caracteres.' }, { status: 400 })
  }
  if (description != null && String(description).length > 300) {
    return NextResponse.json({ error: 'Descrição pode ter no máximo 300 caracteres.' }, { status: 400 })
  }
  const iconError = validateIconName(icon)
  if (iconError) return NextResponse.json({ error: iconError }, { status: 400 })

  const parentCheck = await validateParentAssignment(supabase, { categoryId: null, newParentId: parentId ?? null })
  if (!parentCheck.ok) return NextResponse.json({ error: parentCheck.error }, { status: 400 })

  if (await checkDuplicateName(supabase, { name: name.trim(), parentId: parentId ?? null })) {
    return NextResponse.json({ error: 'Já existe uma categoria com esse nome neste nível.' }, { status: 409 })
  }

  if (slug) {
    slug = String(slug).trim().toLowerCase()
    const formatError = validateSlugFormat(slug)
    if (formatError) return NextResponse.json({ error: formatError }, { status: 400 })
    if (await slugIsTaken(supabase, slug)) return NextResponse.json({ error: 'Este slug já está em uso.' }, { status: 409 })
  } else {
    slug = await suggestUniqueSlug(supabase, name.trim())
  }

  const { data: created, error } = await supabase
    .from('app_categories')
    .insert({
      name: name.trim(), slug, description: description ? String(description).trim() : null,
      icon: icon ?? null, parent_id: parentId ?? null, show_in_nav: showInNav ?? true, created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[categories POST]', error)
    return NextResponse.json({ error: 'Não foi possível criar a categoria agora — tente novamente.' }, { status: 500 })
  }

  await logAppAdminEvent(supabase, {
    categoryId: created.id, actorId: user.id, action: 'create_category', reason: null,
    previousStatus: 'inexistente', newStatus: `criada: ${name.trim()}`,
  })

  return NextResponse.json({ ok: true, id: created.id, slug })
}
