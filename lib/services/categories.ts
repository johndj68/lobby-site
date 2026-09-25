/**
 * Regras de negócio de /admin/marketplace/categorias — árvore de categorias
 * (2 níveis, auto-referenciada), contagem de apps publicados, validação de
 * ciclo/duplicata e slug com preservação de link antigo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { slugify } from '@/lib/services/app-publish'
import { CATEGORY_ICON_NAMES } from '@/lib/category-icons'
import { partnerDisplayName } from '@/lib/partners'

/** Valida contra a allowlist fechada — nunca aceita HTML/SVG/nome livre. */
export function validateIconName(icon: unknown): string | null {
  if (icon == null || icon === '') return null
  if (typeof icon !== 'string' || !CATEGORY_ICON_NAMES.includes(icon)) {
    return 'Ícone inválido — escolha um dos ícones disponíveis.'
  }
  return null
}

export type CategoryStatus = 'active' | 'inactive'

export interface CategoryRow {
  id: string
  parentId: string | null
  name: string
  slug: string
  description: string | null
  icon: string | null
  status: CategoryStatus
  showInNav: boolean
  displayOrder: number
  createdAt: string
  updatedAt: string
  /** Apps publicados classificados diretamente nesta categoria (não inclui filhos). */
  directPublishedCount: number
}

export interface CategoryNode extends CategoryRow {
  children: CategoryNode[]
  /** Direto + soma dos filhos — usado só em categorias-pai (seção 7: união sem duplicar, pois cada app tem 1 category_id só). */
  totalPublishedCount: number
}

/** Normaliza pra detectar duplicata por nome no mesmo nível — mesmo
 *  critério de acento/caixa usado por slugify(), mas mantendo espaços
 *  colapsados em vez de virarem hífen (é só pra comparação, não é o slug). */
export function normalizeNameForDedup(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Busca a árvore inteira + contagem de apps publicados numa única
 *  agregação em memória (nunca uma query por linha — seção 21). */
export async function fetchCategoryTree(supabase: SupabaseClient): Promise<{ tree: CategoryNode[]; flat: CategoryRow[]; error: boolean }> {
  const [{ data: categories, error: categoriesError }, { data: apps }] = await Promise.all([
    supabase.from('app_categories').select('*').order('display_order', { ascending: true }),
    // Só a versão pública atual conta (seção 7) — applications já É só a
    // versão publicada (rascunho/revisão vivem em app_drafts/app_submissions,
    // nunca aqui). category_id null cai fora da contagem (vira pendência).
    supabase.from('applications').select('id, category_id').eq('is_published', true).not('category_id', 'is', null),
  ])

  const countByCategory = new Map<string, number>()
  for (const a of apps ?? []) {
    if (!a.category_id) continue
    countByCategory.set(a.category_id, (countByCategory.get(a.category_id) ?? 0) + 1)
  }

  const flat: CategoryRow[] = (categories ?? []).map(c => ({
    id: c.id, parentId: c.parent_id, name: c.name, slug: c.slug, description: c.description,
    icon: c.icon, status: c.status as CategoryStatus, showInNav: c.show_in_nav, displayOrder: c.display_order,
    createdAt: c.created_at, updatedAt: c.updated_at, directPublishedCount: countByCategory.get(c.id) ?? 0,
  }))

  const byId = new Map(flat.map(c => [c.id, { ...c, children: [] as CategoryNode[], totalPublishedCount: c.directPublishedCount } as CategoryNode]))
  const roots: CategoryNode[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  for (const root of roots) {
    root.totalPublishedCount = root.directPublishedCount + root.children.reduce((sum, c) => sum + c.directPublishedCount, 0)
  }

  return { tree: roots, flat, error: !!categoriesError }
}

/** Impede: categoria como filha de si mesma, associação a descendente,
 *  ciclos, profundidade além de 2 níveis, pai inexistente. */
export async function validateParentAssignment(
  supabase: SupabaseClient,
  params: { categoryId: string | null; newParentId: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { categoryId, newParentId } = params
  if (!newParentId) return { ok: true } // virar categoria-raiz sempre é válido

  if (categoryId && newParentId === categoryId) {
    return { ok: false, error: 'Uma categoria não pode ser subcategoria de si mesma.' }
  }

  const { data: parent } = await supabase.from('app_categories').select('id, parent_id').eq('id', newParentId).maybeSingle()
  if (!parent) return { ok: false, error: 'Categoria principal informada não existe.' }

  // Profundidade máxima 2: o novo pai não pode já ter um pai (senão a
  // categoria viraria neta, 3 níveis).
  if (parent.parent_id) {
    return { ok: false, error: 'Esta categoria já é uma subcategoria — não é possível criar um terceiro nível.' }
  }

  // Se a categoria já existe (edição), o novo pai não pode ser um
  // descendente dela (evita ciclo indireto). Com só 2 níveis a única forma
  // de ciclo indireto seria o pai escolhido ser filho da própria categoria.
  if (categoryId) {
    const { data: children } = await supabase.from('app_categories').select('id').eq('parent_id', categoryId)
    if ((children ?? []).some(c => c.id === newParentId)) {
      return { ok: false, error: 'Não é possível mover para uma subcategoria dela mesma (criaria um ciclo).' }
    }
  }

  return { ok: true }
}

/** Detecta duplicata por nome no mesmo nível (mesmo pai), acento/caixa
 *  insensível — a unicidade "dura" (case-fold simples) já é garantida por
 *  índice no banco; isto é a checagem mais rica pra dar erro amigável. */
export async function checkDuplicateName(
  supabase: SupabaseClient,
  params: { name: string; parentId: string | null; excludeId?: string },
): Promise<boolean> {
  const normalized = normalizeNameForDedup(params.name)
  let query = supabase.from('app_categories').select('id, name')
  query = params.parentId ? query.eq('parent_id', params.parentId) : query.is('parent_id', null)
  if (params.excludeId) query = query.neq('id', params.excludeId)
  const { data } = await query
  return (data ?? []).some(c => normalizeNameForDedup(c.name) === normalized)
}

const RESERVED_SLUGS = new Set(['admin', 'api', 'app', 'login', 'cadastro', 'dashboard', 'busca', 'todas', 'todos', 'nova', 'novo'])

export function validateSlugFormat(slug: string): string | null {
  if (slug.length < 2 || slug.length > 100) return 'O slug precisa ter entre 2 e 100 caracteres.'
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return 'Use apenas letras minúsculas, números e hífen simples entre palavras.'
  if (RESERVED_SLUGS.has(slug)) return 'Este slug é reservado pelo sistema — escolha outro.'
  return null
}

/** Garante slug único global (categorias atuais + redirects históricos —
 *  seção 9/10: uma URL antiga nunca pode ser reutilizada por outra
 *  categoria). Sugere "-2", "-3"... a partir do nome, só na CRIAÇÃO. */
export async function suggestUniqueSlug(supabase: SupabaseClient, name: string): Promise<string> {
  const base = slugify(name)
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const taken = await slugIsTaken(supabase, candidate)
    if (!taken) return candidate
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}

export interface CategoryPendencyRow {
  /** id do app_drafts — sempre existe, mesmo quando o app já foi publicado. */
  id: string
  /** Qual tabela a reclassificação deve gravar — publicado corrige em `applications`, senão em `app_drafts`. */
  target: 'application' | 'draft'
  targetId: string
  appName: string
  appLogoUrl: string | null
  partnerId: string
  partnerName: string
  publicationStatus: 'publicado' | 'suspenso' | 'em_revisao' | 'rascunho'
  categoryId: string | null
  pendencyType: 'sem_categoria' | 'categoria_inativa'
  updatedAt: string
}

/** Apps (publicados ou em rascunho) sem categoria válida — sem categoria
 *  nenhuma, ou apontando pra uma categoria que foi desativada depois. */
export async function fetchCategoryPendencyRows(supabase: SupabaseClient): Promise<{ rows: CategoryPendencyRow[]; error: boolean }> {
  const [{ data: drafts, error }, { data: activeCategories }] = await Promise.all([
    supabase.from('app_drafts').select('id, name, logo_url, created_by, category_id, status, updated_at, created_at, application_id, applications(id, is_published, suspended_at)'),
    supabase.from('app_categories').select('id').eq('status', 'active'),
  ])

  const activeIds = new Set((activeCategories ?? []).map(c => c.id))

  type DraftRow = {
    id: string; name: string | null; logo_url: string | null; created_by: string; category_id: string | null
    status: string; updated_at: string | null; created_at: string; application_id: string | null
    applications: { id: string; is_published: boolean; suspended_at: string | null } | { id: string; is_published: boolean; suspended_at: string | null }[] | null
  }

  const partnerIds = [...new Set(((drafts ?? []) as DraftRow[]).map(d => d.created_by))]
  const { data: partners } = partnerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, company_name, role').in('id', partnerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; company_name: string | null; role: string }[] }
  const partnerById = new Map((partners ?? []).map(p => [p.id, p]))

  const rows: CategoryPendencyRow[] = []
  for (const d of (drafts ?? []) as DraftRow[]) {
    const hasCategory = !!d.category_id
    const categoryActive = d.category_id ? activeIds.has(d.category_id) : false
    if (hasCategory && categoryActive) continue

    const application = Array.isArray(d.applications) ? (d.applications[0] ?? null) : d.applications
    const partner = partnerById.get(d.created_by)
    const publicationStatus: CategoryPendencyRow['publicationStatus'] = application
      ? (application.suspended_at ? 'suspenso' : (application.is_published ? 'publicado' : 'rascunho'))
      : (d.status === 'submitted' || d.status === 'under_review' ? 'em_revisao' : 'rascunho')

    rows.push({
      id: d.id,
      target: application ? 'application' : 'draft',
      targetId: application?.id ?? d.id,
      appName: d.name || 'Sem nome',
      appLogoUrl: d.logo_url ?? null,
      partnerId: d.created_by,
      partnerName: partner ? partnerDisplayName(partner) : 'Parceiro removido',
      publicationStatus,
      categoryId: d.category_id ?? null,
      pendencyType: hasCategory ? 'categoria_inativa' : 'sem_categoria',
      updatedAt: d.updated_at ?? d.created_at,
    })
  }

  return { rows, error: !!error }
}

export async function slugIsTaken(supabase: SupabaseClient, slug: string, excludeId?: string): Promise<boolean> {
  let catQuery = supabase.from('app_categories').select('id').eq('slug', slug)
  if (excludeId) catQuery = catQuery.neq('id', excludeId)
  const [{ data: cat }, { data: redirect }] = await Promise.all([
    catQuery.maybeSingle(),
    supabase.from('category_slug_redirects').select('id').eq('old_slug', slug).maybeSingle(),
  ])
  return !!cat || !!redirect
}
