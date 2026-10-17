import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

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

let POST: (req: Request) => Promise<Response>

beforeAll(async () => {
  const mod = await import('@/app/api/auth/resend-confirmation/route')
  POST = mod.POST as unknown as (req: Request) => Promise<Response>
})

// resetAllMocks (não clearAllMocks) — ver mesmo comentário em
// auth-forgot-password-route.test.ts (evita que uma implementação setada por um
// teste vaze pro próximo).
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

const makeReq = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/resend-confirmation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

describe('POST /api/auth/resend-confirmation — anti-bot', () => {
  it('sem comprovante: 400 BOT_CHALLENGE_REQUIRED, nunca chama auth.resend', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'missing_token' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const resend = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { resend } } as never)

    const res = await POST(makeReq({ email: 'user@test.com' }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('BOT_CHALLENGE_REQUIRED')
    expect(resend).not.toHaveBeenCalled()
  })

  it('comprovante válido: chama auth.resend({type:"signup"}) e responde ok:true', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'ok' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const resend = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { resend } } as never)

    const res = await POST(makeReq({ email: 'user@test.com', turnstileToken: 'tok' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'user@test.com' })
  })

  it('e-mail já confirmado ou inexistente: resposta idêntica (ok:true) — não revela nada', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'ok' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const resend = vi.fn().mockResolvedValue({ error: { message: 'Email already confirmed' } })
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { resend } } as never)

    const res = await POST(makeReq({ email: 'ja-confirmado@test.com', turnstileToken: 'tok' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
  })

  it('rate limit (fail-open) preservado: nem chega a checar o anti-bot', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit')
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 })
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')

    const res = await POST(makeReq({ email: 'user@test.com' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(verifyAntiBotToken).not.toHaveBeenCalled()
  })

  it('resposta malformada do provedor retorna 503, não reenvia', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'unavailable', reason: 'malformed_response' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const resend = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { resend } } as never)

    const res = await POST(makeReq({ email: 'user@test.com', turnstileToken: 'tok' }))
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.code).toBe('BOT_CHALLENGE_UNAVAILABLE')
    expect(resend).not.toHaveBeenCalled()
  })
})
