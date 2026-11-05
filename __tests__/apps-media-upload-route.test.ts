import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

interface MockSupabase {
  auth: { getUser: ReturnType<typeof vi.fn> }
  from: ReturnType<typeof vi.fn>
  storage: { from: ReturnType<typeof vi.fn> }
}

let POST: (req: Request) => Promise<Response>
let mockSupabase: MockSupabase

beforeAll(async () => {
  mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn(),
          }),
        }),
      }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'app-1/x.png' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/app-1/x.png' } }),
      }),
    },
  }

  const { createServerSupabaseClient } = await import('@/lib/supabase-server')
  vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase as never)

  const routeModule = await import('@/app/api/apps/media/upload/route')
  POST = routeModule.POST
})

afterEach(() => {
  vi.clearAllMocks()
})

function createMockRequest(body: FormData): Request {
  return { formData: async () => body } as Request
}

function mockDraftLookup(data: { id: string } | null) {
  mockSupabase.from.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error: data ? null : { message: 'not found' } }),
        }),
      }),
    }),
  })
}

describe('POST /api/apps/media/upload', () => {
  it('rejects unauthenticated requests', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } })

    const body = new FormData()
    body.append('file', new File(['x'], 'logo.png', { type: 'image/png' }))
    body.append('appId', 'app-1')

    const res = await POST(createMockRequest(body))
    expect(res.status).toBe(401)
  })

  it('rejects uploading into an appId the user does not own (regressão: faltava checagem em nível de app)', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'vendor-1' } } })
    mockDraftLookup(null) // draft não encontrado pra este created_by

    const body = new FormData()
    body.append('file', new File(['x'], 'logo.png', { type: 'image/png' }))
    body.append('appId', 'app-de-outro-parceiro')

    const res = await POST(createMockRequest(body))
    expect(res.status).toBe(403)
  })

  it('rejects invalid MIME types', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'vendor-1' } } })
    mockDraftLookup({ id: 'app-1' })

    const body = new FormData()
    body.append('file', new File(['<script>evil</script>'], 'logo.svg', { type: 'image/svg+xml' }))
    body.append('appId', 'app-1')

    const res = await POST(createMockRequest(body))
    expect(res.status).toBe(400)
  })

  it('rejects oversized files before touching storage', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'vendor-1' } } })
    mockDraftLookup({ id: 'app-1' })

    const body = new FormData()
    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    body.append('file', oversized)
    body.append('appId', 'app-1')

    const res = await POST(createMockRequest(body))
    expect(res.status).toBe(400)
    expect(mockSupabase.storage.from).not.toHaveBeenCalled()
  })

  it('uploads successfully for the draft owner with a valid image', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'vendor-1' } } })
    mockDraftLookup({ id: 'app-1' })

    const body = new FormData()
    body.append('file', new File(['x'], 'logo.png', { type: 'image/png' }))
    body.append('appId', 'app-1')

    const res = await POST(createMockRequest(body))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.url).toBe('https://cdn.example.com/app-1/x.png')
  })
})
