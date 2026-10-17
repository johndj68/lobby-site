import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({ insert: () => ({ then: (cb: (r: { error: null }) => void) => cb({ error: null }) }) }),
  })),
}))

vi.mock('@/lib/services/role', () => ({
  getProfileRole: vi.fn().mockResolvedValue('client'),
}))

vi.mock('@/lib/rate-limit-redis', () => ({
  checkRateLimit:      vi.fn().mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 }),
  rateLimitResponse:   vi.fn().mockReturnValue(null),
  getClientIp:         vi.fn().mockReturnValue('203.0.113.1'),
  checkLockout:        vi.fn().mockResolvedValue({ locked: false, retryAfterSec: 0 }),
  recordAuthFailure:   vi.fn(),
  clearAuthFailures:   vi.fn(),
}))

vi.mock('@/lib/anti-bot/policy', () => ({
  loginChallengeRequired:     vi.fn().mockResolvedValue(false),
  recordLoginFailureSignal:   vi.fn(),
  clearLoginChallengeSignal:  vi.fn(),
}))

vi.mock('@/lib/anti-bot/verify', () => ({
  verifyAntiBotToken: vi.fn(),
}))

let POST: (req: Request) => Promise<Response>

beforeAll(async () => {
  const mod = await import('@/app/api/auth/login/route')
  POST = mod.POST as unknown as (req: Request) => Promise<Response>
})

// resetAllMocks (não clearAllMocks) — precisamos apagar também a implementação
// (mockResolvedValue) que um teste anterior tenha setado, não só o histórico de
// chamadas. O beforeEach abaixo reaplica a baseline "caminho feliz" para cada
// teste partir do mesmo estado, evitando que o resultado de um teste "vaze" pro
// próximo por reaproveitar o mesmo objeto mockado.
afterEach(() => {
  vi.resetAllMocks()
})

beforeEach(async () => {
  const { checkRateLimit, rateLimitResponse, getClientIp, checkLockout } = await import('@/lib/rate-limit-redis')
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 })
  vi.mocked(rateLimitResponse).mockReturnValue(null)
  vi.mocked(getClientIp).mockReturnValue('203.0.113.1')
  vi.mocked(checkLockout).mockResolvedValue({ locked: false, retryAfterSec: 0 })

  const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
  vi.mocked(loginChallengeRequired).mockResolvedValue(false)

  const { getProfileRole } = await import('@/lib/services/role')
  vi.mocked(getProfileRole).mockResolvedValue('client')
})

const makeReq = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

const makeServerSupa = (signInError: { message: string } | null, user: { id: string } | null = { id: 'u1' }) => ({
  auth: {
    signInWithPassword: vi.fn().mockResolvedValue({ error: signInError }),
    getUser:            vi.fn().mockResolvedValue({ data: { user: signInError ? null : user }, error: null }),
    signOut:            vi.fn(),
  },
})

describe('POST /api/auth/login — anti-bot adaptativo', () => {
  it('login normal (sem falhas prévias) não exige desafio e segue direto', async () => {
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
    vi.mocked(loginChallengeRequired).mockResolvedValue(false)
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(null) as never)

    const res = await POST(makeReq({ email: 'user@test.com', password: 'certa123' }))
    expect(res.status).toBe(200)
    expect(verifyAntiBotToken).not.toHaveBeenCalled()
  })

  it('após o limiar de falhas, exige desafio e bloqueia sem comprovante — nem tenta a credencial', async () => {
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
    vi.mocked(loginChallengeRequired).mockResolvedValue(true)
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'missing_token' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supa = makeServerSupa(null)
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supa as never)

    const res = await POST(makeReq({ email: 'user@test.com', password: 'certa123' }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('BOT_CHALLENGE_REQUIRED')
    expect(supa.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('tentativa do cliente de desativar a exigência (campo arbitrário no body) não tem efeito', async () => {
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
    vi.mocked(loginChallengeRequired).mockResolvedValue(true)
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'missing_token' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supa = makeServerSupa(null)
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supa as never)

    const res = await POST(makeReq({
      email: 'user@test.com', password: 'certa123',
      skipChallenge: true, bypassAntiBot: true, turnstileRequired: false,
    }))
    expect(res.status).toBe(400)
    expect(supa.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('com desafio exigido e comprovante válido, segue até tentar a credencial', async () => {
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
    vi.mocked(loginChallengeRequired).mockResolvedValue(true)
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'ok' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supa = makeServerSupa(null)
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supa as never)

    const res = await POST(makeReq({ email: 'user@test.com', password: 'certa123', turnstileToken: 'tok' }))
    expect(res.status).toBe(200)
    expect(supa.auth.signInWithPassword).toHaveBeenCalledOnce()
  })

  it('mesmo tratamento para conta existente e inexistente: o desafio é decidido só pelos contadores', async () => {
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
    vi.mocked(loginChallengeRequired).mockResolvedValue(true)
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'missing_token' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supa = makeServerSupa(null)
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supa as never)

    const resExisting    = await POST(makeReq({ email: 'existe@test.com', password: 'x' }))
    const resNonExisting = await POST(makeReq({ email: 'nao-existe@test.com', password: 'x' }))
    expect(resExisting.status).toBe(resNonExisting.status)
    const [bodyA, bodyB] = await Promise.all([resExisting.json(), resNonExisting.json()])
    expect(bodyA.code).toBe('BOT_CHALLENGE_REQUIRED')
    expect(bodyB.code).toBe('BOT_CHALLENGE_REQUIRED')
  })

  it('e-mail não confirmado retorna código estruturado para oferecer reenvio', async () => {
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
    vi.mocked(loginChallengeRequired).mockResolvedValue(false)
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeServerSupa({ message: 'Email not confirmed' }) as never,
    )

    const res = await POST(makeReq({ email: 'user@test.com', password: 'certa123' }))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.code).toBe('EMAIL_NOT_CONFIRMED')
  })

  it('lockout por falhas consecutivas é verificado antes do desafio adaptativo', async () => {
    const { checkLockout } = await import('@/lib/rate-limit-redis')
    vi.mocked(checkLockout).mockResolvedValue({ locked: true, retryAfterSec: 30 })
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')

    const res = await POST(makeReq({ email: 'user@test.com', password: 'x' }))
    expect(res.status).toBe(429)
    expect(loginChallengeRequired).not.toHaveBeenCalled()
  })

  it('resolver o desafio não zera o contador de falhas de login (sem tentativas ilimitadas)', async () => {
    const { loginChallengeRequired, recordLoginFailureSignal } = await import('@/lib/anti-bot/policy')
    vi.mocked(loginChallengeRequired).mockResolvedValue(true)
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'ok' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { recordAuthFailure } = await import('@/lib/rate-limit-redis')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeServerSupa({ message: 'Invalid login credentials' }) as never,
    )

    const res = await POST(makeReq({ email: 'user@test.com', password: 'errada', turnstileToken: 'tok' }))
    expect(res.status).toBe(401)
    // Mesmo com comprovante válido, a senha errada ainda conta como falha nos dois
    // contadores (lockout existente + sinal do desafio adaptativo).
    expect(recordAuthFailure).toHaveBeenCalledOnce()
    expect(recordLoginFailureSignal).toHaveBeenCalledOnce()
  })
})
