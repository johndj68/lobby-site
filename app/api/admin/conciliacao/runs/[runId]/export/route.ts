import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'
import { mapItemRow } from '@/lib/services/reconciliation'
import { escapeCsvField, formatCurrencyBRL } from '@/lib/finance'
import { OPERATION_TYPE_LABEL, RESULT_TYPE_LABEL } from '@/lib/reconciliation-labels'
import type { ReconciliationOperationType, ReconciliationResultType } from '@/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Export CSV do resultado de uma execução — mesma permissão do painel,
 * respeita os filtros ativos (deixa explícito no cabeçalho se é resultado
 * completo ou filtrado), escapa contra CSV-injection (fórmula).
 */
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
  const resultTypes   = (sp.get('resultType')?.split(',').filter(Boolean) ?? []) as ReconciliationResultType[]
  const operationType = sp.get('operationType') as ReconciliationOperationType | null
  const search        = sp.get('search')?.trim() ?? ''
  const isFiltered    = Boolean(resultTypes.length || operationType || search)

  let query = admin.from('reconciliation_items').select('*').eq('run_id', runId).order('provider_created_at', { ascending: false })
  if (resultTypes.length === 1) query = query.eq('result_type', resultTypes[0])
  else if (resultTypes.length > 1) query = query.in('result_type', resultTypes)
  if (operationType) query = query.eq('operation_type', operationType)
  if (search) {
    const orFilters = [`stripe_charge_id.ilike.%${search}%`, `stripe_payment_intent_id.ilike.%${search}%`]
    if (UUID_RE.test(search)) orFilters.push(`local_id.eq.${search}`)
    query = query.or(orFilters.join(','))
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const items = (data ?? []).map(mapItemRow)

  const headers = [
    'ID da execução', 'Data da execução', 'Período', 'Provedor', 'Ambiente', 'Operação',
    'Referência local', 'Referência do provedor', 'Moeda', 'Valor provedor', 'Valor local', 'Resultado', 'Motivo',
  ]
  const escape = escapeCsvField
  const lines = items.map(i => [
    runRow.id,
    new Date(runRow.started_at).toLocaleString('pt-BR'),
    `${runRow.period_start} a ${runRow.period_end}`,
    'Stripe',
    runRow.environment === 'live' ? 'Produção' : 'Teste',
    i.operationType ? OPERATION_TYPE_LABEL[i.operationType] : '—',
    i.localTable && i.localId ? `${i.localTable}:${i.localId}` : '—',
    i.stripeChargeId ?? i.stripePaymentIntentId ?? '—',
    i.providerCurrency ?? i.localCurrency ?? 'BRL',
    i.providerAmount !== null ? formatCurrencyBRL(i.providerAmount) : '—',
    i.localAmount !== null ? formatCurrencyBRL(i.localAmount) : '—',
    RESULT_TYPE_LABEL[i.resultType],
    i.note ?? '',
  ].map(v => escape(String(v))).join(';'))

  const scopeNote = isFiltered ? 'Resultado FILTRADO (conforme filtros ativos no momento da exportação)' : 'Resultado COMPLETO da execução'
  const csv = '﻿' + [escape(scopeNote), headers.map(escape).join(';'), ...lines].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="conciliacao-${runRow.id}${isFiltered ? '-filtrado' : ''}.csv"`,
    },
  })
}
