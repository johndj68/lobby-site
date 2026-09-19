import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

// ── Mock all external dependencies before the module under test loads ─────────

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}))

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  sendEmail:                  vi.fn().mockResolvedValue(undefined),
  buildCreditReceiptEmailHtml: vi.fn().mockReturnValue('<html>receipt</html>'),
}))

vi.mock('@/lib/monitoring', () => ({
  captureException: vi.fn(),
}))

// ── Lazy-import POST after env vars and mocks are in place ────────────────────

let POST: (req: Request) => Promise<Response>

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET  = 'whsec_test'
  process.env.NEXT_PUBLIC_SITE_URL   = 'http://localhost:3000'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  const mod = await import('@/app/api/stripe/webhook/route')
  POST = mod.POST as unknown as (req: Request) => Promise<Response>
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeReq = (body = '{}', sig: string | null = 'test-sig') => {
  const headers: Record<string, string> = {}
  if (sig !== null) headers['stripe-signature'] = sig
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body,
    headers,
  })
}

const makePurchaseRow = () => ({
  user_id:        'user-123',
  credits_amount: 100,
  amount_paid:    99.9,
  package_id:     'pkg-456',
  paid_at:        '2026-07-20T10:00:00Z',
  status:         'paid',
})

// Build a chainable Supabase query mock that resolves `.single()` to the given data.
const makeChain = (data: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {
    update: () => chain,
    select: () => chain,
    eq:     () => chain,
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
  return chain
}

// Build a mock Supabase admin client with per-table default responses.
// `purchaseStatusBeforeRpc` simulates the pre-RPC status read the webhook
// route uses to detect a Stripe redelivery of an already-confirmed purchase
// (null = first delivery / not found, 'pending' = normal first confirmation,
// 'paid' = redelivery of an event already processed).
const makeAdmin = (
  profileEmail: string | null = 'joao@test.com',
  purchaseStatusBeforeRpc: string | null = null,
) => ({
  from: vi.fn((table: string) => {
    if (table === 'profiles')
      return makeChain(profileEmail ? { full_name: 'João', email: profileEmail } : null)
    if (table === 'client_credit_wallets')
      return makeChain({ balance: 200 })
    if (table === 'credit_packages')
      return makeChain({ name: 'Pacote Starter' })
    if (table === 'credit_purchases')
      return makeChain(purchaseStatusBeforeRpc ? { status: purchaseStatusBeforeRpc } : null)
    return makeChain(null)
  }),
  rpc: vi.fn().mockResolvedValue({ data: makePurchaseRow(), error: null }),
})

// Allow fire-and-forget promises to settle before asserting.
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0))

// Shared event factory for checkout.session.completed
const makeCheckoutEvent = (purchaseId: string | null) => ({
  type: 'checkout.session.completed',
  id:   'evt_test',
  data: {
    object: {
      id:             'cs_test',
      metadata:       purchaseId ? { purchase_id: purchaseId } : {},
      payment_intent: 'pi_test',
    },
  },
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/stripe/webhook', () => {

  it('retorna 400 quando header stripe-signature está ausente', async () => {
    const res  = await POST(makeReq('{}', null))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toContain('stripe-signature')
  })

  it('retorna 400 quando assinatura é inválida', async () => {
    const { stripe } = await import('@/lib/stripe')
    vi.mocked(stripe.webhooks.constructEvent).mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature for payload')
    })
    const res  = await POST(makeReq())
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toContain('Webhook Error')
  })

  it('retorna 200 para tipo de evento não tratado', async () => {
    const { stripe } = await import('@/lib/stripe')
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce({
      type: 'customer.subscription.deleted',
      id:   'evt_test',
      data: { object: {} },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const res  = await POST(makeReq())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.received).toBe(true)
  })

  // ── checkout.session.completed ───────────────────────────────────────────────

  describe('checkout.session.completed', () => {

    it('retorna 200 e não chama RPC quando purchase_id ausente nos metadados', async () => {
      const { stripe }      = await import('@/lib/stripe')
      const { sendEmail }   = await import('@/lib/notifications')
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeCheckoutEvent(null) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      const res  = await POST(makeReq())
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.received).toBe(true)
      await flush()
      expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
    })

    it('retorna 200 e envia e-mail de recibo após confirmação bem-sucedida', async () => {
      const { stripe }          = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { sendEmail }       = await import('@/lib/notifications')
      vi.mocked(createAdminClient).mockReturnValue(makeAdmin() as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeCheckoutEvent('pur_123') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      const res  = await POST(makeReq())
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.received).toBe(true)
      await flush()
      expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce()
    })

    it('envia e-mail para o endereço correto do cliente', async () => {
      const { stripe }          = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { sendEmail }       = await import('@/lib/notifications')
      vi.mocked(createAdminClient).mockReturnValue(makeAdmin('teste@cliente.com') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeCheckoutEvent('pur_123') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      await POST(makeReq())
      await flush()
      expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe('teste@cliente.com')
    })

    it('subject do e-mail menciona créditos adicionados', async () => {
      const { stripe }          = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { sendEmail }       = await import('@/lib/notifications')
      vi.mocked(createAdminClient).mockReturnValue(makeAdmin() as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeCheckoutEvent('pur_123') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      await POST(makeReq())
      await flush()
      const subject = vi.mocked(sendEmail).mock.calls[0][1] as string
      expect(subject).toContain('créditos')
    })

    it('não chama sendEmail quando profile não tem e-mail', async () => {
      const { stripe }          = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { sendEmail }       = await import('@/lib/notifications')
      vi.mocked(createAdminClient).mockReturnValue(makeAdmin(null) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeCheckoutEvent('pur_123') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      await POST(makeReq())
      await flush()
      expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
    })

    it('retorna 200 com handlerError quando RPC falha', async () => {
      const { stripe }          = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeAdmin()
      admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc error' } })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeCheckoutEvent('pur_123') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      const res  = await POST(makeReq())
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.handlerError).toBe(true)
    })

    it('não reenvia e-mail de recibo em redelivery de evento já confirmado (status já "paid" antes da RPC)', async () => {
      const { stripe }          = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { sendEmail }       = await import('@/lib/notifications')
      // purchaseStatusBeforeRpc: 'paid' — Stripe reentregando um evento cuja
      // compra já foi confirmada por uma entrega anterior deste webhook.
      vi.mocked(createAdminClient).mockReturnValue(makeAdmin('teste@cliente.com', 'paid') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeCheckoutEvent('pur_123') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      const res = await POST(makeReq())
      const body = await res.json()
      // Ainda responde 200 "received" normalmente — não é um erro, só não repete o efeito colateral
      expect(res.status).toBe(200)
      expect(body.received).toBe(true)
      await flush()
      expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
    })

    it('não chama sendEmail quando RPC falha', async () => {
      const { stripe }          = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { sendEmail }       = await import('@/lib/notifications')
      const admin = makeAdmin()
      admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc error' } })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeCheckoutEvent('pur_123') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      await POST(makeReq())
      await flush()
      expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
    })

  })
})
