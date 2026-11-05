import { describe, it, expect, vi, beforeAll, afterEach, beforeEach } from 'vitest'

vi.mock('@/lib/stripe', () => ({
  stripe: {
    charges: { list: vi.fn() },
    invoicePayments: { list: vi.fn().mockResolvedValue({ data: [] }) },
  },
  getStripeEnvironmentLabel: vi.fn(() => 'Teste'),
}))

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

type Row = Record<string, unknown>

/**
 * Mock genérico de query builder do Supabase: qualquer método de filtro
 * (select/eq/in/gte/lte/order/range/limit) devolve a própria chain — o
 * "banco" não filtra de verdade, cada tabela sempre responde com o fixture
 * configurado em `responses[table]`, seja a chamada em lote (.in) ou o
 * reverse-check (.eq/.gte/.lte). Isso é seguro pros testes porque cada
 * cenário controla o fixture por tabela, não por chamada.
 */
function makeAdmin(responses: Record<string, Row | Row[] | null>, inserted: Record<string, unknown[]> = {}) {
  const from = vi.fn((table: string) => {
    const raw = responses[table] ?? null
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      range: () => chain,
      limit: () => chain,
      insert: (payload: unknown) => {
        inserted[table] = inserted[table] ?? []
        inserted[table].push(payload)
        return chain
      },
      // A rota agora cria o run com status 'em_processamento' e só depois
      // faz UPDATE pra 'concluido'/'falhou' (uma vez os itens persistirem)
      // — simula isso mesclando no último registro inserido da tabela, pra
      // `inserted.reconciliation_runs[0]` continuar refletindo o estado
      // final sem virar uma segunda linha.
      update: (payload: unknown) => {
        const list = (inserted[table] = inserted[table] ?? [])
        const last = list[list.length - 1]
        if (last && typeof last === 'object') {
          list[list.length - 1] = { ...(last as Row), ...(payload as Row) }
        } else {
          list.push(payload)
        }
        return chain
      },
      // .single() após .insert(...).select('id') precisa de uma linha —
      // sintetiza um id quando a tabela não foi configurada explicitamente
      // (cenário comum: reconciliation_runs não é o foco do teste).
      single: () => Promise.resolve({ data: Array.isArray(raw) ? (raw[0] ?? { id: `auto-${table}` }) : (raw ?? { id: `auto-${table}` }), error: null }),
      maybeSingle: () => Promise.resolve({ data: Array.isArray(raw) ? (raw[0] ?? null) : raw, error: null }),
      then: (resolve: (v: unknown) => void) => Promise.resolve({ data: arr, error: null, count: arr.length }).then(resolve),
    }
    return chain
  })
  return { from, __inserted: inserted }
}

const leaderSupabase = () => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'leader-1' } } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { role: 'technician', is_leader: true } }) }) }) }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any)

const nonLeaderSupabase = () => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { role: 'technician', is_leader: false } }) }) }) }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any)

function makeReq(body: unknown) {
  return new Request('http://localhost/api/admin/conciliacao/run', { method: 'POST', body: JSON.stringify(body) })
}

function chargesPage(data: unknown[], hasMore = false) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data, has_more: hasMore } as any
}

async function readNdjson(res: Response): Promise<{ stage: string; [k: string]: unknown }[]> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const lines: { stage: string; [k: string]: unknown }[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (line.trim()) lines.push(JSON.parse(line))
    }
  }
  return lines
}

let POST: (req: Request) => Promise<Response>
let reconciliation: typeof import('@/lib/services/reconciliation')

beforeAll(async () => {
  const mod = await import('@/app/api/admin/conciliacao/run/route')
  POST = mod.POST as unknown as (req: Request) => Promise<Response>
  reconciliation = await import('@/lib/services/reconciliation')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('findPurchaseByPaymentIntentId', () => {
  it('acha em campaign_purchases primeiro', async () => {
    const admin = makeAdmin({ campaign_purchases: { id: 'cp-1', amount: 100, currency: 'BRL', status: 'paid', refund_status: null, paid_at: '2026-01-10T12:00:00Z' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reconciliation.findPurchaseByPaymentIntentId(admin as any, 'pi_x')
    expect(result).toEqual({ table: 'campaign_purchases', operationType: 'destaques', id: 'cp-1', amount: 100, currency: 'BRL', status: 'paid', refundedAmount: 0, paidAt: '2026-01-10T12:00:00Z' })
  })

  it('campanha reembolsada totalmente reflete refundedAmount = amount', async () => {
    const admin = makeAdmin({ campaign_purchases: { id: 'cp-1', amount: 100, currency: 'BRL', status: 'refunded', refund_status: 'refunded', paid_at: null } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reconciliation.findPurchaseByPaymentIntentId(admin as any, 'pi_x')
    expect(result?.refundedAmount).toBe(100)
  })

  it('cai pra credit_purchases quando não acha em campaign_purchases', async () => {
    const admin = makeAdmin({ credit_purchases: { id: 'crp-1', amount_paid: 60, currency: 'BRL', status: 'paid', refunded_amount: 10, paid_at: '2026-01-05T00:00:00Z' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reconciliation.findPurchaseByPaymentIntentId(admin as any, 'pi_x')
    expect(result).toEqual({ table: 'credit_purchases', operationType: 'creditos', id: 'crp-1', amount: 60, currency: 'BRL', status: 'paid', refundedAmount: 10, paidAt: '2026-01-05T00:00:00Z' })
  })

  it('cai pra app_purchases quando não acha nas 2 primeiras', async () => {
    const admin = makeAdmin({ app_purchases: { id: 'ap-1', amount: 200, currency: 'BRL', status: 'paid', paid_at: '2026-01-06T00:00:00Z' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reconciliation.findPurchaseByPaymentIntentId(admin as any, 'pi_x')
    expect(result).toEqual({ table: 'app_purchases', operationType: 'apps', id: 'ap-1', amount: 200, currency: 'BRL', status: 'paid', refundedAmount: 0, paidAt: '2026-01-06T00:00:00Z' })
  })

  it('app_purchases com reembolso parcial confirmado reflete refundedAmount real (regressão: não fica hardcoded em 0)', async () => {
    const admin = makeAdmin({ app_purchases: { id: 'ap-2', amount: 200, currency: 'BRL', status: 'paid', paid_at: '2026-01-06T00:00:00Z', refunded_amount: 50 } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reconciliation.findPurchaseByPaymentIntentId(admin as any, 'pi_x')
    expect(result?.refundedAmount).toBe(50)
  })

  it('cai pra subscription_invoices via invoicePayments.list quando nenhuma das 3 tabelas com payment_intent direto bate', async () => {
    const { stripe } = await import('@/lib/stripe')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(stripe.invoicePayments.list).mockResolvedValueOnce({ data: [{ invoice: 'in_test_1' }] } as any)
    const admin = makeAdmin({ subscription_invoices: { id: 'si-1', amount: 99, currency: 'BRL', paid_at: '2026-01-07T00:00:00Z' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reconciliation.findPurchaseByPaymentIntentId(admin as any, 'pi_x')
    expect(result).toEqual({ table: 'subscription_invoices', operationType: 'assinaturas', id: 'si-1', amount: 99, currency: 'BRL', status: 'paid', refundedAmount: 0, paidAt: '2026-01-07T00:00:00Z' })
  })

  it('devolve null quando nada bate em lugar nenhum', async () => {
    const { stripe } = await import('@/lib/stripe')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(stripe.invoicePayments.list).mockResolvedValueOnce({ data: [] } as any)
    const admin = makeAdmin({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reconciliation.findPurchaseByPaymentIntentId(admin as any, 'pi_x')
    expect(result).toBeNull()
  })
})

describe('bulkFindPurchasesByPaymentIntentIds', () => {
  it('devolve mapa vazio pra lista vazia sem consultar nada', async () => {
    const admin = makeAdmin({})
    const result = await reconciliation.bulkFindPurchasesByPaymentIntentIds(admin as never, [])
    expect(result.size).toBe(0)
  })

  it('resolve em lote e respeita precedência campaign > credit > app', async () => {
    const admin = makeAdmin({
      campaign_purchases: { id: 'cp-1', amount: 10, currency: 'BRL', status: 'paid', refund_status: null, paid_at: null, stripe_payment_intent_id: 'pi_a' },
      credit_purchases:   { id: 'crp-1', amount_paid: 20, currency: 'BRL', status: 'paid', refunded_amount: 0, paid_at: null, stripe_payment_intent_id: 'pi_b' },
      app_purchases:      { id: 'ap-1', amount: 30, currency: 'BRL', status: 'paid', paid_at: null, stripe_payment_intent_id: 'pi_c' },
    })
    const result = await reconciliation.bulkFindPurchasesByPaymentIntentIds(admin as never, ['pi_a', 'pi_b', 'pi_c'])
    expect(result.get('pi_a')?.table).toBe('campaign_purchases')
    expect(result.get('pi_b')?.table).toBe('credit_purchases')
    expect(result.get('pi_c')?.table).toBe('app_purchases')
  })

  it('resolve refundedAmount real de app_purchases em lote (regressão: não fica hardcoded em 0)', async () => {
    const admin = makeAdmin({
      app_purchases: { id: 'ap-3', amount: 100, currency: 'BRL', status: 'paid', paid_at: null, stripe_payment_intent_id: 'pi_refunded', refunded_amount: 30 },
    })
    const result = await reconciliation.bulkFindPurchasesByPaymentIntentIds(admin as never, ['pi_refunded'])
    expect(result.get('pi_refunded')?.refundedAmount).toBe(30)
  })
})

describe('buildCurrencySummary', () => {
  it('agrega por moeda sem somar moedas diferentes', () => {
    const result = reconciliation.buildCurrencySummary([
      { currency: 'BRL', providerAmount: 100, localAmount: 100 },
      { currency: 'BRL', providerAmount: 50, localAmount: 40 },
      { currency: 'USD', providerAmount: 10, localAmount: 10 },
    ])
    const brl = result.find(r => r.currency === 'BRL')
    const usd = result.find(r => r.currency === 'USD')
    expect(brl).toEqual({ currency: 'BRL', providerAmount: 150, localAmount: 140, difference: 10 })
    expect(usd).toEqual({ currency: 'USD', providerAmount: 10, localAmount: 10, difference: 0 })
  })
})

describe('buildPeriodRangeUtc', () => {
  it('ancora meia-noite em America/Sao_Paulo (UTC-3), não UTC literal', () => {
    const { gteIso } = reconciliation.buildPeriodRangeUtc('2026-01-10', '2026-01-10')
    // 00:00 em São Paulo (UTC-3) = 03:00 UTC
    expect(gteIso).toBe('2026-01-10T03:00:00.000Z')
  })
})

describe('POST /api/admin/conciliacao/run', () => {
  it('retorna 401 quando não autenticado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
    expect(res.status).toBe(401)
  })

  it('retorna 403 quando não é líder', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(nonLeaderSupabase())
    const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
    expect(res.status).toBe(403)
  })

  it('retorna 400 sem tipos de operação selecionados', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(leaderSupabase())
    const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: [] }))
    expect(res.status).toBe(400)
  })

  it('retorna 400 com período invertido', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(leaderSupabase())
    const res = await POST(makeReq({ startDate: '2026-02-01', endDate: '2026-01-01', operationTypes: ['creditos'] }))
    expect(res.status).toBe(400)
  })

  describe('cenários de comparação (stream concluído)', () => {
    const setup = async (responses: Record<string, Row | Row[] | null>, chargesData: unknown[]) => {
      const { createServerSupabaseClient } = await import('@/lib/supabase-server')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { stripe } = await import('@/lib/stripe')
      vi.mocked(createServerSupabaseClient).mockResolvedValue(leaderSupabase())
      const inserted: Record<string, unknown[]> = {}
      const admin = makeAdmin(responses, inserted)
      vi.mocked(createAdminClient).mockReturnValue(admin as never)
      vi.mocked(stripe.charges.list).mockResolvedValueOnce(chargesPage(chargesData))
      return { inserted }
    }

    it('cobrança sem correspondência local vira sem_registro_local', async () => {
      const { inserted } = await setup({}, [
        { id: 'ch_1', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_orphan', currency: 'brl', created: 1700000000 },
      ])
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos', 'apps', 'destaques', 'assinaturas'] }))
      const lines = await readNdjson(res)
      const final = lines.at(-1)!
      expect(final.stage).toBe('concluido')
      expect((final.summary as { noLocalMatchCount: number }).noLocalMatchCount).toBe(1)
      expect(inserted.reconciliation_runs).toHaveLength(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((inserted.reconciliation_runs[0] as any).status).toBe('concluido')
    })

    it('correspondência exata vira correspondente', async () => {
      await setup(
        { app_purchases: { id: 'ap-1', amount: 100, currency: 'BRL', status: 'paid', paid_at: '2026-01-15T00:00:00Z', stripe_payment_intent_id: 'pi_ok' } },
        [{ id: 'ch_2', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_ok', currency: 'brl', created: 1700000000 }],
      )
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['apps'] }))
      const final = (await readNdjson(res)).at(-1)!
      expect((final.summary as { matchedCount: number }).matchedCount).toBe(1)
      expect((final.summary as { divergenceCount: number }).divergenceCount).toBe(0)
    })

    it('app_purchase parcialmente reembolsada bate com o amount_refunded do Stripe — não gera falso-positivo (regressão FIN-2)', async () => {
      // Antes da correção, refundedAmount de app_purchases ficava sempre
      // hardcoded em 0 na conciliação — mesmo essa compra tendo sido
      // reembolsada de verdade (refunded_amount=30 no banco, confirmado
      // pelo webhook). O Stripe mostra amount_refunded=30 pra mesma
      // cobrança: antes, 0 (local) != 30 (Stripe) virava "diferenca_valor"
      // pra toda compra parcialmente reembolsada, pra sempre — um
      // falso-positivo permanente. Depois da correção, os dois batem.
      await setup(
        { app_purchases: { id: 'ap-refund-1', amount: 100, currency: 'BRL', status: 'paid', paid_at: '2026-01-15T00:00:00Z', stripe_payment_intent_id: 'pi_refund_ok', refunded_amount: 30 } },
        [{ id: 'ch_refund', status: 'succeeded', amount: 10000, amount_refunded: 3000, payment_intent: 'pi_refund_ok', currency: 'brl', created: 1700000000 }],
      )
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['apps'] }))
      const final = (await readNdjson(res)).at(-1)!
      expect((final.summary as { matchedCount: number }).matchedCount).toBe(1)
      expect((final.summary as { divergenceCount: number }).divergenceCount).toBe(0)
    })

    it('valor local diferente vira diferenca_valor', async () => {
      await setup(
        { credit_purchases: { id: 'crp-1', amount_paid: 50, currency: 'BRL', status: 'paid', refunded_amount: 0, paid_at: '2026-01-15T00:00:00Z', stripe_payment_intent_id: 'pi_mismatch' } },
        [{ id: 'ch_3', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_mismatch', currency: 'brl', created: 1700000000 }],
      )
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
      const final = (await readNdjson(res)).at(-1)!
      expect((final.summary as { divergenceCount: number }).divergenceCount).toBe(1)
    })

    it('status local não pago vira diferenca_status', async () => {
      await setup(
        { credit_purchases: { id: 'crp-2', amount_paid: 100, currency: 'BRL', status: 'pending', refunded_amount: 0, paid_at: null, stripe_payment_intent_id: 'pi_status' } },
        [{ id: 'ch_4', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_status', currency: 'brl', created: 1700000000 }],
      )
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
      const final = (await readNdjson(res)).at(-1)!
      expect((final.summary as { divergenceCount: number }).divergenceCount).toBe(1)
    })

    it('moeda local diferente da cobrança vira diferenca_moeda', async () => {
      await setup(
        { credit_purchases: { id: 'crp-3', amount_paid: 100, currency: 'BRL', status: 'paid', refunded_amount: 0, paid_at: '2026-01-15T00:00:00Z', stripe_payment_intent_id: 'pi_cur' } },
        [{ id: 'ch_5', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_cur', currency: 'usd', created: 1700000000 }],
      )
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
      const final = (await readNdjson(res)).at(-1)!
      expect((final.summary as { divergenceCount: number }).divergenceCount).toBe(1)
    })

    it('duas cobranças pro mesmo registro local viram possível duplicidade na segunda', async () => {
      await setup(
        { credit_purchases: { id: 'crp-4', amount_paid: 100, currency: 'BRL', status: 'paid', refunded_amount: 0, paid_at: '2026-01-15T00:00:00Z', stripe_payment_intent_id: 'pi_dup' } },
        [
          { id: 'ch_6a', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_dup', currency: 'brl', created: 1700000000 },
          { id: 'ch_6b', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_dup', currency: 'brl', created: 1700000100 },
        ],
      )
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
      const final = (await readNdjson(res)).at(-1)!
      // 1 correspondente (primeira) + 1 divergência (possível duplicidade na segunda)
      expect((final.summary as { matchedCount: number }).matchedCount).toBe(1)
      expect((final.summary as { divergenceCount: number }).divergenceCount).toBe(1)
    })

    it('cobrança pending do Stripe é ignorada (não é sucesso de pagamento)', async () => {
      const { inserted } = await setup({}, [
        { id: 'ch_7', status: 'pending', amount: 10000, amount_refunded: 0, payment_intent: 'pi_pending', currency: 'brl', created: 1700000000 },
      ])
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
      const final = (await readNdjson(res)).at(-1)!
      expect((final.summary as { checkedCount: number }).checkedCount).toBe(0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((inserted.reconciliation_runs[0] as any).status).toBe('concluido')
    })

    it('registro local pago sem cobrança Stripe correspondente vira sem_correspondencia_provedor', async () => {
      await setup(
        { credit_purchases: { id: 'crp-5', amount_paid: 100, currency: 'BRL', status: 'paid', refunded_amount: 0, paid_at: '2026-01-15T12:00:00Z', stripe_payment_intent_id: 'pi_never_charged' } },
        [], // nenhuma cobrança no Stripe
      )
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
      const final = (await readNdjson(res)).at(-1)!
      expect((final.summary as { noProviderMatchCount: number }).noProviderMatchCount).toBe(1)
    })

    it('registro local na borda do período (< 24h) vira não verificável, não uma afirmação de ausência', async () => {
      await setup(
        // período 2026-01-01 a 2026-01-31 → início em UTC é 2026-01-01T03:00:00Z; este paid_at está a poucas horas dali
        { credit_purchases: { id: 'crp-6', amount_paid: 100, currency: 'BRL', status: 'paid', refunded_amount: 0, paid_at: '2026-01-01T10:00:00Z', stripe_payment_intent_id: 'pi_edge' } },
        [],
      )
      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
      const final = (await readNdjson(res)).at(-1)!
      expect((final.summary as { notVerifiableCount: number }).notVerifiableCount).toBe(1)
      expect((final.summary as { noProviderMatchCount: number }).noProviderMatchCount).toBe(0)
    })

    it('falha no meio da gravação dos itens marca o MESMO run como falhou, nunca um 2º run concluido com itens truncados', async () => {
      // Regressão do achado da auditoria: antes, o run era inserido já
      // como 'concluido'/'concluido_parcialmente' com as contagens totais
      // ANTES de gravar os itens — uma falha no meio dos lotes de itens
      // criava um SEGUNDO run 'falhou', deixando o primeiro "concluído"
      // mentindo sobre quantos itens foram realmente persistidos.
      const { createServerSupabaseClient } = await import('@/lib/supabase-server')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { stripe } = await import('@/lib/stripe')
      vi.mocked(createServerSupabaseClient).mockResolvedValue(leaderSupabase())

      const inserted: Record<string, unknown[]> = {}
      const admin = makeAdmin(
        { credit_purchases: { id: 'crp-fail', amount_paid: 100, currency: 'BRL', status: 'paid', refunded_amount: 0, paid_at: '2026-01-15T00:00:00Z', stripe_payment_intent_id: 'pi_fail' } },
        inserted,
      )
      const realFrom = admin.from
      admin.from = vi.fn((table: string) => {
        const chain = realFrom(table)
        if (table === 'reconciliation_items') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(chain as any).insert = vi.fn(() => Promise.resolve({ data: null, error: { message: 'item insert failed (simulated)' } }))
        }
        return chain
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as never)
      vi.mocked(stripe.charges.list).mockResolvedValueOnce(chargesPage([
        { id: 'ch_fail', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_fail', currency: 'brl', created: 1700000000 },
      ]))

      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
      const final = (await readNdjson(res)).at(-1)!

      expect(final.stage).toBe('falhou')
      // Exatamente UM run gravado (criado 'em_processamento', corrigido pra
      // 'falhou' via UPDATE) — nunca uma segunda linha.
      expect(inserted.reconciliation_runs).toHaveLength(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const run = inserted.reconciliation_runs[0] as any
      expect(run.status).toBe('falhou')
      // E o run nunca passou por 'concluido' com contagens prometidas —
      // não existe nenhuma linha "concluido" em lugar nenhum.
      expect(run.status).not.toBe('concluido')
      expect(run.status).not.toBe('concluido_parcialmente')
    })

    it('quando a execução falha (erro do Stripe), grava run com status falhou e envia stage falhou', async () => {
      const { createServerSupabaseClient } = await import('@/lib/supabase-server')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { stripe } = await import('@/lib/stripe')
      vi.mocked(createServerSupabaseClient).mockResolvedValue(leaderSupabase())
      const inserted: Record<string, unknown[]> = {}
      vi.mocked(createAdminClient).mockReturnValue(makeAdmin({}, inserted) as never)
      vi.mocked(stripe.charges.list).mockRejectedValueOnce(new Error('Stripe indisponível'))

      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
      const final = (await readNdjson(res)).at(-1)!
      expect(final.stage).toBe('falhou')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((inserted.reconciliation_runs[0] as any).status).toBe('falhou')
    })
  })
})

describe('teto de cobranças marca execução como parcial', () => {
  beforeEach(() => { vi.resetModules() })

  it('atingir RECONCILIACAO_MAX_CHARGES marca status concluido_parcialmente e vira "não verificável" no reverse-check', async () => {
    vi.stubEnv('RECONCILIACAO_MAX_CHARGES', '1')
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const { stripe } = await import('@/lib/stripe')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(leaderSupabase())
    const inserted: Record<string, unknown[]> = {}
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(
      { credit_purchases: { id: 'crp-7', amount_paid: 100, currency: 'BRL', status: 'paid', refunded_amount: 0, paid_at: '2026-01-15T12:00:00Z', stripe_payment_intent_id: 'pi_z' } },
      inserted,
    ) as never)
    vi.mocked(stripe.charges.list).mockResolvedValueOnce(chargesPage([
      { id: 'ch_a', status: 'succeeded', amount: 100, amount_refunded: 0, payment_intent: 'pi_1', currency: 'brl', created: 1700000000 },
      { id: 'ch_b', status: 'succeeded', amount: 100, amount_refunded: 0, payment_intent: 'pi_2', currency: 'brl', created: 1700000001 },
    ], false))

    const { POST: freshPost } = await import('@/app/api/admin/conciliacao/run/route')
    const res = await freshPost(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31', operationTypes: ['creditos'] }))
    const final = (await readNdjson(res)).at(-1)!
    expect(final.status).toBe('concluido_parcialmente')
    expect((final.summary as { truncated: boolean }).truncated).toBe(true)
    expect((final.summary as { notVerifiableCount: number }).notVerifiableCount).toBe(1)

    vi.unstubAllEnvs()
  })
})
