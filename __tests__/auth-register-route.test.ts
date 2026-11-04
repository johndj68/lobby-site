import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({ insert: () => ({ then: (cb: (r: { error: null }) => void) => cb({ error: null }) }) }),
  })),
}))

vi.mock('@/lib/rate-limit-redis', () => ({
  checkRateLimit:    vi.fn().mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 }),
  rateLimitResponse: vi.fn().mockReturnValue(null),
  getClientIp:       vi.fn().mockReturnValue('203.0.113.1'),
}))

vi.mock('@/lib/anti-bot/verify', () => ({
  verifyAntiBotToken: vi.fn(),
}))

let POST: (req: Request) => Promise<Response>

beforeAll(async () => {
  const mod = await import('@/app/api/auth/register/route')
  POST = mod.POST as unknown as (req: Request) => Promise<Response>
})

afterEach(() => {
  vi.clearAllMocks()
})

const validBody = {
  fullName:       'Maria Silva',
  email:          'maria@test.com',
  password:       'senha12345',
  companyName:    'Acme',
  phone:          '11999999999',
  document:       '52998224725', // CPF válido
  interestArea:   'Software',
  turnstileToken: 'valid-token',
}

const makeReq = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

describe('POST /api/auth/register — anti-bot', () => {
  it('rejeita cadastro sem comprovante anti-bot, sem chamar supabase.auth.signUp', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'missing_token' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const signUp = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { signUp }, from: vi.fn() } as never)

    const { turnstileToken, ...noToken } = validBody
    void turnstileToken
    const res = await POST(makeReq(noToken))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('BOT_CHALLENGE_REQUIRED')
    expect(signUp).not.toHaveBeenCalled()
  })

  it('cria a conta quando o comprovante é válido', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'ok' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const signUp = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { signUp }, from: () => ({ upsert }),
    } as never)

    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(200)
    expect(signUp).toHaveBeenCalledOnce()
  })

  it('comprovante expirado/reutilizado retorna 400 BOT_CHALLENGE_REQUIRED, não cria conta', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'duplicate' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const signUp = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { signUp } } as never)

    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(400)
    expect(signUp).not.toHaveBeenCalled()
  })

  it('hostname incorreto retornado pela Cloudflare bloqueia o cadastro', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'hostname_mismatch' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const signUp = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { signUp } } as never)

    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(400)
    expect(signUp).not.toHaveBeenCalled()
  })

  it('ação incorreta (comprovante de outra operação) bloqueia o cadastro', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'action_mismatch' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const signUp = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { signUp } } as never)

    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(400)
    expect(signUp).not.toHaveBeenCalled()
  })

  it('indisponibilidade do provedor retorna 503, não 400, e não cria conta', async () => {
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'unavailable', reason: 'timeout' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const signUp = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { signUp } } as never)

    const res = await POST(makeReq(validBody))
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.code).toBe('BOT_CHALLENGE_UNAVAILABLE')
    expect(signUp).not.toHaveBeenCalled()
  })

  it('chamada direta à API sem passar pela interface (sem campo turnstileToken no body) ainda é bloqueada', async () => {
    // Simula um atacante batendo direto no endpoint, ignorando o frontend por completo.
    const { verifyAntiBotToken } = await import('@/lib/anti-bot/verify')
    vi.mocked(verifyAntiBotToken).mockResolvedValue({ outcome: 'rejected', reason: 'missing_token' })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const signUp = vi.fn()
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { signUp } } as never)

    const res = await POST(makeReq({
      fullName: 'Attacker', email: 'a@test.com', password: 'xxxxxxxx',
      companyName: 'X', phone: '11999999999', document: '52998224725', interestArea: 'Software',
      // turnstileToken ausente de propósito, e nenhum outro campo pode substituí-lo
      skipChallenge: true, bypass: true,
    }))
    expect(res.status).toBe(400)
    expect(signUp).not.toHaveBeenCalled()
  })
})
