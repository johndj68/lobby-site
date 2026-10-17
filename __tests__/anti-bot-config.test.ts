import { describe, it, expect, afterEach, vi } from 'vitest'

// O pacote 'server-only' lança incondicionalmente fora do pipeline de build do
// Next (que o substitui por um no-op só em Server Components) — sem isso, qualquer
// import deste módulo em teste plano (vitest/node) falharia mesmo em contexto
// 100% server-side. Mesmo workaround de qualquer projeto Next + vitest.
vi.mock('server-only', () => ({}))

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.resetModules()
})

describe('lib/anti-bot/config', () => {
  it('isConfigured é false quando nenhuma chave está definida (não crasha o app)', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    process.env.NODE_ENV = 'test'
    vi.resetModules()
    const { antiBotConfig } = await import('@/lib/anti-bot/config')
    expect(antiBotConfig.isConfigured).toBe(false)
  })

  it('isConfigured é true quando as duas chaves estão presentes', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret'
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site'
    process.env.NODE_ENV = 'test'
    vi.resetModules()
    const { antiBotConfig } = await import('@/lib/anti-bot/config')
    expect(antiBotConfig.isConfigured).toBe(true)
  })

  it('bloqueia qualquer uma das 3 chaves de teste oficiais da Cloudflare em produção', async () => {
    for (const testKey of [
      '1x0000000000000000000000000000000AA',
      '2x0000000000000000000000000000000AA',
      '3x0000000000000000000000000000000AA',
    ]) {
      process.env.NODE_ENV = 'production'
      process.env.TURNSTILE_SECRET_KEY = testKey
      vi.resetModules()
      await expect(import('@/lib/anti-bot/config')).rejects.toThrow(/chave de TESTE/)
    }
  })

  it('permite a chave de teste fora de produção (uso intencional em dev/test)', async () => {
    process.env.NODE_ENV = 'test'
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'
    vi.resetModules()
    await expect(import('@/lib/anti-bot/config')).resolves.toBeDefined()
  })

  it('allowedHostnames cai para localhost fora de produção quando não configurado', async () => {
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES
    process.env.NODE_ENV = 'test'
    vi.resetModules()
    const { allowedHostnames } = await import('@/lib/anti-bot/config')
    expect(allowedHostnames).toEqual(['localhost'])
  })

  it('allowedHostnames é vazio em produção sem configuração explícita — nunca aceita nada por padrão', async () => {
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES
    process.env.NODE_ENV = 'production'
    process.env.TURNSTILE_SECRET_KEY = 'real-secret-not-a-test-key'
    vi.resetModules()
    const { allowedHostnames } = await import('@/lib/anti-bot/config')
    expect(allowedHostnames).toEqual([])
  })
})
