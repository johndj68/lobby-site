import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

// ── Mock all external dependencies before the module under test loads ─────────

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
    invoicePayments: {
      list: vi.fn(),
    },
  },
}))

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  sendEmail:                        vi.fn().mockResolvedValue(undefined),
  buildCreditReceiptEmailHtml:       vi.fn().mockReturnValue('<html>receipt</html>'),
  buildAppPurchaseReceiptEmailHtml:  vi.fn().mockReturnValue('<html>app receipt</html>'),
  buildSubscriptionPaymentFailedEmailHtml: vi.fn().mockReturnValue('<html>payment failed</html>'),
  buildDisputeCreatedEmailHtml:      vi.fn().mockReturnValue('<html>dispute</html>'),
}))

vi.mock('@/lib/monitoring', () => ({
  captureException: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase-admin'

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

// Baseline admin client — tests that care about specific table responses
// still override via mockReturnValue.
beforeEach(() => {
  vi.mocked(createAdminClient).mockReturnValue(makeAdmin() as any) // eslint-disable-line @typescript-eslint/no-explicit-any
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

    it('retorna 500 (deixa o Stripe reentregar) quando RPC falha', async () => {
      const { stripe }          = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeAdmin()
      admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc error' } })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeCheckoutEvent('pur_123') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      const res  = await POST(makeReq())
      const body = await res.json()
      expect(res.status).toBe(500)
      expect(body.error).toBeTruthy()
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

  // ── Assinatura (Stripe Billing) ───────────────────────────────────────────
  //
  // Mocks o formato REAL desta versão do SDK Stripe instalado (confirmado
  // lendo node_modules/stripe/cjs/resources/{Subscriptions,SubscriptionItems,
  // Invoices}.d.ts direto, não por memória): current_period_start/end vivem
  // em items.data[0], não no topo da Subscription; invoice.subscription não
  // existe mais, é invoice.parent.subscription_details.subscription.

  describe('assinatura (Stripe Billing)', () => {

    const makeSubscriptionObject = (overrides: Record<string, unknown> = {}) => ({
      id: 'sub_test_123',
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      items: {
        data: [{
          current_period_start: 1700000000,
          current_period_end:   1702592000,
          price: {
            unit_amount: 9900,
            currency:    'brl',
            recurring:   { interval: 'month' },
          },
        }],
      },
      ...overrides,
    })

    const makeSubscriptionCheckoutEvent = () => ({
      type: 'checkout.session.completed',
      id:   'evt_sub_test',
      data: {
        object: {
          id:           'cs_sub_test',
          subscription: 'sub_test_123',
          metadata: {
            kind:               'subscription',
            product_type:       'app_plan',
            user_id:            'user-abc',
            app_plan_id:        'plan-abc',
            client_project_id:  '',
            partner_id:         'partner-abc',
            commission_percent: '25',
            plan_name:          'App Teste — Plano Mensal',
          },
        },
      },
    })

    // Mock flexível de admin client — cobre subscriptions/subscription_invoices/
    // financial_transactions/profiles com respostas configuráveis por tabela.
    const makeSubAdmin = (opts: {
      existingSubscription?: unknown
      existingInvoice?: unknown
      subscriptionRow?: unknown
      profile?: unknown
    } = {}) => {
      const inserted: Record<string, unknown[]> = {}
      const updated:  Record<string, unknown[]> = {}

      return {
        inserted,
        updated,
        from: vi.fn((table: string) => {
          const chain: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
          chain.select = () => chain
          chain.eq     = () => chain
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: table === 'subscriptions'
              ? (opts.existingSubscription !== undefined ? opts.existingSubscription : (opts.subscriptionRow ?? null))
              : table === 'subscription_invoices'
                ? (opts.existingInvoice ?? null)
                : null,
            error: null,
          })
          chain.single = vi.fn().mockResolvedValue({ data: { id: `${table}-new-id` }, error: null })
          chain.insert = (payload: unknown) => {
            inserted[table] = inserted[table] ?? []
            inserted[table].push(payload)
            return chain
          }
          chain.update = (payload: unknown) => {
            updated[table] = updated[table] ?? []
            updated[table].push(payload)
            return chain
          }
          if (table === 'profiles') {
            chain.single = vi.fn().mockResolvedValue({ data: opts.profile ?? { full_name: 'Cliente Teste', email: 'cliente@teste.com' }, error: null })
          }
          return chain
        }),
      }
    }

    it('checkout.session.completed (kind=subscription) cria a linha em subscriptions com os campos certos', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeSubAdmin({ existingSubscription: null })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValueOnce(makeSubscriptionObject() as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeSubscriptionCheckoutEvent() as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      const row = admin.inserted['subscriptions']?.[0] as Record<string, unknown>
      expect(row).toBeDefined()
      expect(row.stripe_subscription_id).toBe('sub_test_123')
      expect(row.amount).toBe(99) // 9900 centavos / 100
      expect(row.currency).toBe('BRL')
      expect(row.billing_interval).toBe('month')
      expect(row.commission_percent).toBe(25)
      expect(row.partner_id).toBe('partner-abc')
      // current_period_start vem do item, não do topo do objeto — é exatamente
      // o bug que a checagem do .d.ts do SDK evitou.
      expect(row.current_period_start).toBe(new Date(1700000000 * 1000).toISOString())
      expect(row.current_period_end).toBe(new Date(1702592000 * 1000).toISOString())
    })

    it('redelivery de checkout.session.completed de assinatura já criada não duplica', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeSubAdmin({ existingSubscription: { id: 'existing-sub-row' } })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeSubscriptionCheckoutEvent() as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      expect(admin.inserted['subscriptions']).toBeUndefined()
      expect(vi.mocked(stripe.subscriptions.retrieve)).not.toHaveBeenCalled()
    })

    it('invoice.paid grava subscription_invoices + financial_transactions só com o valor da comissão', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeSubAdmin({
        existingInvoice: null,
        subscriptionRow: {
          id: 'subscription-row-id', commission_percent: 25, partner_id: 'partner-abc',
          product_type: 'app_plan', plan_name: 'App Teste — Plano Mensal', user_id: 'user-abc', status: 'incomplete',
        },
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const invoiceEvent = {
        type: 'invoice.paid',
        id:   'evt_invoice_test',
        data: {
          object: {
            id:          'in_test_123',
            amount_paid: 9900,
            currency:    'brl',
            parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_test_123' } },
          },
        },
      }
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(invoiceEvent as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      const invoiceRow = admin.inserted['subscription_invoices']?.[0] as Record<string, unknown>
      expect(invoiceRow.amount).toBe(99)
      expect(invoiceRow.commission_amount).toBe(24.75) // 25% de 99
      expect(invoiceRow.partner_amount).toBe(74.25)

      const txRow = admin.inserted['financial_transactions']?.[0] as Record<string, unknown>
      expect(txRow.amount).toBe(24.75) // só a comissão, nunca o valor bruto (seção 17)
      expect(txRow.type).toBe('app')
      expect(txRow.source_type).toBe('subscription_invoices')

      // Primeiro pagamento confirma a assinatura como ativa
      expect(admin.updated['subscriptions']?.[0]).toMatchObject({ status: 'active' })
    })

    it('redelivery de invoice.paid (mesma fatura) não duplica lançamento', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeSubAdmin({ existingInvoice: { id: 'already-recorded' } })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const invoiceEvent = {
        type: 'invoice.paid',
        id:   'evt_invoice_redelivery',
        data: { object: { id: 'in_test_123', amount_paid: 9900, currency: 'brl', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_test_123' } } } },
      }
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(invoiceEvent as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      expect(admin.inserted['subscription_invoices']).toBeUndefined()
      expect(admin.inserted['financial_transactions']).toBeUndefined()
    })

    it('invoice.payment_failed envia e-mail de aviso ao cliente', async () => {
      const { stripe }          = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const { sendEmail }       = await import('@/lib/notifications')
      const admin = makeSubAdmin({
        subscriptionRow: { id: 'subscription-row-id', user_id: 'user-abc', plan_name: 'App Teste — Plano Mensal' },
        profile: { full_name: 'Cliente Teste', email: 'cliente@teste.com' },
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const failedEvent = {
        type: 'invoice.payment_failed',
        id:   'evt_failed_test',
        data: { object: { id: 'in_failed_123', amount_due: 9900, currency: 'brl', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_test_123' } } } },
      }
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(failedEvent as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      await flush()
      expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce()
      expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe('cliente@teste.com')
    })

    it('customer.subscription.updated sincroniza status/período/cancel_at_period_end', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeSubAdmin()
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const updatedEvent = {
        type: 'customer.subscription.updated',
        id:   'evt_sub_updated',
        data: { object: makeSubscriptionObject({ status: 'past_due', cancel_at_period_end: true }) },
      }
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(updatedEvent as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      const row = admin.updated['subscriptions']?.[0] as Record<string, unknown>
      expect(row.status).toBe('past_due')
      expect(row.cancel_at_period_end).toBe(true)
    })

    it('customer.subscription.deleted marca a assinatura como cancelada', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeSubAdmin()
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const deletedEvent = {
        type: 'customer.subscription.deleted',
        id:   'evt_sub_deleted',
        data: { object: makeSubscriptionObject({ status: 'canceled' }) },
      }
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(deletedEvent as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      const row = admin.updated['subscriptions']?.[0] as Record<string, unknown>
      expect(row.status).toBe('canceled')
    })

  })

  // ── checkout.session.completed (kind=app_purchase) — gap 4: entrega de código ──

  describe('compra de app com entrega de código de ativação (gap 4)', () => {

    const makeAppPurchaseCheckoutEvent = () => ({
      type: 'checkout.session.completed',
      id:   'evt_app_purchase_test',
      data: {
        object: {
          id:             'cs_app_test',
          payment_intent: 'pi_app_test',
          metadata: {
            kind:        'app_purchase',
            purchase_id: 'app-purchase-1',
          },
        },
      },
    })

    const makePurchaseRow = () => ({
      id: 'app-purchase-1', buyer_user_id: 'buyer-1', plan_id: 'plan-1',
      application_name: 'App Teste', plan_name: 'Plano Único',
      amount: 100, commission_amount: 20, currency: 'BRL',
    })

    // Mock flexível — cobre app_purchases (status pré-RPC + update),
    // financial_transactions e a RPC deliver_activation_code com resposta
    // configurável (código entregue ou SEM_CODIGO_DISPONIVEL).
    const makeAppPurchaseAdmin = (opts: {
      purchaseStatusBeforeRpc?: string | null
      deliverResult?: { data?: unknown; error?: { message: string } }
    } = {}) => {
      const inserted: Record<string, unknown[]> = {}
      const updated:  Record<string, unknown[]> = {}

      return {
        inserted,
        updated,
        rpc: vi.fn((fn: string) => {
          if (fn === 'deliver_activation_code') {
            return Promise.resolve(opts.deliverResult ?? { data: { code: 'ABCD-1234' }, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        from: vi.fn((table: string) => {
          const chain: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
          chain.select = () => chain
          chain.eq     = () => chain
          chain.insert = (payload: unknown) => { inserted[table] = inserted[table] ?? []; inserted[table].push(payload); return chain }
          chain.update = (payload: unknown) => { updated[table]  = updated[table]  ?? []; updated[table].push(payload);  return chain }
          chain.single = vi.fn().mockResolvedValue({
            data: table === 'app_purchases'
              ? (opts.purchaseStatusBeforeRpc !== undefined
                  ? (opts.purchaseStatusBeforeRpc === null ? null : { status: opts.purchaseStatusBeforeRpc })
                  : null)
              : null,
            error: null,
          })
          return chain
        }),
      }
    }

    it('confirma a compra e entrega o código atomicamente', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeAppPurchaseAdmin()
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeAppPurchaseCheckoutEvent() as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      // Simula o .select().single() final do update de app_purchases
      // devolvendo a linha da compra pra sendAppPurchaseReceiptEmail.
      admin.from = vi.fn((table: string) => {
        const chain: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
        chain.select = () => chain
        chain.eq     = () => chain
        chain.maybeSingle = () => chain.single()
        chain.insert = (payload: unknown) => { admin.inserted[table] = admin.inserted[table] ?? []; admin.inserted[table].push(payload); return chain }
        chain.update = (payload: unknown) => { admin.updated[table]  = admin.updated[table]  ?? []; admin.updated[table].push(payload);  chain.single = vi.fn().mockResolvedValue({ data: table === 'app_purchases' ? makePurchaseRow() : null, error: null }); return chain }
        chain.single = vi.fn().mockResolvedValue({
          data: table === 'profiles' ? { full_name: 'Cliente Teste', email: 'cliente@teste.com' }
              : table === 'app_plans' ? { app_draft_id: 'draft-1' }
              : null,
          error: null,
        })
        return chain
      })

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      expect(admin.rpc).toHaveBeenCalledWith('deliver_activation_code', { p_app_purchase_id: 'app-purchase-1' })

      const { buildAppPurchaseReceiptEmailHtml } = await import('@/lib/notifications')
      await flush()
      expect(vi.mocked(buildAppPurchaseReceiptEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({ activationCode: 'ABCD-1234' })
      )
    })

    it('estoque zerado (SEM_CODIGO_DISPONIVEL) não derruba a confirmação de pagamento', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeAppPurchaseAdmin({ deliverResult: { data: null, error: { message: 'SEM_CODIGO_DISPONIVEL' } } })
      admin.from = vi.fn((table: string) => {
        const chain: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
        chain.select = () => chain
        chain.eq     = () => chain
        chain.maybeSingle = () => chain.single()
        chain.insert = (payload: unknown) => { admin.inserted[table] = admin.inserted[table] ?? []; admin.inserted[table].push(payload); return chain }
        chain.update = (payload: unknown) => { admin.updated[table]  = admin.updated[table]  ?? []; admin.updated[table].push(payload);  chain.single = vi.fn().mockResolvedValue({ data: table === 'app_purchases' ? makePurchaseRow() : null, error: null }); return chain }
        chain.single = vi.fn().mockResolvedValue({
          data: table === 'profiles' ? { full_name: 'Cliente Teste', email: 'cliente@teste.com' }
              : table === 'app_plans' ? { app_draft_id: 'draft-1' }
              : null,
          error: null,
        })
        return chain
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeAppPurchaseCheckoutEvent() as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      const { buildAppPurchaseReceiptEmailHtml } = await import('@/lib/notifications')
      await flush()
      expect(vi.mocked(buildAppPurchaseReceiptEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({ activationCode: null })
      )
    })

    it('redelivery de compra já confirmada não chama deliver_activation_code de novo', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeAppPurchaseAdmin({ purchaseStatusBeforeRpc: 'paid' })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeAppPurchaseCheckoutEvent() as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      expect(admin.rpc).not.toHaveBeenCalled()
    })

  })

  // ── charge.dispute.created / charge.dispute.closed (contestação Stripe) ────

  describe('disputa Stripe (congelamento automático)', () => {

    const makeDisputeEvent = (type: 'charge.dispute.created' | 'charge.dispute.closed', overrides: Record<string, unknown> = {}) => ({
      type,
      id:   'evt_dispute_test',
      data: {
        object: {
          id:             'dp_test_123',
          object:         'dispute',
          amount:         10000,
          currency:       'brl',
          charge:         'ch_test_123',
          payment_intent: 'pi_test_123',
          reason:         'fraudulent',
          status:         type === 'charge.dispute.created' ? 'needs_response' : 'won',
          created:        1700000000,
          ...overrides,
        },
      },
    })

    // Mock flexível — cada tabela responde de acordo com qual purchase
    // (se algum) deve "bater" no lookup em cascata do handler.
    const makeDisputeAdmin = (opts: {
      matchTable?: 'campaign_purchases' | 'credit_purchases' | 'app_purchases' | 'subscription_invoices' | null
      matchId?: string
      existingDispute?: unknown
      freezeResult?: { data?: unknown; error?: unknown }
      disputeRecord?: unknown
    } = {}) => {
      const inserted: Record<string, unknown[]> = {}
      const updated:  Record<string, { table: string; payload: unknown; }[]> = {}

      return {
        inserted,
        updated,
        rpc: vi.fn((fn: string) => {
          if (fn === 'freeze_credit_purchase_for_dispute') return Promise.resolve(opts.freezeResult ?? { data: 50, error: null })
          if (fn === 'unfreeze_credit_purchase_for_dispute') return Promise.resolve({ data: null, error: null })
          return Promise.resolve({ data: null, error: null })
        }),
        from: vi.fn((table: string) => {
          const chain: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
          chain.select = () => chain
          chain.eq     = () => chain
          chain.is     = () => chain
          chain.insert = (payload: unknown) => { inserted[table] = inserted[table] ?? []; inserted[table].push(payload); return chain }
          chain.update = (payload: unknown) => {
            updated[table] = updated[table] ?? []
            updated[table].push({ table, payload })
            return chain
          }
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: table === 'payment_disputes'
              ? (opts.disputeRecord ?? opts.existingDispute ?? null)
              : table === opts.matchTable
                ? { id: opts.matchId ?? 'matched-id', campaign_id: 'campaign-1', subscription_id: 'sub-row-1' }
                : null,
            error: null,
          })
          chain.single = vi.fn().mockResolvedValue({
            data: table === 'payment_disputes'
              ? (opts.disputeRecord ?? null)
              : table === 'campaign_purchases'
                ? { campaign_id: 'campaign-1' }
                : table === 'subscription_invoices'
                  ? { subscription_id: 'sub-row-1' }
                  : null,
            error: null,
          })
          return chain
        }),
      }
    }

    it('dispute.created de compra de créditos congela o saldo via RPC', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({ matchTable: 'credit_purchases', matchId: 'credit-purchase-1' })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.created') as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      expect(admin.rpc).toHaveBeenCalledWith('freeze_credit_purchase_for_dispute', { p_purchase_id: 'credit-purchase-1' })
      const disputeRow = admin.inserted['payment_disputes']?.[0] as Record<string, unknown>
      expect(disputeRow.source_type).toBe('credit_purchases')
      expect(disputeRow.source_id).toBe('credit-purchase-1')
      expect(disputeRow.held_amount).toBe(50)
      expect(disputeRow.amount).toBe(100) // 10000 centavos / 100
    })

    it('dispute.created de compra de app marca status disputed', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({ matchTable: 'app_purchases', matchId: 'app-purchase-1' })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.created') as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      const updates = admin.updated['app_purchases'] ?? []
      expect(updates.some(u => (u.payload as Record<string, unknown>).status === 'disputed')).toBe(true)
      const disputeRow = admin.inserted['payment_disputes']?.[0] as Record<string, unknown>
      expect(disputeRow.source_type).toBe('app_purchases')
    })

    it('dispute.created de campanha marca disputed e pausa a campanha', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({ matchTable: 'campaign_purchases', matchId: 'campaign-purchase-1' })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.created') as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      expect((admin.updated['campaign_purchases'] ?? []).some(u => (u.payload as Record<string, unknown>).status === 'disputed')).toBe(true)
      const pauseUpdate = (admin.updated['sponsored_campaigns'] ?? [])[0]?.payload as Record<string, unknown>
      expect(pauseUpdate.paused_reason).toContain('Disputa Stripe')
    })

    it('dispute.created de fatura de assinatura busca invoice via invoicePayments.list e marca a assinatura disputed', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({ matchTable: 'subscription_invoices', matchId: 'sub-invoice-1' })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.invoicePayments.list).mockResolvedValueOnce({ data: [{ invoice: 'in_test_123' }] } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.created') as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      expect(vi.mocked(stripe.invoicePayments.list)).toHaveBeenCalledWith(
        expect.objectContaining({ payment: { type: 'payment_intent', payment_intent: 'pi_test_123' } })
      )
      expect((admin.updated['subscriptions'] ?? []).some(u => (u.payload as Record<string, unknown>).disputed === true)).toBe(true)
      const disputeRow = admin.inserted['payment_disputes']?.[0] as Record<string, unknown>
      expect(disputeRow.source_type).toBe('subscription_invoices')
    })

    it('dispute.created sem nenhuma correspondência ainda registra a disputa (visibilidade)', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({ matchTable: null })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.invoicePayments.list).mockResolvedValueOnce({ data: [] } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.created') as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)

      const disputeRow = admin.inserted['payment_disputes']?.[0] as Record<string, unknown>
      expect(disputeRow.source_type).toBeNull()
    })

    it('redelivery de dispute.created já registrada não duplica nem congela de novo', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({ existingDispute: { id: 'existing-dispute-row' } })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.created') as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      expect(admin.inserted['payment_disputes']).toBeUndefined()
      expect(admin.rpc).not.toHaveBeenCalled()
    })

    it('dispute.closed com status won desfaz o congelamento de crédito', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({
        disputeRecord: { id: 'dispute-row-1', source_type: 'credit_purchases', source_id: 'credit-purchase-1', held_amount: 50, closed_at: null },
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.closed') as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      expect(admin.rpc).toHaveBeenCalledWith('unfreeze_credit_purchase_for_dispute', { p_purchase_id: 'credit-purchase-1', p_held_amount: 50 })
    })

    it('dispute.closed com status lost mantém o congelamento (nenhuma RPC de unfreeze)', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({
        disputeRecord: { id: 'dispute-row-1', source_type: 'credit_purchases', source_id: 'credit-purchase-1', held_amount: 50, closed_at: null },
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.closed', { status: 'lost' }) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      expect(admin.rpc).not.toHaveBeenCalledWith('unfreeze_credit_purchase_for_dispute', expect.anything())
    })

    it('redelivery de dispute.closed já processada não roda de novo', async () => {
      const { stripe }            = await import('@/lib/stripe')
      const { createAdminClient } = await import('@/lib/supabase-admin')
      const admin = makeDisputeAdmin({
        disputeRecord: { id: 'dispute-row-1', source_type: 'credit_purchases', source_id: 'credit-purchase-1', held_amount: 50, closed_at: '2026-09-01T00:00:00Z' },
      })
      vi.mocked(createAdminClient).mockReturnValue(admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(makeDisputeEvent('charge.dispute.closed') as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      const res = await POST(makeReq())
      expect(res.status).toBe(200)
      expect(admin.rpc).not.toHaveBeenCalled()
    })

  })
})
