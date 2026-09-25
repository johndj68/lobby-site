import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAppAdminEvent } from '@/lib/services/app-publish'
import { checkDuplicateName, validateSlugFormat, slugIsTaken, validateIconName } from '@/lib/services/categories'

const EDITABLE_FIELDS: Record<string, string> = { name: 'name', description: 'description', icon: 'icon' }

/**
 * Edita nome/descrição/ícone/slug — nunca o pai (isso é a rota /move, que
 * precisa da validação de ciclo) nem status/navegação (rotas próprias, pra
 * cada auditoria ficar clara). `updatedAt` é o guard de concorrência: se o
 * registro mudou desde que o admin abriu o painel, a escrita é recusada em
 * vez de sobrescrever silenciosamente (seção 21).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const { categoryId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const { data: current } = await supabase.from('app_categories').select('*').eq('id', categoryId).single()
  if (!current) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })

  if (body.updatedAt && new Date(body.updatedAt).getTime() !== new Date(current.updated_at).getTime()) {
    return NextResponse.json({ error: 'Esta categoria foi alterada por outro administrador — recarregue antes de salvar.', conflict: true }, { status: 409 })
  }

  if (body.name != null) {
    const name = String(body.name).trim()
    if (name.length < 2 || name.length > 80) return NextResponse.json({ error: 'Nome precisa ter entre 2 e 80 caracteres.' }, { status: 400 })
    if (name.toLowerCase() !== current.name.toLowerCase() && await checkDuplicateName(supabase, { name, parentId: current.parent_id, excludeId: categoryId })) {
      return NextResponse.json({ error: 'Já existe uma categoria com esse nome neste nível.' }, { status: 409 })
    }
  }
  if (body.description != null && String(body.description).length > 300) {
    return NextResponse.json({ error: 'Descrição pode ter no máximo 300 caracteres.' }, { status: 400 })
  }
  if (body.icon != null) {
    const iconError = validateIconName(body.icon)
    if (iconError) return NextResponse.json({ error: iconError }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) updates[column] = typeof body[key] === 'string' ? body[key].trim() : body[key]
  }

  let affectedUrls: string[] = []
  if (body.slug != null) {
    const newSlug = String(body.slug).trim().toLowerCase()
    if (newSlug !== current.slug) {
      const formatError = validateSlugFormat(newSlug)
      if (formatError) return NextResponse.json({ error: formatError }, { status: 400 })
      if (await slugIsTaken(supabase, newSlug, categoryId)) {
        return NextResponse.json({ error: 'Este slug já está em uso ou pertenceu a outra categoria.' }, { status: 409 })
      }
      updates.slug = newSlug
      // Preserva o endereço anterior — nunca reutilizável por outra
      // categoria (unique em category_slug_redirects.old_slug), seção 10.
      await supabase.from('category_slug_redirects').insert({ category_id: categoryId, old_slug: current.slug })
      affectedUrls = [`?categoria=${current.slug}`, `?categoria=${newSlug}`]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  const { error } = await supabase.from('app_categories').update(updates).eq('id', categoryId)
  if (error) {
    console.error('[categories PATCH]', error)
    return NextResponse.json({ error: 'Não foi possível salvar agora — tente novamente.' }, { status: 500 })
  }

  await logAppAdminEvent(supabase, {
    categoryId, actorId: user.id, action: 'update_category', reason: null,
    previousStatus: JSON.stringify({ name: current.name, slug: current.slug }),
    newStatus: JSON.stringify(updates),
  })

  return NextResponse.json({ ok: true, affectedUrls })
}

/** Exclusão permanente — só quando não há subcategorias, apps vinculados
 *  (públicos ou rascunho) nem redirects dependentes. Prioriza desativar
 *  (seção 18): nunca cascata. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const { categoryId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'technician') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const { data: current } = await supabase.from('app_categories').select('id, name').eq('id', categoryId).single()
  if (!current) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })

  const [{ count: children }, { count: apps }, { count: drafts }] = await Promise.all([
    supabase.from('app_categories').select('id', { count: 'exact', head: true }).eq('parent_id', categoryId),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('category_id', categoryId),
    supabase.from('app_drafts').select('id', { count: 'exact', head: true }).eq('category_id', categoryId),
  ])

  const blockers: string[] = []
  if (children) blockers.push(`${children} subcategoria(s)`)
  if (apps) blockers.push(`${apps} aplicativo(s) publicado(s)`)
  if (drafts) blockers.push(`${drafts} rascunho(s) de parceiro`)
  if (blockers.length > 0) {
    return NextResponse.json({ error: `Não é possível excluir: há ${blockers.join(', ')} dependentes. Desative a categoria ou reclassifique-os primeiro.`, blocked: true }, { status: 409 })
  }

  const { error } = await supabase.from('app_categories').delete().eq('id', categoryId)
  if (error) return NextResponse.json({ error: 'Não foi possível excluir agora.' }, { status: 500 })

  await logAppAdminEvent(supabase, {
    categoryId, actorId: user.id, action: 'delete_category', reason: null,
    previousStatus: current.name, newStatus: 'excluída',
  })

  return NextResponse.json({ ok: true })
}
