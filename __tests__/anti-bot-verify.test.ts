import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 'server-only' lança incondicionalmente fora do pipeline de build do Next — ver
// mesmo comentário em anti-bot-config.test.ts.
vi.mock('server-only', () => ({}))

// verifyAntiBotToken lê antiBotConfig no momento da chamada (não no import), então
// basta setar as env vars antes de cada teste — sem precisar de vi.resetModules().
const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY        = 'test-secret'
  process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'lobby.tech'
  process.env.NODE_ENV                    = 'test'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.resetModules()
})

async function importVerify() {
  vi.resetModules()
  return import('@/lib/anti-bot/verify')
}

describe('verifyAntiBotToken', () => {
  it('rejeita quando o token está ausente — nunca chega a chamar o provedor', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = { siteverify: vi.fn() }
    const result = await verifyAntiBotToken({ token: undefined, action: 'register', client })
    expect(result).toEqual({ outcome: 'rejected', reason: 'missing_token' })
    expect(client.siteverify).not.toHaveBeenCalled()
  })

  it('rejeita token maior que 2048 caracteres sem chamar o provedor', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = { siteverify: vi.fn() }
    const result = await verifyAntiBotToken({ token: 'x'.repeat(2049), action: 'register', client })
    expect(result).toEqual({ outcome: 'rejected', reason: 'missing_token' })
    expect(client.siteverify).not.toHaveBeenCalled()
  })

  it('aprova quando a Cloudflare retorna success=true, hostname permitido e ação correta', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = {
      siteverify: vi.fn().mockResolvedValue({
        success: true, hostname: 'lobby.tech', action: 'register', 'error-codes': [],
      }),
    }
    const result = await verifyAntiBotToken({ token: 'tok', action: 'register', client })
    expect(result).toEqual({ outcome: 'ok' })
  })

  it('rejeita quando o hostname retornado não está no allowlist do servidor', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = {
      siteverify: vi.fn().mockResolvedValue({
        success: true, hostname: 'attacker.example', action: 'register',
      }),
    }
    const result = await verifyAntiBotToken({ token: 'tok', action: 'register', client })
    expect(result).toEqual({ outcome: 'rejected', reason: 'hostname_mismatch' })
  })

  it('rejeita quando a ação retornada não é a esperada pela rota (comprovante de outra operação)', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = {
      siteverify: vi.fn().mockResolvedValue({
        success: true, hostname: 'lobby.tech', action: 'login',
      }),
    }
    // Comprovante obtido para "login" não pode validar um "register".
    const result = await verifyAntiBotToken({ token: 'tok', action: 'register', client })
    expect(result).toEqual({ outcome: 'rejected', reason: 'action_mismatch' })
  })

  it('mapeia timeout-or-duplicate (comprovante já usado) como "duplicate"', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = {
      siteverify: vi.fn().mockResolvedValue({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    }
    const result = await verifyAntiBotToken({ token: 'tok', action: 'login', client })
    expect(result).toEqual({ outcome: 'rejected', reason: 'duplicate' })
  })

  it('mapeia invalid-input-response como "invalid_or_expired"', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = {
      siteverify: vi.fn().mockResolvedValue({ success: false, 'error-codes': ['invalid-input-response'] }),
    }
    const result = await verifyAntiBotToken({ token: 'tok', action: 'login', client })
    expect(result).toEqual({ outcome: 'rejected', reason: 'invalid_or_expired' })
  })

  it('trata secret inválida/ausente no provedor como indisponibilidade, não como rejeição do usuário', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = {
      siteverify: vi.fn().mockResolvedValue({ success: false, 'error-codes': ['invalid-input-secret'] }),
    }
    const result = await verifyAntiBotToken({ token: 'tok', action: 'login', client })
    expect(result).toEqual({ outcome: 'unavailable', reason: 'config_missing' })
  })

  it('trata erro de rede/timeout do provedor como indisponibilidade', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = { siteverify: vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) }
    const result = await verifyAntiBotToken({ token: 'tok', action: 'login', client })
    expect(result).toEqual({ outcome: 'unavailable', reason: 'timeout' })
  })

  it('trata resposta malformada (success ausente) como indisponibilidade', async () => {
    const { verifyAntiBotToken } = await importVerify()
    const client = { siteverify: vi.fn().mockResolvedValue({ foo: 'bar' } as never) }
    const result = await verifyAntiBotToken({ token: 'tok', action: 'login', client })
    expect(result).toEqual({ outcome: 'unavailable', reason: 'malformed_response' })
  })

  it('retorna indisponível quando TURNSTILE_SECRET_KEY não está configurada — nunca abre passagem', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    const { verifyAntiBotToken } = await importVerify()
    const client = { siteverify: vi.fn() }
    const result = await verifyAntiBotToken({ token: 'tok', action: 'login', client })
    expect(result).toEqual({ outcome: 'unavailable', reason: 'config_missing' })
    expect(client.siteverify).not.toHaveBeenCalled()
  })

  it('bloqueia a chave de teste oficial da Cloudflare em produção', async () => {
    process.env.NODE_ENV = 'production'
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'
    await expect(importVerify()).rejects.toThrow(/chave de TESTE/)
  })
})
