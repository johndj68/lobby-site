import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 'server-only' lança incondicionalmente fora do pipeline de build do Next —
// policy.ts importa config.ts, que importa 'server-only'. Ver mesmo comentário
// em anti-bot-config.test.ts.
vi.mock('server-only', () => ({}))

vi.mock('@/lib/rate-limit-redis', () => ({
  peekCounter:      vi.fn(),
  incrementCounter: vi.fn(),
  resetCounter:     vi.fn(),
}))

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.ANTI_BOT_LOGIN_CHALLENGE_THRESHOLD = '3'
  process.env.ANTI_BOT_LOGIN_CHALLENGE_WINDOW_MS  = '900000'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.resetModules()
  vi.clearAllMocks()
})

describe('loginChallengeRequired (desafio adaptativo de login)', () => {
  it('não exige desafio quando IP e conta estão abaixo do limiar', async () => {
    vi.resetModules()
    const { peekCounter } = await import('@/lib/rate-limit-redis')
    vi.mocked(peekCounter).mockResolvedValue(0)
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
    expect(await loginChallengeRequired('1.2.3.4', 'user@test.com')).toBe(false)
  })

  it('exige desafio quando o contador por IP atinge o limiar, mesmo com conta zerada', async () => {
    vi.resetModules()
    const { peekCounter } = await import('@/lib/rate-limit-redis')
    vi.mocked(peekCounter).mockImplementation(async (key: string) =>
      key.includes(':ip:') ? 3 : 0)
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
    expect(await loginChallengeRequired('1.2.3.4', 'user@test.com')).toBe(true)
  })

  it('exige desafio quando o contador por conta atinge o limiar, mesmo com IP zerado', async () => {
    vi.resetModules()
    const { peekCounter } = await import('@/lib/rate-limit-redis')
    vi.mocked(peekCounter).mockImplementation(async (key: string) =>
      key.includes(':acct:') ? 5 : 0)
    const { loginChallengeRequired } = await import('@/lib/anti-bot/policy')
    // Mesmo tratamento para conta inexistente: a chave é só o e-mail normalizado,
    // a função nunca verifica se a conta existe de fato.
    expect(await loginChallengeRequired('1.2.3.4', 'nao-existe@test.com')).toBe(true)
  })

  it('recordLoginFailureSignal incrementa tanto a chave de IP quanto a de conta', async () => {
    vi.resetModules()
    const { incrementCounter } = await import('@/lib/rate-limit-redis')
    const { recordLoginFailureSignal } = await import('@/lib/anti-bot/policy')
    await recordLoginFailureSignal('1.2.3.4', 'user@test.com')
    expect(vi.mocked(incrementCounter)).toHaveBeenCalledTimes(2)
    const calledKeys = vi.mocked(incrementCounter).mock.calls.map(c => c[0])
    expect(calledKeys.some(k => k.includes(':ip:1.2.3.4'))).toBe(true)
    expect(calledKeys.some(k => k.includes(':acct:user@test.com'))).toBe(true)
  })

  it('clearLoginChallengeSignal zera as duas chaves', async () => {
    vi.resetModules()
    const { resetCounter } = await import('@/lib/rate-limit-redis')
    const { clearLoginChallengeSignal } = await import('@/lib/anti-bot/policy')
    await clearLoginChallengeSignal('1.2.3.4', 'user@test.com')
    expect(vi.mocked(resetCounter)).toHaveBeenCalledTimes(2)
  })

  it('falhas concorrentes não perdem incrementos (nenhuma leitura-antes-de-escrever no nosso código)', async () => {
    // policy.ts nunca faz get+soma+set — delega inteiramente ao INCR atômico do
    // Redis (incrementCounter). Este teste simula esse INCR atômico com um mapa
    // compartilhado e confirma que N chamadas concorrentes a
    // recordLoginFailureSignal terminam com a contagem exata esperada, sem
    // incrementos perdidos por uma race introduzida por ESTE módulo.
    vi.resetModules()
    const counts = new Map<string, number>()
    const { incrementCounter } = await import('@/lib/rate-limit-redis')
    vi.mocked(incrementCounter).mockImplementation(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1
      counts.set(key, next)
      return next
    })
    const { recordLoginFailureSignal } = await import('@/lib/anti-bot/policy')

    const N = 5
    await Promise.all(Array.from({ length: N }, () => recordLoginFailureSignal('1.2.3.4', 'user@test.com')))

    expect(vi.mocked(incrementCounter)).toHaveBeenCalledTimes(N * 2)
    const ipKey   = vi.mocked(incrementCounter).mock.calls.map(c => c[0]).find(k => k.includes(':ip:'))!
    const acctKey = vi.mocked(incrementCounter).mock.calls.map(c => c[0]).find(k => k.includes(':acct:'))!
    expect(counts.get(ipKey)).toBe(N)
    expect(counts.get(acctKey)).toBe(N)
  })
})
