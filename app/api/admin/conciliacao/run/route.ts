import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe, getStripeEnvironmentLabel } from '@/lib/stripe'
import { requireLeaderApi, ApiAuthError } from '@/lib/services/admin-auth'
import {
  bulkFindPurchasesByPaymentIntentIds, findSubscriptionInvoiceByPaymentIntentId, fetchLocalPaidRecordsInPeriod,
  buildCurrencySummary, buildPeriodRangeUtc,
} from '@/lib/services/reconciliation'
import type { ReconciliationOperationType, ReconciliationResultType } from '@/types'

const DEFAULT_MAX_CHARGES = 2000
// Teto de segurança sobrescrevível por env — período muito longo pede em
// lotes menores. Diferente da versão anterior, atingir o teto agora marca
// a execução como "concluído parcialmente" em vez de truncar em silêncio.
const MAX_CHARGES = Number(process.env.RECONCILIACAO_MAX_CHARGES) || DEFAULT_MAX_CHARGES

const VALID_OPERATION_TYPES: ReconciliationOperationType[] = ['creditos', 'apps', 'destaques', 'assinaturas']

// Janela de 24h na borda do período: ambiguidade entre o corte por
// charge.created (Stripe, UTC) e paid_at local vira "não verificável",
// nunca uma afirmação falsa de ausência.
const EDGE_SLOP_MS = 24 * 60 * 60 * 1000

interface RunItemDraft {
  resultType:             ReconciliationResultType
  operationType:          ReconciliationOperationType | null
  stripeChargeId:         string | null
  stripePaymentIntentId:  string | null
  providerAmount:         number | null
  providerCurrency:       string | null
  providerCreatedAt:      string | null
  localTable:             string | null
  localId:                string | null
  localAmount:            number | null
  localCurrency:          string | null
  localStatus:            string | null
  localRefundedAmount:    number | null
  localCreatedAt:         string | null
  note:                   string | null
}

function encodeLine(obj: unknown) {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n')
}

/**
 * Concilia manualmente, sob demanda: lista as cobranças bem-sucedidas do
 * Stripe no período, compara com o que está gravado localmente (crédito/
 * app/destaque-Stripe/assinatura — e-books e destaque manual ficam de fora
 * por desenho, sem identificador Stripe) e faz o reverse-check (local pago
 * sem cobrança Stripe correspondente). Não persiste nada durante o cálculo
 * — só grava reconciliation_runs/reconciliation_items UMA VEZ, ao final,
 * como retrato imutável da execução (nunca é atualizado depois).
 *
 * Resposta é NDJSON (uma linha JSON por estágio real) em vez de um JSON
 * único — dá pra mostrar progresso de verdade (sem inventar porcentagem)
 * sem precisar de fila/worker novo: ainda é uma única requisição HTTP.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  let userId: string
  try {
    const { user } = await requireLeaderApi(supabase)
    userId = user.id
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const body = await req.json().catch(() => null)
  const startDate = body?.startDate as string | undefined
  const endDate   = body?.endDate as string | undefined
  const operationTypesInput = Array.isArray(body?.operationTypes) ? (body.operationTypes as unknown[]) : []
  const operationTypes = operationTypesInput.filter(
    (t): t is ReconciliationOperationType => VALID_OPERATION_TYPES.includes(t as ReconciliationOperationType),
  )

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Informe o período (data inicial e final).' }, { status: 400 })
  }
  if (operationTypes.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos um tipo de operação.' }, { status: 400 })
  }

  const { gte, lte, gteIso, lteIso } = buildPeriodRangeUtc(startDate, endDate)
  if (!Number.isFinite(gte) || !Number.isFinite(lte) || gte > lte) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const environment: 'test' | 'live' = getStripeEnvironmentLabel() === 'Produção' ? 'live' : 'test'

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encodeLine(obj))
      const items: RunItemDraft[] = []
      // "tabela:id" — evita contar a mesma compra local 2x e detecta possível duplicidade.
      const matchedLocalKeys = new Set<string>()
      let checkedCount = 0
      let truncated = false
      let stripePagesFetched = 0

      try {
        send({ stage: 'consultando_pagamentos' })

        const succeededCharges: {
          id: string; paymentIntentId: string | null; amount: number; refunded: number; currency: string; createdAt: string
        }[] = []
        let startingAfter: string | undefined
        let hasMore = true

        while (hasMore) {
          const page = await stripe.charges.list({
            created: { gte, lte }, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}),
          })
          stripePagesFetched++
          for (const charge of page.data) {
            if (charge.status !== 'succeeded') continue
            if (succeededCharges.length >= MAX_CHARGES) break
            const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
            succeededCharges.push({
              id: charge.id, paymentIntentId,
              amount: charge.amount / 100, refunded: charge.amount_refunded / 100,
              currency: charge.currency, createdAt: new Date(charge.created * 1000).toISOString(),
            })
          }
          hasMore = page.has_more && succeededCharges.length < MAX_CHARGES
          startingAfter = page.data[page.data.length - 1]?.id
        }
        truncated = succeededCharges.length >= MAX_CHARGES

        send({ stage: 'carregando_registros_internos' })

        const pis = succeededCharges.map(c => c.paymentIntentId).filter((id): id is string => !!id)
        const bulkMatches = await bulkFindPurchasesByPaymentIntentIds(admin, pis)

        // PIs não resolvidos pelas 3 tabelas em lote caem no fallback de
        // assinatura (per-PI, via invoicePayments.list) — subconjunto
        // pequeno na prática (só cobrança de assinatura recorrente).
        const unresolvedPis = pis.filter(id => !bulkMatches.has(id))
        for (const pi of unresolvedPis) {
          const match = await findSubscriptionInvoiceByPaymentIntentId(admin, pi)
          if (match) bulkMatches.set(pi, match)
        }

        send({ stage: 'comparando_informacoes' })

        for (const charge of succeededCharges) {
          const match = charge.paymentIntentId ? bulkMatches.get(charge.paymentIntentId) : undefined

          if (!match) {
            checkedCount++
            items.push({
              resultType: 'sem_registro_local', operationType: null,
              stripeChargeId: charge.id, stripePaymentIntentId: charge.paymentIntentId,
              providerAmount: charge.amount, providerCurrency: charge.currency.toUpperCase(), providerCreatedAt: charge.createdAt,
              localTable: null, localId: null, localAmount: null, localCurrency: null, localStatus: null, localRefundedAmount: null, localCreatedAt: null,
              note: null,
            })
            continue
          }

          if (!operationTypes.includes(match.operationType)) continue // fora do escopo desta execução

          checkedCount++
          const localKey = `${match.table}:${match.id}`
          const base = {
            operationType:    match.operationType,
            stripeChargeId:   charge.id,
            stripePaymentIntentId: charge.paymentIntentId,
            providerAmount:   charge.amount,
            providerCurrency: charge.currency.toUpperCase(),
            providerCreatedAt: charge.createdAt,
            localTable:       match.table,
            localId:          match.id,
            localAmount:      match.amount,
            localCurrency:    match.currency,
            localStatus:      match.status,
            localRefundedAmount: match.refundedAmount,
            localCreatedAt:   match.paidAt,
          }

          if (matchedLocalKeys.has(localKey)) {
            items.push({ ...base, resultType: 'possivel_duplicidade', note: 'Mais de uma cobrança Stripe aponta pra mesma compra local — confira tentativas duplicadas.' })
            continue
          }
          matchedLocalKeys.add(localKey)

          if (match.currency.toUpperCase() !== charge.currency.toUpperCase()) {
            items.push({ ...base, resultType: 'diferenca_moeda', note: `Stripe em ${charge.currency.toUpperCase()}, registro local em ${match.currency.toUpperCase()}.` })
            continue
          }
          if (match.status !== 'paid' && match.status !== 'disputed') {
            items.push({ ...base, resultType: 'diferenca_status', note: `Stripe confirma pagamento, registro local está "${match.status}".` })
            continue
          }
          const amountDiff = Math.abs(match.amount - charge.amount) > 0.01
          const refundDiff = Math.abs(match.refundedAmount - charge.refunded) > 0.01
          if (amountDiff || refundDiff) {
            const notes: string[] = []
            if (amountDiff) notes.push(`Valor: Stripe R$ ${charge.amount.toFixed(2)} vs local R$ ${match.amount.toFixed(2)}`)
            if (refundDiff) notes.push(`Reembolso: Stripe R$ ${charge.refunded.toFixed(2)} vs local R$ ${match.refundedAmount.toFixed(2)}`)
            items.push({ ...base, resultType: 'diferenca_valor', note: notes.join(' · ') })
            continue
          }
          items.push({ ...base, resultType: 'correspondente', note: null })
        }

        // Reverse-check: local pago sem cobrança Stripe correspondente no período.
        const localRecords = await fetchLocalPaidRecordsInPeriod(admin, { gteIso, lteIso, operationTypes })
        const periodStartMs = new Date(gteIso).getTime()
        const periodEndMs   = new Date(lteIso).getTime()
        for (const rec of localRecords) {
          const key = `${rec.table}:${rec.id}`
          if (matchedLocalKeys.has(key)) continue // já casado no forward pass

          const paidAtMs = new Date(rec.paidAt).getTime()
          const nearEdge = (paidAtMs - periodStartMs) < EDGE_SLOP_MS || (periodEndMs - paidAtMs) < EDGE_SLOP_MS
          const resultType: ReconciliationResultType = (truncated || nearEdge) ? 'nao_verificavel' : 'sem_correspondencia_provedor'
          const note = truncated
            ? 'Execução parcial (teto de cobranças do Stripe atingido) — ausência não é conclusiva.'
            : nearEdge
              ? 'Registro local próximo à borda do período — pode ser efeito de fuso, não necessariamente ausência real no Stripe.'
              : 'Nenhuma cobrança Stripe bem-sucedida encontrada pra este registro local pago no período.'

          items.push({
            resultType, operationType: rec.operationType,
            stripeChargeId: null, stripePaymentIntentId: rec.paymentIntentId,
            providerAmount: null, providerCurrency: null, providerCreatedAt: null,
            localTable: rec.table, localId: rec.id, localAmount: rec.amount, localCurrency: rec.currency,
            localStatus: rec.status, localRefundedAmount: rec.refundedAmount, localCreatedAt: rec.paidAt,
            note,
          })
          checkedCount++
        }

        send({ stage: 'preparando_resultados' })

        const matchedCount = items.filter(i => i.resultType === 'correspondente').length
        const divergenceCount = items.filter(i =>
          i.resultType === 'diferenca_valor' || i.resultType === 'diferenca_moeda' ||
          i.resultType === 'diferenca_status' || i.resultType === 'possivel_duplicidade',
        ).length
        const noLocalMatchCount    = items.filter(i => i.resultType === 'sem_registro_local').length
        const noProviderMatchCount = items.filter(i => i.resultType === 'sem_correspondencia_provedor').length
        const notVerifiableCount   = items.filter(i => i.resultType === 'nao_verificavel').length

        const currencySummary = buildCurrencySummary(
          items
            .filter(i => i.providerAmount !== null || i.localAmount !== null)
            .map(i => ({
              currency: i.providerCurrency ?? i.localCurrency ?? 'BRL',
              providerAmount: i.providerAmount ?? 0,
              localAmount: i.localAmount ?? 0,
            })),
        )

        const status = truncated ? 'concluido_parcialmente' : 'concluido'
        const limitations: string[] = []
        if (truncated) limitations.push(`Teto de ${MAX_CHARGES} cobranças atingido — nem todo o período foi verificado.`)

        const nowIso = new Date().toISOString()
        const { data: run, error: runError } = await admin.from('reconciliation_runs').insert({
          requested_by: userId, provider: 'stripe', environment,
          period_start: startDate, period_end: endDate, timezone: 'America/Sao_Paulo',
          operation_types: operationTypes, comparison_rule_version: 'v1',
          status, started_at: nowIso, finished_at: nowIso,
          checked_count: checkedCount, matched_count: matchedCount, divergence_count: divergenceCount,
          no_local_match_count: noLocalMatchCount, no_provider_match_count: noProviderMatchCount, not_verifiable_count: notVerifiableCount,
          currency_summary: currencySummary,
          coverage: { tablesChecked: operationTypes, stripePagesFetched, truncated },
          limitations,
        }).select('id').single()

        if (runError || !run) throw new Error(runError?.message ?? 'Falha ao gravar execução de conciliação.')

        if (items.length > 0) {
          const rows = items.map(i => ({
            run_id: run.id, result_type: i.resultType, operation_type: i.operationType,
            stripe_charge_id: i.stripeChargeId, stripe_payment_intent_id: i.stripePaymentIntentId,
            provider_amount: i.providerAmount, provider_currency: i.providerCurrency, provider_created_at: i.providerCreatedAt,
            local_table: i.localTable, local_id: i.localId, local_amount: i.localAmount, local_currency: i.localCurrency,
            local_status: i.localStatus, local_refunded_amount: i.localRefundedAmount, local_created_at: i.localCreatedAt,
            note: i.note,
          }))
          // Lotes de 500 — período grande pode gerar milhares de itens.
          for (let i = 0; i < rows.length; i += 500) {
            await admin.from('reconciliation_items').insert(rows.slice(i, i + 500))
          }
        }

        send({
          stage: 'concluido', runId: run.id, status,
          summary: { checkedCount, matchedCount, divergenceCount, noLocalMatchCount, noProviderMatchCount, notVerifiableCount, currencySummary, truncated },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha desconhecida na conciliação.'
        try {
          const nowIso = new Date().toISOString()
          await admin.from('reconciliation_runs').insert({
            requested_by: userId, provider: 'stripe', environment,
            period_start: startDate, period_end: endDate, timezone: 'America/Sao_Paulo',
            operation_types: operationTypes, comparison_rule_version: 'v1',
            status: 'falhou', started_at: nowIso, finished_at: nowIso, error_message: message,
          })
        } catch {
          // Se nem o registro de falha grava, o stream ainda reporta o erro ao cliente abaixo.
        }
        send({ stage: 'falhou', error: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
