import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import sharp from 'sharp'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/rate-limit-redis', () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('192.168.1.1'),
}))

let POST: (req: Request) => Promise<Response>
let mockSupabase: any
let mockCheckRateLimit: any

beforeAll(async () => {
  mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn(),
        }),
      }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
      }),
    },
  }

  mockCheckRateLimit = vi.fn()

  const { createServerSupabaseClient } = await import('@/lib/supabase-server')
  const { checkRateLimit } = await import('@/lib/rate-limit-redis')

  vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase)
  vi.mocked(checkRateLimit).mockImplementation(mockCheckRateLimit)

  const module = await import('@/app/api/upload/image/route')
  POST = module.POST
})

async function createTestImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer()
}

function createMockRequest(body: FormData, headers: Record<string, string> = {}): Request {
  return {
    formData: async () => body,
    headers: new Map([
      ...Object.entries(headers),
      ['x-forwarded-for', '192.168.1.1'],
    ]) as any,
  } as Request
}

describe('POST /api/upload/image', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should reject unauthenticated requests', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
    })

    const body = new FormData()
    const image = await createTestImage(500, 500)
    body.append('file', new File([image], 'test.png', { type: 'image/png' }))

    const req = createMockRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toContain('autenticado')
  })

  it('should reject non-technician users', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
    })

    const profileQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValueOnce({
            data: { role: 'client' },
          }),
        }),
      }),
    }

    mockSupabase.from.mockReturnValueOnce(profileQuery)

    const body = new FormData()
    const image = await createTestImage(500, 500)
    body.append('file', new File([image], 'test.png', { type: 'image/png' }))

    const req = createMockRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain('técnicos')
  })

  it('should enforce rate limits per user', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'tech-123' } },
    })

    const profileQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValueOnce({
            data: { role: 'technician' },
          }),
        }),
      }),
    }

    mockSupabase.from.mockReturnValueOnce(profileQuery)

    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 3600000,
    })

    const body = new FormData()
    const image = await createTestImage(500, 500)
    body.append('file', new File([image], 'test.png', { type: 'image/png' }))

    const req = createMockRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(429)
    const data = await res.json()
    expect(data.error).toContain('Limite')
  })

  it('should reject files without file field', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'tech-123' } },
    })

    const profileQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValueOnce({
            data: { role: 'technician' },
          }),
        }),
      }),
    }

    mockSupabase.from.mockReturnValueOnce(profileQuery)

    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 49, resetAt: 0 })
      .mockResolvedValueOnce({ allowed: true, remaining: 199, resetAt: 0 })

    const body = new FormData()
    const req = createMockRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Arquivo')
  })

  it('should reject invalid MIME types', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'tech-123' } },
    })

    const profileQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValueOnce({
            data: { role: 'technician' },
          }),
        }),
      }),
    }

    mockSupabase.from.mockReturnValueOnce(profileQuery)

    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 49, resetAt: 0 })
      .mockResolvedValueOnce({ allowed: true, remaining: 199, resetAt: 0 })

    const body = new FormData()
    const fakeFile = new File(['not an image'], 'test.gif', { type: 'image/gif' })
    body.append('file', fakeFile)

    const req = createMockRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('não aceito')
  })

  it('should reject oversized files', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'tech-123' } },
    })

    const profileQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValueOnce({
            data: { role: 'technician' },
          }),
        }),
      }),
    }

    mockSupabase.from.mockReturnValueOnce(profileQuery)

    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 49, resetAt: 0 })
      .mockResolvedValueOnce({ allowed: true, remaining: 199, resetAt: 0 })

    const body = new FormData()
    const oversized = Buffer.alloc(11 * 1024 * 1024)
    const fakeFile = new File([oversized], 'test.png', { type: 'image/png' })
    body.append('file', fakeFile)

    const req = createMockRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(413)
    const data = await res.json()
    expect(data.error).toContain('grande')
  })
})
