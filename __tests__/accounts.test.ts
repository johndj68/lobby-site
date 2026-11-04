import { describe, it, expect, vi, afterEach } from 'vitest'
import { isAccountOverdue, todaySaoPauloDateStr, exportAccountsCSV } from '@/lib/finance'
import { mapSettlementRow, mapAuditEventRow } from '@/lib/services/accounts'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

// ── Helpers de fuso/atraso ──────────────────────────────────────────────

describe('todaySaoPauloDateStr / isAccountOverdue', () => {
  it('não classifica vencimento-hoje como atrasado', () => {
    const today = todaySaoPauloDateStr()
    expect(isAccountOverdue(today, 'pendente')).toBe(false)
  })

  it('classifica data passada como atrasada só se status em aberto', () => {
    expect(isAccountOverdue('2000-01-01', 'pendente')).toBe(true)
    expect(isAccountOverdue('2000-01-01', 'parcial')).toBe(true)
    expect(isAccountOverdue('2000-01-01', 'pago')).toBe(false)
    expect(isAccountOverdue('2000-01-01', 'cancelado')).toBe(false)
  })

  it('sem vencimento nunca é atrasada', () => {
    expect(isAccountOverdue(null, 'pendente')).toBe(false)
  })
})

// ── Mappers ──────────────────────────────────────────────────────────────

describe('mapSettlementRow / mapAuditEventRow', () => {
  it('converte snake_case do banco pro tipo camelCase do domínio', () => {
    const settlement = mapSettlementRow({
      id: 's1', account_kind: 'payable', account_id: 'a1', amount: '150.00', effective_date: '2026-01-10',
      payment_method: 'Pix', reference: 'NF123', receipt_path: null, notes: null, created_by: 'u1',
      reversed_at: null, reversed_by: null, reversal_reason: null, created_at: '2026-01-10T12:00:00Z',
    })
    expect(settlement).toEqual({
      id: 's1', accountKind: 'payable', accountId: 'a1', amount: 150, effectiveDate: '2026-01-10',
      paymentMethod: 'Pix', reference: 'NF123', receiptPath: null, notes: null, createdBy: 'u1',
      reversedAt: null, reversedBy: null, reversalReason: null, createdAt: '2026-01-10T12:00:00Z',
    })
  })

  it('mapeia evento de auditoria', () => {
    const event = mapAuditEventRow({
      id: 'e1', account_kind: 'receivable', account_id: 'a1', actor_id: 'u1', action: 'liquidado',
      amount: '50.00', previous_status: 'pendente', new_status: 'parcial', reason: null, created_at: '2026-01-10T12:00:00Z',
    })
    expect(event.amount).toBe(50)
    expect(event.action).toBe('liquidado')
  })
})

// ── exportAccountsCSV — reaproveita escapeCsvField, já testado em finance.test.ts ──

describe('exportAccountsCSV', () => {
  it('roda sem lançar erro pra uma lista vazia ou com dados', () => {
    // @ts-expect-error jsdom não roda neste ambiente (vitest environment: node) —
    // só garante que a função não quebra antes de tocar em Blob/document.
    global.document = { createElement: () => ({ click: () => {} }), body: { appendChild: () => {}, removeChild: () => {} } }
    // @ts-expect-error idem
    global.URL.createObjectURL = () => 'blob:x'
    // @ts-expect-error idem
    global.URL.revokeObjectURL = () => {}
    // @ts-expect-error idem
    global.Blob = class { constructor() {} }
    expect(() => exportAccountsCSV([], 'Resultado completo')).not.toThrow()
  })
})

// ── Rotas: settle/cancel/reverse — validam entrada e repassam pra RPC ────

type Row = Record<string, unknown>

function makeSupabase({ rpcResult, profile = { role: 'technician', is_leader: true }, updateRows }: {
  rpcResult?: { data?: unknown; error?: { message: string } | null }
  profile?: Row | null
  updateRows?: Row[]
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'leader-1' } } }) },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ single: vi.fn().mockResolvedValue({ data: profile, error: null }) }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ select: () => Promise.resolve({ data: updateRows ?? [{ id: 'a1' }], error: null }) }),
          }),
        }),
      }),
      insert: () => Promise.resolve({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue(rpcResult ?? { data: { id: 'a1', status: 'parcial' }, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const makeReq = (url: string, body: unknown) => new Request(url, { method: 'POST', body: JSON.stringify(body) })

describe('POST /api/admin/accounts/payable/[id]/settle', () => {
  it('400 sem valor', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase())
    const { POST } = await import('@/app/api/admin/accounts/payable/[id]/settle/route')
    const res = await POST(makeReq('http://x', { effectiveDate: '2026-01-10' }), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(400)
  })

  it('chama rpc settle_account com account_kind payable e devolve 200', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supabase = makeSupabase()
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase)
    const { POST } = await import('@/app/api/admin/accounts/payable/[id]/settle/route')
    const res = await POST(makeReq('http://x', { amount: 50, effectiveDate: '2026-01-10', paymentMethod: 'Pix' }), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('settle_account', expect.objectContaining({ p_account_kind: 'payable', p_account_id: 'a1', p_amount: 50 }))
  })

  it('propaga erro de saldo insuficiente da RPC como 400', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase({ rpcResult: { error: { message: 'Valor maior que o saldo em aberto (R$ 10.00).' } } }))
    const { POST } = await import('@/app/api/admin/accounts/payable/[id]/settle/route')
    const res = await POST(makeReq('http://x', { amount: 999, effectiveDate: '2026-01-10' }), { params: Promise.resolve({ id: 'a1' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/saldo/)
  })

  it('403 quando não é líder', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase({ profile: { role: 'technician', is_leader: false } }))
    const { POST } = await import('@/app/api/admin/accounts/payable/[id]/settle/route')
    const res = await POST(makeReq('http://x', { amount: 50, effectiveDate: '2026-01-10' }), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/admin/accounts/receivable/[id]/cancel', () => {
  it('400 sem motivo', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase())
    const { POST } = await import('@/app/api/admin/accounts/receivable/[id]/cancel/route')
    const res = await POST(makeReq('http://x', {}), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(400)
  })

  it('chama rpc cancel_account com account_kind receivable', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supabase = makeSupabase()
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase)
    const { POST } = await import('@/app/api/admin/accounts/receivable/[id]/cancel/route')
    const res = await POST(makeReq('http://x', { reason: 'Pedido cancelado pelo cliente' }), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('cancel_account', { p_account_kind: 'receivable', p_account_id: 'a1', p_reason: 'Pedido cancelado pelo cliente' })
  })

  it('propaga erro de "já liquidada" da RPC como 400 (não permite cancelar conta liquidada)', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase({ rpcResult: { error: { message: 'Não é possível cancelar uma conta já liquidada (parcial ou total) — estorne a liquidação primeiro, se aplicável.' } } }))
    const { POST } = await import('@/app/api/admin/accounts/receivable/[id]/cancel/route')
    const res = await POST(makeReq('http://x', { reason: 'motivo' }), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/accounts/settlements/[settlementId]/reverse', () => {
  it('400 sem motivo', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase())
    const { POST } = await import('@/app/api/admin/accounts/settlements/[settlementId]/reverse/route')
    const res = await POST(makeReq('http://x', {}), { params: Promise.resolve({ settlementId: 's1' }) })
    expect(res.status).toBe(400)
  })

  it('chama rpc reverse_account_settlement', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supabase = makeSupabase()
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase)
    const { POST } = await import('@/app/api/admin/accounts/settlements/[settlementId]/reverse/route')
    const res = await POST(makeReq('http://x', { reason: 'Pagamento não confirmado no extrato' }), { params: Promise.resolve({ settlementId: 's1' }) })
    expect(res.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('reverse_account_settlement', { p_settlement_id: 's1', p_reason: 'Pagamento não confirmado no extrato' })
  })

  it('impede estornar 2x (RPC recusa liquidação já estornada)', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase({ rpcResult: { error: { message: 'Esta liquidação já foi estornada.' } } }))
    const { POST } = await import('@/app/api/admin/accounts/settlements/[settlementId]/reverse/route')
    const res = await POST(makeReq('http://x', { reason: 'motivo' }), { params: Promise.resolve({ settlementId: 's1' }) })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/accounts/payable e /receivable — criação', () => {
  function makeCreateSupabase(profile: Row = { role: 'technician', is_leader: true }) {
    return {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'leader-1' } } }) },
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: profile, error: null }) }) }),
        insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: 'new-1', status: 'pendente' }, error: null }) }) }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  it('cria conta a pagar com valor válido', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeCreateSupabase())
    const { POST } = await import('@/app/api/admin/accounts/payable/route')
    const res = await POST(makeReq('http://x', { description: 'Fornecedor X', amount: 200 }))
    expect(res.status).toBe(200)
  })

  it('400 com valor zero ou negativo', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeCreateSupabase())
    const { POST } = await import('@/app/api/admin/accounts/receivable/route')
    const res = await POST(makeReq('http://x', { description: 'Cliente Y', amount: 0 }))
    expect(res.status).toBe(400)
  })

  it('400 sem descrição', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeCreateSupabase())
    const { POST } = await import('@/app/api/admin/accounts/receivable/route')
    const res = await POST(makeReq('http://x', { description: '', amount: 100 }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/accounts/payable/[id] — edição pré-liquidação', () => {
  it('409 quando a conta já não está mais em pendente/amount_settled=0 (concorrência otimista)', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase({ updateRows: [] }))
    const { PATCH } = await import('@/app/api/admin/accounts/payable/[id]/route')
    const res = await PATCH(makeReq('http://x', { description: 'Nova descrição' }), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(409)
  })

  it('200 quando a conta ainda é editável', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase({ updateRows: [{ id: 'a1' }] }))
    const { PATCH } = await import('@/app/api/admin/accounts/payable/[id]/route')
    const res = await PATCH(makeReq('http://x', { description: 'Nova descrição' }), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(200)
  })
})
