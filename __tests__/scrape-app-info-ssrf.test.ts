import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/rate-limit-redis', () => ({
  checkRateLimit: vi.fn(),
}))

vi.mock('node:dns', () => {
  const lookup = vi.fn()
  const promises = { lookup }
  return { default: { promises }, promises }
})

let POST: (req: Request) => Promise<Response>
let mockLookup: ReturnType<typeof vi.fn>
let mockFetch: ReturnType<typeof vi.fn>

function htmlResponse(html: string, overrides: Partial<Record<string, string>> = {}) {
  const headers = new Map(
    Object.entries({ 'content-type': 'text/html', ...overrides })
  )
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    text: async () => html,
  } as unknown as Response
}

function redirectResponse(location: string) {
  const headers = new Map([['location', location]])
  return {
    ok: false,
    status: 302,
    statusText: 'Found',
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    text: async () => '',
  } as unknown as Response
}

function createMockRequest(body: unknown): Request {
  return { json: async () => body } as Request
}

beforeAll(async () => {
  const { createServerSupabaseClient } = await import('@/lib/supabase-server')
  const { checkRateLimit } = await import('@/lib/rate-limit-redis')
  const dns = await import('node:dns')

  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'vendor-1' } } }) },
  } as never)
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 })

  mockLookup = vi.mocked(dns.promises.lookup)
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)

  const routeModule = await import('@/app/api/scrape-app-info/route')
  POST = routeModule.POST
})

afterEach(() => {
  mockLookup.mockReset()
  mockFetch.mockReset()
})

describe('POST /api/scrape-app-info — SSRF guard', () => {
  it('allows a hostname that resolves to a public IP', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
    mockFetch.mockResolvedValueOnce(
      htmlResponse('<title>App Público</title>')
    )

    const res = await POST(createMockRequest({ url: 'https://app-publico.example.com' }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.data.name).toBe('App Público')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a public-looking hostname that resolves to the AWS metadata IP (DNS rebinding)', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])

    const res = await POST(createMockRequest({ url: 'https://rebinder.example.com' }))

    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects a hostname that resolves to a loopback IP', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])

    const res = await POST(createMockRequest({ url: 'https://looksfine.example.com' }))

    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects a hostname that resolves to a private RFC1918 IP', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }])

    const res = await POST(createMockRequest({ url: 'https://internal.example.com' }))

    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects literal "localhost" without needing a DNS lookup', async () => {
    const res = await POST(createMockRequest({ url: 'http://localhost:8080/' }))

    expect(res.status).toBe(400)
    expect(mockLookup).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('re-validates and blocks a redirect that points at an internal IP, even from a valid public host', async () => {
    // First hop: public host resolves to a public IP, server replies with a redirect.
    mockLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
    mockFetch.mockResolvedValueOnce(redirectResponse('http://127.0.0.1:6379/internal'))

    const res = await POST(createMockRequest({ url: 'https://trusted.example.com' }))

    expect(res.status).toBe(400)
    // Only the first hop should have reached fetch — the redirect target
    // must be rejected before a second request is ever made.
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('rejects non-HTTP(S) protocols', async () => {
    const res = await POST(createMockRequest({ url: 'file:///etc/passwd' }))

    expect(res.status).toBe(400)
    expect(mockLookup).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('enforces the rate limit before doing any network work', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit-redis')
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() })

    const res = await POST(createMockRequest({ url: 'https://app-publico.example.com' }))

    expect(res.status).toBe(429)
    expect(mockLookup).not.toHaveBeenCalled()
  })
})
