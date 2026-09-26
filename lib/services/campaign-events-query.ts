/**
 * Construção da query de app_admin_events pro histórico de campanha —
 * compartilhada pela rota de listagem (paginada) e pela de exportação (sem
 * paginação, mesmos filtros) pra nunca haver dois critérios de filtro
 * divergentes do mesmo histórico (mesmo princípio de campaign-metrics.ts).
 * Só roda no servidor (usa SupabaseClient) — nunca importar de um client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { CATEGORY_ACTIONS, ACTION_META, type EventCategory } from './campaign-events'

export interface EventFilters {
  q: string | null
  category: EventCategory | 'todos'
  /** uuid do autor, 'sistema' (actor_id nulo) ou null (todos) */
  actor: string | null
  from: string | null
  to: string | null
  sort: 'recentes' | 'antigos'
}

const CATEGORIES: (EventCategory | 'todos')[] = ['todos', 'campanha', 'criativo', 'configuracao', 'reserva', 'financeiro']

export function parseEventFilters(sp: URLSearchParams): EventFilters {
  const category = sp.get('type')
  const sort = sp.get('sort')
  return {
    q: sp.get('q')?.trim() || null,
    category: (category && (CATEGORIES as string[]).includes(category) ? category : 'todos') as EventCategory | 'todos',
    actor: sp.get('actor') || null,
    from: sp.get('from') || null,
    to: sp.get('to') || null,
    sort: sort === 'antigos' ? 'antigos' : 'recentes',
  }
}

/** Escapa os caracteres que a sintaxe do PostgREST `.or()`/`.ilike()`
 *  interpreta especialmente — nunca deixa texto livre do usuário quebrar o
 *  filtro ou virar um curinga não intencional. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()]/g, ' ').trim()
}

/** Resolve os autores cujo nome/e-mail bate com a busca — precisa ser
 *  assíncrono e separado de buildEventsQuery: um query builder do
 *  PostgREST é "thenable", então uma função `async` que o retorna direto
 *  faz o TypeScript achatar o tipo de retorno pra resposta já resolvida
 *  (Awaited desembrulha qualquer thenable), quebrando o `.range()` de quem
 *  chama. Mantendo a parte async fora, buildEventsQuery pode continuar
 *  síncrona e devolver o builder de verdade. */
export async function resolveSearchActorIds(supabase: SupabaseClient, q: string): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('id').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
  return (data ?? []).map((p: { id: string }) => p.id)
}

/** Monta a query já filtrada/ordenada (sem paginação) — quem chama decide
 *  se aplica `.range()` (listagem) ou lê tudo (exportação). Chame
 *  `resolveSearchActorIds` antes se `filters.q` estiver preenchido. */
export function buildEventsQuery(supabase: SupabaseClient, campaignId: string, filters: EventFilters, searchActorIds: string[] = []) {
  let query = supabase
    .from('app_admin_events')
    .select('id, action, reason, previous_status, new_status, actor_id, created_at, creative_id, internal_note, field_changes', { count: 'exact' })
    .eq('campaign_id', campaignId)

  if (filters.category !== 'todos') {
    const actions = CATEGORY_ACTIONS[filters.category] ?? []
    query = query.in('action', actions.length ? actions : ['__nenhuma_acao_desta_categoria__'])
  }
  if (filters.actor === 'sistema') query = query.is('actor_id', null)
  else if (filters.actor) query = query.eq('actor_id', filters.actor)
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00`)
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59.999`)

  const q = filters.q ? sanitizeSearch(filters.q) : ''
  if (q) {
    const orParts = [`reason.ilike.%${q}%`]
    const matchingActions = Object.entries(ACTION_META)
      .filter(([, meta]) => meta.label.toLowerCase().includes(q.toLowerCase()))
      .map(([code]) => code)
    if (matchingActions.length) orParts.push(`action.in.(${matchingActions.join(',')})`)
    // `id` é uuid — o PostgREST não faz cast dentro da árvore lógica do
    // `.or()`, então ilike/prefixo nele sempre falha (erro de tipo). Só dá
    // pra comparar por igualdade, e só quando o texto é um UUID completo e
    // válido (senão o próprio "eq" quebra a consulta inteira com 400/500,
    // testado direto contra o Supabase real do projeto).
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) orParts.push(`id.eq.${q}`)
    if (searchActorIds.length) orParts.push(`actor_id.in.(${searchActorIds.join(',')})`)
    query = query.or(orParts.join(','))
  }

  const ascending = filters.sort === 'antigos'
  query = query.order('created_at', { ascending }).order('id', { ascending })
  return query
}

export interface ActorLabel { name: string; role: string | null }

/** Resolve nome + papel dos autores presentes numa lista de eventos — um
 *  único mapa, reaproveitado pra "Administrador"/"Parceiro"/"Sistema" e pro
 *  nome exibido. actor_id nulo nunca aparece aqui (vira "Sistema" antes). */
export async function resolveActorLabels(supabase: SupabaseClient, actorIds: string[]): Promise<Map<string, ActorLabel>> {
  const ids = [...new Set(actorIds)].filter(Boolean)
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('profiles').select('id, full_name, email, role').in('id', ids)
  return new Map((data ?? []).map(p => [p.id, { name: p.full_name || p.email || 'Responsável não registrado', role: p.role }]))
}
