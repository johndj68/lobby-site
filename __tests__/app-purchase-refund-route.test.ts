import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))
vi.mock('@/lib/stripe', () => ({
  stripe: { refunds: { create: vi.fn() } },
}))

afterEach(() => {
  vi.clearAllMocks()
})

type Row = Record<string, unknown>

function makeSupabase({ profile = { role: 'technician', is_leader: true }, rpcResult }: {
  profile?: Row | null
  rpcResult?: { data?: unknown; error?: { message: string } | null }
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'leader-1' } } }) },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: profile, error: null }) }) }),
    })),
    rpc: vi.fn().mockResolvedValue(rpcResult ?? { data: { id: 'app-purchase-1', refund_status: 'processing' }, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

function makeAdmin(purchase: Row | null) {
  return {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: purchase, error: null }) }) }),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const makeReq = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })

const basePurchase = (overrides: Row = {}): Row => ({
  id: 'app-purchase-1', status: 'paid', amount: 100, refunded_amount: 0,
  refund_status: null, paid_at: new Date().toISOString(),
  stripe_payment_intent_id: 'pi_test', ...overrides,
})

describe('POST /api/admin/app-purchases/[purchaseId]/refund', () => {
  it('400 sem motivo', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase())
    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50 }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })
    expect(res.status).toBe(400)
  })

  it('403 quando não é líder', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase({ profile: { role: 'technician', is_leader: false } }))
    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'motivo' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })
    expect(res.status).toBe(403)
  })

  it('400 quando fora da janela de 15 dias', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase())
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(basePurchase({ paid_at: new Date(Date.now() - 16 * 86400_000).toISOString() })))
    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'motivo' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/prazo/)
  })

  it('chama stripe.refunds.create e depois a RPC refund_app_purchase', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const { stripe } = await import('@/lib/stripe')
    const supabase = makeSupabase()
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase)
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(basePurchase()))
    vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_test' } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'Cliente desistiu' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })

    expect(res.status).toBe(200)
    expect(vi.mocked(stripe.refunds.create)).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_test', amount: 5000 }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    )
    expect(supabase.rpc).toHaveBeenCalledWith('refund_app_purchase', { p_purchase_id: 'app-purchase-1', p_amount: 50, p_reason: 'Cliente desistiu' })
  })

  it('não chama a RPC se o Stripe recusar o reembolso', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const { stripe } = await import('@/lib/stripe')
    const supabase = makeSupabase()
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase)
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(basePurchase()))
    vi.mocked(stripe.refunds.create).mockRejectedValue(new Error('card_declined'))

    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'motivo' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })

    expect(res.status).toBe(502)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('400 quando valor excede saldo reembolsável', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase())
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(basePurchase({ refunded_amount: 80 })))
    const { POST } = await import('@/app/api/admin/app-purchases/[purchaseId]/refund/route')
    const res = await POST(makeReq({ amount: 50, reason: 'motivo' }), { params: Promise.resolve({ purchaseId: 'app-purchase-1' }) })
    expect(res.status).toBe(400)
  })
})
