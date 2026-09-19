import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { headers } from 'next/headers'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/supabase-admin',  () => ({ createAdminClient:           vi.fn() }))
vi.mock('@/lib/resend', () => ({
  getResendClient: vi.fn(() => ({
    resend: { emails: { send: vi.fn().mockResolvedValue({ data: null, error: null }) } },
    from: 'noreply@test.com',
  })),
}))
vi.mock('next/headers', () => ({ headers: vi.fn() }))

// Cada teste usa um IP próprio (via x-forwarded-for) — o rate limit por IP é
// um Map em memória no módulo lib/rate-limit.ts, compartilhado entre todos os
// testes deste arquivo; reusar um IP faria os testes se poluírem uns aos
// outros (um teste consumindo a cota de IP de outro).
let ipCounter = 0
function mockIp(ip?: string) {
  const value = ip ?? `10.0.0.${++ipCounter}`
  vi.mocked(headers).mockResolvedValue(
    new Headers({ 'x-forwarded-for': value }) as unknown as Awaited<ReturnType<typeof headers>>
  )
}

// ── Lazy import (avoids module-level side-effects) ────────────────────────────

let submitContact: (input: ContactInput) => Promise<ActionResult>

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL       = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  = 'test-anon'
  process.env.NEXT_PUBLIC_SITE_URL           = 'http://localhost:3000'
  const mod = await import('@/app/contato/actions')
  submitContact = mod.submitContact as unknown as typeof submitContact
})

afterEach(() => vi.clearAllMocks())

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContactInput {
  name: string; email: string; phone: string
  company: string; document: string; interest_area: string; message: string
}
type ActionResult = { success: true } | { success: false; error: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseInput: ContactInput = {
  name:          'Maria Silva',
  email:         'maria@empresa.com',
  phone:         '11999999999',
  company:       'Empresa XPTO',
  document:      '12345678901',
  interest_area: 'site-institucional',
  message:       'Quero um site novo.',
}

// Thenable Supabase chain — `await chain` resolves to `resolveWith`
function makeChain(resolveWith: unknown) {
  const ch: Record<string, unknown> = {}
  for (const m of ['select','eq','gte','lte','is','in','or','update','delete','upsert']) {
    ch[m] = () => ch
  }
  ch.insert = vi.fn(() => ch)
  ch.single = vi.fn().mockResolvedValue(resolveWith)
  ch.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(f, r)
  ch.catch = () => Promise.resolve(resolveWith)
  return ch
}

// Server-side supabase mock (no logged-in user by default)
function makeServerSupa(
  user: { id: string } | null = null,
  contactInsertError: object | null = null,
) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === 'contacts') return makeChain({ data: null, error: contactInsertError })
      return makeChain({ data: null, error: null })
    }),
  }
}

// Admin client mock — controls the rate-limit count
function makeAdmin(contactCount: number) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'contacts') return makeChain({ count: contactCount, error: null })
      // profiles for notifyLeaders (fire-and-forget, should return empty list)
      return makeChain({ data: [], error: null })
    }),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('submitContact', () => {
  it('retorna erro quando rate limit atingido (≥ 3 envios em 10 min)', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa() as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(3) as any) // eslint-disable-line
    mockIp()

    const result = await submitContact(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Muitas solicitações/i)
  })

  it('retorna erro quando insert no banco falha', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeServerSupa(null, { message: 'duplicate key' }) as any // eslint-disable-line
    )
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(0) as any) // eslint-disable-line
    mockIp()

    const result = await submitContact(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Erro ao salvar/i)
  })

  it('retorna { success: true } no fluxo completo sem usuário logado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa() as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(0) as any) // eslint-disable-line
    mockIp()

    const result = await submitContact(baseInput)

    expect(result.success).toBe(true)
  })

  it('faz upsert no perfil quando usuário está logado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    const serverSupa = makeServerSupa({ id: 'user-logado' })
    vi.mocked(createServerSupabaseClient).mockResolvedValue(serverSupa as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(0) as any) // eslint-disable-line
    mockIp()

    await submitContact(baseInput)

    // from() was called with 'profiles' for upsert AND 'contacts' for insert
    const fromCalls = (serverSupa.from as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0])
    expect(fromCalls).toContain('profiles')
  })

  it('não bloqueia quando count é exatamente 2 (abaixo do limite)', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa() as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(2) as any) // eslint-disable-line
    mockIp()

    const result = await submitContact(baseInput)

    expect(result.success).toBe(true)
  })

  it('bloqueia por IP mesmo trocando o e-mail a cada envio (contorno do limite por e-mail)', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa() as any) // eslint-disable-line
    // count sempre 0: se o rate limit fosse só por e-mail, nunca bloquearia
    // aqui — é exatamente o bypass que existia antes deste fix.
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(0) as any) // eslint-disable-line
    const ip = '203.0.113.9'

    for (let i = 0; i < 5; i++) {
      mockIp(ip)
      const ok = await submitContact({ ...baseInput, email: `attacker${i}@evil.com` })
      expect(ok.success).toBe(true)
    }

    mockIp(ip)
    const blocked = await submitContact({ ...baseInput, email: 'attacker-6th@evil.com' })
    expect(blocked.success).toBe(false)
    if (!blocked.success) expect(blocked.error).toMatch(/Muitas solicitações/i)
  })

  it('não bloqueia um IP diferente mesmo depois de outro IP esgotar sua cota', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa() as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(0) as any) // eslint-disable-line

    mockIp() // IP novo e único (contador global) — nunca usado antes neste arquivo
    const result = await submitContact(baseInput)

    expect(result.success).toBe(true)
  })
})
