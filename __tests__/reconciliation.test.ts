import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.mock('@/lib/stripe', () => ({
  stripe: {
    charges: { list: vi.fn() },
    invoicePayments: { list: vi.fn() },
  },
}))

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

let POST: (req: Request) => Promise<Response>
let findPurchaseByPaymentIntentId: typeof import('@/lib/services/reconciliation').findPurchaseByPaymentIntentId

beforeAll(async () => {
  const mod = await import('@/app/api/admin/conciliacao/run/route')
  POST = mod.POST as unknown as (req: Request) => Promise<Response>
  findPurchaseByPaymentIntentId = (await import('@/lib/services/reconciliation')).findPurchaseByPaymentIntentId
})

afterEach(() => {
  vi.clearAllMocks()
})

const makeReq = (body: unknown) =>
  new Request('http://localhost/api/admin/conciliacao/run', { method: 'POST', body: JSON.stringify(body) })

// Cliente Supabase mockado — cada tabela responde conforme configurado;
// tabelas não configuradas devolvem null (sem correspondência).
const makeQueryAdmin = (responses: Record<string, unknown>) => ({
  from: vi.fn((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: responses[table] ?? null, error: null }),
        single:      vi.fn().mockResolvedValue({ data: responses[table] ?? null, error: null }),
      }),
      single: vi.fn().mockResolvedValue({ data: { role: 'technician', is_leader: true }, error: null }),
    }),
  })),
})

describe('findPurchaseByPaymentIntentId', () => {
  it('acha em campaign_purchases primeiro', async () => {
    const admin = makeQueryAdmin({ campaign_purchases: { id: 'cp-1', amount: 100, status: 'paid', refund_status: null } })
    const result = await findPurchaseByPaymentIntentId(admin as any, 'pi_x') // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toEqual({ table: 'campaign_purchases', id: 'cp-1', amount: 100, status: 'paid', refundedAmount: 0 })
  })

  it('campanha reembolsada totalmente reflete refundedAmount = amount', async () => {
    const admin = makeQueryAdmin({ campaign_purchases: { id: 'cp-1', amount: 100, status: 'refunded', refund_status: 'refunded' } })
    const result = await findPurchaseByPaymentIntentId(admin as any, 'pi_x') // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result?.refundedAmount).toBe(100)
  })

  it('cai pra credit_purchases quando não acha em campaign_purchases', async () => {
    const admin = makeQueryAdmin({ credit_purchases: { id: 'crp-1', amount_paid: 60, status: 'paid', refunded_amount: 10 } })
    const result = await findPurchaseByPaymentIntentId(admin as any, 'pi_x') // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toEqual({ table: 'credit_purchases', id: 'crp-1', amount: 60, status: 'paid', refundedAmount: 10 })
  })

  it('cai pra app_purchases quando não acha nas 2 primeiras', async () => {
    const admin = makeQueryAdmin({ app_purchases: { id: 'ap-1', amount: 200, status: 'paid' } })
    const result = await findPurchaseByPaymentIntentId(admin as any, 'pi_x') // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toEqual({ table: 'app_purchases', id: 'ap-1', amount: 200, status: 'paid', refundedAmount: 0 })
  })

  it('cai pra subscription_invoices via invoicePayments.list quando nenhuma das 3 tabelas com payment_intent direto bate', async () => {
    const { stripe } = await import('@/lib/stripe')
    vi.mocked(stripe.invoicePayments.list).mockResolvedValueOnce({ data: [{ invoice: 'in_test_1' }] } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const admin = makeQueryAdmin({ subscription_invoices: { id: 'si-1', amount: 99 } })
    const result = await findPurchaseByPaymentIntentId(admin as any, 'pi_x') // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toEqual({ table: 'subscription_invoices', id: 'si-1', amount: 99, status: 'paid', refundedAmount: 0 })
  })

  it('devolve null quando nada bate em lugar nenhum', async () => {
    const { stripe } = await import('@/lib/stripe')
    vi.mocked(stripe.invoicePayments.list).mockResolvedValueOnce({ data: [] } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const admin = makeQueryAdmin({})
    const result = await findPurchaseByPaymentIntentId(admin as any, 'pi_x') // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toBeNull()
  })
})

describe('POST /api/admin/conciliacao/run', () => {
  it('retorna 403 quando não é líder', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { role: 'technician', is_leader: false } }) }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31' }))
    expect(res.status).toBe(403)
  })

  it('classifica cobrança sem correspondência local', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const { stripe } = await import('@/lib/stripe')

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { role: 'technician', is_leader: true } }) }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(createAdminClient).mockReturnValue(makeQueryAdmin({}) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(stripe.invoicePayments.list).mockResolvedValue({ data: [] } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(stripe.charges.list).mockResolvedValueOnce({
      data: [{ id: 'ch_1', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_orphan', created: 1700000000 }],
      has_more: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res  = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.divergences).toHaveLength(1)
    expect(body.divergences[0].type).toBe('sem_correspondencia')
  })

  it('classifica valor divergente quando cobrança bate mas valor local difere', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const { stripe } = await import('@/lib/stripe')

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { role: 'technician', is_leader: true } }) }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(createAdminClient).mockReturnValue(makeQueryAdmin({ credit_purchases: { id: 'crp-1', amount_paid: 50, status: 'paid', refunded_amount: 0 } }) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(stripe.charges.list).mockResolvedValueOnce({
      data: [{ id: 'ch_2', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_mismatch', created: 1700000000 }],
      has_more: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res  = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.divergences).toHaveLength(1)
    expect(body.divergences[0].type).toBe('valor_divergente')
    expect(body.divergences[0].stripeAmount).toBe(100)
    expect(body.divergences[0].localAmount).toBe(50)
  })

  it('cobrança pending do Stripe é ignorada (não é sucesso de pagamento)', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const { stripe } = await import('@/lib/stripe')

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { role: 'technician', is_leader: true } }) }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(createAdminClient).mockReturnValue(makeQueryAdmin({}) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(stripe.charges.list).mockResolvedValueOnce({
      data: [{ id: 'ch_3', status: 'pending', amount: 10000, amount_refunded: 0, payment_intent: 'pi_pending', created: 1700000000 }],
      has_more: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res  = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.checkedCount).toBe(0)
    expect(body.divergences).toHaveLength(0)
  })

  it('tudo conciliado quando valor/status/reembolso batem exatamente', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const { stripe } = await import('@/lib/stripe')

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { role: 'technician', is_leader: true } }) }) }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(createAdminClient).mockReturnValue(makeQueryAdmin({ app_purchases: { id: 'ap-1', amount: 100, status: 'paid' } }) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(stripe.charges.list).mockResolvedValueOnce({
      data: [{ id: 'ch_4', status: 'succeeded', amount: 10000, amount_refunded: 0, payment_intent: 'pi_ok', created: 1700000000 }],
      has_more: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res  = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-31' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.divergences).toHaveLength(0)
  })
})
