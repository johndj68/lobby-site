import { stripe } from '@/lib/stripe'
import type { createAdminClient } from '@/lib/supabase-admin'
import type { ReconciliationOperationType, ReconciliationRun, ReconciliationItem } from '@/types'

type AdminClient = ReturnType<typeof createAdminClient>

export type PurchaseTable = 'campaign_purchases' | 'credit_purchases' | 'app_purchases' | 'subscription_invoices'

export const TABLE_OPERATION_TYPE: Record<PurchaseTable, ReconciliationOperationType> = {
  campaign_purchases:    'destaques',
  credit_purchases:      'creditos',
  app_purchases:         'apps',
  subscription_invoices: 'assinaturas',
}

export interface MatchedPurchase {
  table:          PurchaseTable
  operationType:  ReconciliationOperationType
  id:             string
  amount:         number
  currency:       string
  status:         string
  refundedAmount: number
  paidAt:         string | null
}

/**
 * Mesma cascata de lookup por payment_intent usada em handleDisputeCreated
 * (app/api/stripe/webhook/route.ts) — duplicada aqui de propósito em vez
 * de compartilhada: a versão do webhook está testada e em produção, mexer
 * nela pra extrair um helper genérico é risco desnecessário pra uma tela
 * de conciliação manual que não tem pressa.
 *
 * app_purchases/subscription_invoices não têm coluna de reembolso parcial
 * (peça 1 só cobriu credit_purchases/financial_transactions — gap já
 * sinalizado, não resolvido aqui) — refundedAmount fica sempre 0 pra essas
 * duas, nunca inventado.
 *
 * Usada como fallback per-PI só pra assinaturas (ver
 * bulkFindPurchasesByPaymentIntentIds) — as outras 3 tabelas são resolvidas
 * em lote pra evitar N round-trips sequenciais num período com muitas cobranças.
 */
export async function findPurchaseByPaymentIntentId(admin: AdminClient, paymentIntentId: string): Promise<MatchedPurchase | null> {
  const { data: campaignPurchase } = await admin
    .from('campaign_purchases').select('id, amount, currency, status, refund_status, paid_at')
    .eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
  if (campaignPurchase) {
    return {
      table: 'campaign_purchases', operationType: 'destaques', id: campaignPurchase.id,
      amount: Number(campaignPurchase.amount), currency: campaignPurchase.currency ?? 'BRL', status: campaignPurchase.status,
      refundedAmount: campaignPurchase.refund_status === 'refunded' ? Number(campaignPurchase.amount) : 0,
      paidAt: campaignPurchase.paid_at,
    }
  }

  const { data: creditPurchase } = await admin
    .from('credit_purchases').select('id, amount_paid, currency, status, refunded_amount, paid_at')
    .eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
  if (creditPurchase) {
    return {
      table: 'credit_purchases', operationType: 'creditos', id: creditPurchase.id,
      amount: Number(creditPurchase.amount_paid), currency: creditPurchase.currency ?? 'BRL', status: creditPurchase.status,
      refundedAmount: Number(creditPurchase.refunded_amount ?? 0), paidAt: creditPurchase.paid_at,
    }
  }

  const { data: appPurchase } = await admin
    .from('app_purchases').select('id, amount, currency, status, paid_at')
    .eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
  if (appPurchase) {
    return {
      table: 'app_purchases', operationType: 'apps', id: appPurchase.id,
      amount: Number(appPurchase.amount), currency: appPurchase.currency ?? 'BRL', status: appPurchase.status,
      refundedAmount: 0, paidAt: appPurchase.paid_at,
    }
  }

  return findSubscriptionInvoiceByPaymentIntentId(admin, paymentIntentId)
}

/**
 * Só o braço de assinatura da cascata acima — usado isoladamente no
 * fallback per-PI de bulkFindPurchasesByPaymentIntentIds (PIs não
 * resolvidos pelas 3 tabelas em lote). Evita reconsultar campaign/credit/
 * app_purchases de novo por PI já descartado nessas 3 tabelas.
 */
export async function findSubscriptionInvoiceByPaymentIntentId(admin: AdminClient, paymentIntentId: string): Promise<MatchedPurchase | null> {
  const invoicePayments = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: paymentIntentId }, limit: 1 })
  const invoiceRef = invoicePayments.data[0]?.invoice
  const invoiceId  = typeof invoiceRef === 'string' ? invoiceRef : invoiceRef?.id
  if (!invoiceId) return null

  const { data: subInvoice } = await admin
    .from('subscription_invoices').select('id, amount, currency, paid_at')
    .eq('stripe_invoice_id', invoiceId).maybeSingle()
  if (!subInvoice) return null

  return {
    table: 'subscription_invoices', operationType: 'assinaturas', id: subInvoice.id,
    amount: Number(subInvoice.amount), currency: subInvoice.currency ?? 'BRL', status: 'paid',
    refundedAmount: 0, paidAt: subInvoice.paid_at,
  }
}

/**
 * Resolve um lote de payment_intent ids de uma vez, com 3 queries `.in()`
 * em paralelo (campaign/credit/app_purchases) em vez de N chamadas
 * sequenciais por cobrança — gargalo real de um run com muitas cobranças
 * no período. subscription_invoices fica fora daqui de propósito: só é
 * resolvida via stripe.invoicePayments.list por PI (chamada extra),
 * então continua no fallback per-PI de findPurchaseByPaymentIntentId,
 * aplicado só aos PIs que sobrarem sem match nas 3 tabelas em lote.
 */
export async function bulkFindPurchasesByPaymentIntentIds(admin: AdminClient, paymentIntentIds: string[]): Promise<Map<string, MatchedPurchase>> {
  const map = new Map<string, MatchedPurchase>()
  if (paymentIntentIds.length === 0) return map

  const [{ data: campaigns }, { data: credits }, { data: apps }] = await Promise.all([
    admin.from('campaign_purchases').select('id, amount, currency, status, refund_status, paid_at, stripe_payment_intent_id').in('stripe_payment_intent_id', paymentIntentIds),
    admin.from('credit_purchases').select('id, amount_paid, currency, status, refunded_amount, paid_at, stripe_payment_intent_id').in('stripe_payment_intent_id', paymentIntentIds),
    admin.from('app_purchases').select('id, amount, currency, status, paid_at, stripe_payment_intent_id').in('stripe_payment_intent_id', paymentIntentIds),
  ])

  // Ordem de precedência igual à cascata original — se por algum motivo o
  // mesmo PI aparecer em mais de uma tabela, a primeira encontrada vence.
  for (const c of campaigns ?? []) {
    if (!c.stripe_payment_intent_id || map.has(c.stripe_payment_intent_id)) continue
    map.set(c.stripe_payment_intent_id, {
      table: 'campaign_purchases', operationType: 'destaques', id: c.id,
      amount: Number(c.amount), currency: c.currency ?? 'BRL', status: c.status,
      refundedAmount: c.refund_status === 'refunded' ? Number(c.amount) : 0, paidAt: c.paid_at,
    })
  }
  for (const c of credits ?? []) {
    if (!c.stripe_payment_intent_id || map.has(c.stripe_payment_intent_id)) continue
    map.set(c.stripe_payment_intent_id, {
      table: 'credit_purchases', operationType: 'creditos', id: c.id,
      amount: Number(c.amount_paid), currency: c.currency ?? 'BRL', status: c.status,
      refundedAmount: Number(c.refunded_amount ?? 0), paidAt: c.paid_at,
    })
  }
  for (const a of apps ?? []) {
    if (!a.stripe_payment_intent_id || map.has(a.stripe_payment_intent_id)) continue
    map.set(a.stripe_payment_intent_id, {
      table: 'app_purchases', operationType: 'apps', id: a.id,
      amount: Number(a.amount), currency: a.currency ?? 'BRL', status: a.status,
      refundedAmount: 0, paidAt: a.paid_at,
    })
  }

  return map
}

export interface LocalPaidRecord {
  table:           PurchaseTable
  operationType:   ReconciliationOperationType
  id:              string
  amount:          number
  currency:        string
  status:          string
  refundedAmount:  number
  paidAt:          string
  paymentIntentId: string | null
}

/**
 * Busca em lote (1 query por tabela, não por registro) tudo que está
 * marcado como pago localmente dentro do período — base do reverse-check
 * (seção "Sem correspondência no provedor"). campaign_purchases só entra
 * com kind='stripe': isento/manual_externo são pagamento manual por
 * desenho, nunca "Stripe faltando".
 */
export async function fetchLocalPaidRecordsInPeriod(
  admin: AdminClient,
  { gteIso, lteIso, operationTypes }: { gteIso: string; lteIso: string; operationTypes: ReconciliationOperationType[] },
): Promise<LocalPaidRecord[]> {
  const records: LocalPaidRecord[] = []
  const want = new Set(operationTypes)

  const queries: PromiseLike<void>[] = []

  if (want.has('destaques')) {
    queries.push(
      admin.from('campaign_purchases')
        .select('id, amount, currency, status, refund_status, paid_at, stripe_payment_intent_id')
        .eq('kind', 'stripe').eq('status', 'paid').gte('paid_at', gteIso).lte('paid_at', lteIso)
        .then(({ data }) => {
          for (const c of data ?? []) {
            records.push({
              table: 'campaign_purchases', operationType: 'destaques', id: c.id,
              amount: Number(c.amount), currency: c.currency ?? 'BRL', status: c.status,
              refundedAmount: c.refund_status === 'refunded' ? Number(c.amount) : 0,
              paidAt: c.paid_at, paymentIntentId: c.stripe_payment_intent_id,
            })
          }
        }),
    )
  }
  if (want.has('creditos')) {
    queries.push(
      admin.from('credit_purchases')
        .select('id, amount_paid, currency, status, refunded_amount, paid_at, stripe_payment_intent_id')
        .eq('status', 'paid').gte('paid_at', gteIso).lte('paid_at', lteIso)
        .then(({ data }) => {
          for (const c of data ?? []) {
            records.push({
              table: 'credit_purchases', operationType: 'creditos', id: c.id,
              amount: Number(c.amount_paid), currency: c.currency ?? 'BRL', status: c.status,
              refundedAmount: Number(c.refunded_amount ?? 0),
              paidAt: c.paid_at, paymentIntentId: c.stripe_payment_intent_id,
            })
          }
        }),
    )
  }
  if (want.has('apps')) {
    queries.push(
      admin.from('app_purchases')
        .select('id, amount, currency, status, paid_at, stripe_payment_intent_id')
        .eq('status', 'paid').gte('paid_at', gteIso).lte('paid_at', lteIso)
        .then(({ data }) => {
          for (const a of data ?? []) {
            records.push({
              table: 'app_purchases', operationType: 'apps', id: a.id,
              amount: Number(a.amount), currency: a.currency ?? 'BRL', status: a.status,
              refundedAmount: 0, paidAt: a.paid_at, paymentIntentId: a.stripe_payment_intent_id,
            })
          }
        }),
    )
  }
  if (want.has('assinaturas')) {
    queries.push(
      admin.from('subscription_invoices')
        .select('id, amount, currency, paid_at')
        .gte('paid_at', gteIso).lte('paid_at', lteIso)
        .then(({ data }) => {
          for (const s of data ?? []) {
            records.push({
              table: 'subscription_invoices', operationType: 'assinaturas', id: s.id,
              amount: Number(s.amount), currency: s.currency ?? 'BRL', status: 'paid',
              refundedAmount: 0, paidAt: s.paid_at, paymentIntentId: null,
            })
          }
        }),
    )
  }

  await Promise.all(queries)
  return records
}

export interface CurrencySummaryInput {
  currency:       string
  providerAmount: number
  localAmount:    number
}

/** Agrega valores comparáveis por moeda — nunca soma moedas diferentes entre si. */
export function buildCurrencySummary(rows: CurrencySummaryInput[]): { currency: string; providerAmount: number; localAmount: number; difference: number }[] {
  const byCurrency = new Map<string, { providerAmount: number; localAmount: number }>()
  for (const r of rows) {
    const cur = byCurrency.get(r.currency) ?? { providerAmount: 0, localAmount: 0 }
    cur.providerAmount += r.providerAmount
    cur.localAmount    += r.localAmount
    byCurrency.set(r.currency, cur)
  }
  return [...byCurrency.entries()].map(([currency, v]) => ({
    currency, providerAmount: v.providerAmount, localAmount: v.localAmount, difference: v.providerAmount - v.localAmount,
  }))
}

/**
 * Converte o período (datas de calendário, sem hora) pro range UTC usado
 * nas queries — âncora é America/Sao_Paulo. Offset fixo -03:00 é seguro:
 * o Brasil aboliu horário de verão em 2019, não há mais variação sazonal
 * a considerar (evita puxar dependência nova só pra isso).
 */
/** Linha crua de reconciliation_runs (snake_case) → tipo de domínio (camelCase). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRunRow(row: any): ReconciliationRun {
  return {
    id: row.id, requestedBy: row.requested_by, provider: row.provider, environment: row.environment,
    periodStart: row.period_start, periodEnd: row.period_end, timezone: row.timezone,
    operationTypes: row.operation_types ?? [], comparisonRuleVersion: row.comparison_rule_version,
    status: row.status, startedAt: row.started_at, finishedAt: row.finished_at,
    checkedCount: row.checked_count, matchedCount: row.matched_count, divergenceCount: row.divergence_count,
    noLocalMatchCount: row.no_local_match_count, noProviderMatchCount: row.no_provider_match_count, notVerifiableCount: row.not_verifiable_count,
    currencySummary: row.currency_summary ?? [], coverage: row.coverage ?? { tablesChecked: [], stripePagesFetched: 0, truncated: false },
    limitations: row.limitations ?? [], errorMessage: row.error_message,
  }
}

/** Linha crua de reconciliation_items (snake_case) → tipo de domínio (camelCase). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapItemRow(row: any): ReconciliationItem {
  return {
    id: row.id, runId: row.run_id, resultType: row.result_type, operationType: row.operation_type,
    stripeChargeId: row.stripe_charge_id, stripePaymentIntentId: row.stripe_payment_intent_id,
    providerAmount: row.provider_amount !== null ? Number(row.provider_amount) : null,
    providerCurrency: row.provider_currency, providerCreatedAt: row.provider_created_at,
    localTable: row.local_table, localId: row.local_id,
    localAmount: row.local_amount !== null ? Number(row.local_amount) : null,
    localCurrency: row.local_currency, localStatus: row.local_status,
    localRefundedAmount: row.local_refunded_amount !== null ? Number(row.local_refunded_amount) : null,
    localCreatedAt: row.local_created_at, note: row.note,
  }
}

export function buildPeriodRangeUtc(startDate: string, endDate: string) {
  const gteDate = new Date(`${startDate}T00:00:00-03:00`)
  const lteDate = new Date(`${endDate}T23:59:59-03:00`)
  return {
    gte: Math.floor(gteDate.getTime() / 1000),
    lte: Math.floor(lteDate.getTime() / 1000),
    gteIso: gteDate.toISOString(),
    lteIso: lteDate.toISOString(),
  }
}
