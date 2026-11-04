import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({ insert: () => ({ then: (cb: (r: { error: null }) => void) => cb({ error: null }) }) }),
  })),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 }),
  getClientIp:    vi.fn().mockReturnValue('203.0.113.1'),
}))

vi.mock('@/lib/anti-bot/verify', () => ({
  verifyAntiBotToken: vi.fn(),
}))

let POST: (req: NextRequest) => Promise<Response>

beforeAll(async () => {
  const mod = await import('@/app/api/auth/forgot-password/route')
  POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>
})

// resetAllMocks (não clearAllMocks): também apaga a implementação
// (mockReturnValue/mockResolvedValue) de um teste anterior, não só o histórico de
// chamadas — sem isso, o checkRateLimit "allowed:false" de um teste vazava pro
// próximo. beforeEach reaplica a baseline "caminho feliz".
afterEach(() => {
  vi.resetAllMocks()
})

beforeEach(async () => {
  const { checkRateLimit, getClientIp } = await import('@/lib/rate-limit')
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 })
  vi.mocked(getClientIp).mockReturnValue('203.0.113.1')

  const { createAdminClient } = await import('@/lib/supabase-admin')
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => ({ insert: () => ({ then: (cb: (r: { error: null }) => void) => cb({ error: null }) }) }),
  } as never)
})

// NextRequest, não Request puro — a rota lê req.nextUrl.origin para montar o
// redirectTo do e-mail de reset.
const makeReq = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

describe('POST /api/auth/forgot-password — anti-bot', () => {
  it('sem comprovante: 400 BOT_CHALLENGE_REQUIRED, nunca chama resetPasswordForEmail', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'missing_token' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const resetPasswordForEmail = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { resetPasswordForEmail } } as never)

    const res = await POST(makeReq({ email: 'user@test.com' }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('BOT_CHALLENGE_REQUIRED')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('comprovante válido: dispara o fluxo de reset e responde ok:true', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'ok' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { resetPasswordForEmail } } as never)

    const res = await POST(makeReq({ email: 'user@test.com', turnstileToken: 'tok' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(resetPasswordForEmail).toHaveBeenCalledOnce()
  })

  it('conta inexistente responde exatamente igual (ok:true) — não revela existência', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'ok' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    // Simula Supabase "falhando" silenciosamente por e-mail não existir — a rota já
    // trata esse erro como não-fatal e sempre responde ok:true (comportamento
    // pré-existente, preservado).
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: { message: 'user not found' } })
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { resetPasswordForEmail } } as never)

    const res = await POST(makeReq({ email: 'nao-existe@test.com', turnstileToken: 'tok' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
  })

  it('rate limit (fail-open) continua preservado: nem chega a checar o anti-bot', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit')
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 })
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')

    const res = await POST(makeReq({ email: 'user@test.com' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(verifyAntiBotToken).not.toHaveBeenCalled()
  })

  it('timeout do provedor retorna 503, não envia e-mail', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'unavailable', reason: 'timeout' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const resetPasswordForEmail = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { resetPasswordForEmail } } as never)

    const res = await POST(makeReq({ email: 'user@test.com', turnstileToken: 'tok' }))
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.code).toBe('BOT_CHALLENGE_UNAVAILABLE')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })
})
