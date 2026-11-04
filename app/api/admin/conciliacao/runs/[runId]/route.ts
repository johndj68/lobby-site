import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'
import { mapRunRow, mapItemRow } from '@/lib/services/reconciliation'
import type { ReconciliationOperationType, ReconciliationResultType } from '@/types'

const PAGE_SIZE = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIVERGENCE_PRIORITY: Record<ReconciliationResultType, number> = {
  sem_correspondencia_provedor: 0, sem_registro_local: 1, diferenca_valor: 2, diferenca_moeda: 3,
  diferenca_status: 4, possivel_duplicidade: 5, nao_verificavel: 6, correspondente: 7,
}

/** Detalhe de uma execução de conciliação + itens paginados/filtráveis. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const supabase = await createServerSupabaseClient()
  try {
    await requireLeaderApi(supabase)
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const admin = createAdminClient()
  const { data: runRow, error: runError } = await admin.from('reconciliation_runs').select('*').eq('id', runId).maybeSingle()
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 })
  if (!runRow) return NextResponse.json({ error: 'Execução não encontrada.' }, { status: 404 })

  const sp = req.nextUrl.searchParams
  // resultType aceita lista separada por vírgula — os cards de resumo
  // filtram por grupo (ex.: "divergências" = várias categorias de uma vez).
  const resultTypes   = (sp.get('resultType')?.split(',').filter(Boolean) ?? []) as ReconciliationResultType[]
  const operationType = sp.get('operationType') as ReconciliationOperationType | null
  const search        = sp.get('search')?.trim() ?? ''
  const sort          = sp.get('sort') ?? 'data_desc'
  const page           = Math.max(0, Number(sp.get('page') ?? '0') || 0)

  let query = admin.from('reconciliation_items').select('*', { count: 'exact' }).eq('run_id', runId)
  if (resultTypes.length === 1) query = query.eq('result_type', resultTypes[0])
  else if (resultTypes.length > 1) query = query.in('result_type', resultTypes)
  if (operationType) query = query.eq('operation_type', operationType)
  if (search) {
    const orFilters = [`stripe_charge_id.ilike.%${search}%`, `stripe_payment_intent_id.ilike.%${search}%`]
    if (UUID_RE.test(search)) orFilters.push(`local_id.eq.${search}`)
    query = query.or(orFilters.join(','))
  }
  query = query.order('provider_created_at', { ascending: sort === 'data_asc', nullsFirst: false })
  query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let items = (data ?? []).map(mapItemRow)
  // "Divergência primeiro" é ordenação por prioridade de categoria, não uma
  // coluna indexável — aplicada dentro da página já retornada (custo baixo,
  // página é limitada a PAGE_SIZE itens).
  if (sort === 'divergencia') {
    items = [...items].sort((a, b) => DIVERGENCE_PRIORITY[a.resultType] - DIVERGENCE_PRIORITY[b.resultType])
  }

  return NextResponse.json({ run: mapRunRow(runRow), items, total: count ?? 0, page, pageSize: PAGE_SIZE })
}
