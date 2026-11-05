import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
let mockSupabase: {
  auth: { getUser: ReturnType<typeof vi.fn> }
  from: ReturnType<typeof vi.fn>
}
let capturedUpdatePayload: Record<string, unknown> | null

function createMockRequest(body: unknown): Request {
  return { json: async () => body } as Request
}

beforeAll(async () => {
  const { createServerSupabaseClient } = await import('@/lib/supabase-server')

  mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  }
  vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase as never)

  const routeModule = await import('@/app/api/apps/drafts/[id]/route')
  PATCH = routeModule.PATCH as never
})

afterEach(() => {
  vi.clearAllMocks()
  capturedUpdatePayload = null
})

function wireUpdateCapture() {
  mockSupabase.from.mockReturnValue({
    update: vi.fn((payload: Record<string, unknown>) => {
      capturedUpdatePayload = payload
      return {
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'draft-1', ...payload }, error: null }),
      }
    }),
  })
}

describe('PATCH /api/apps/drafts/[id] — allowlist de campos', () => {
  it('descarta status e application_id vindos do body, mesmo entre campos válidos', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'vendor-1' } } })
    wireUpdateCapture()

    const req = createMockRequest({
      name: 'Meu App',
      short_description: 'Descrição legítima',
      status: 'published',
      application_id: 'app-de-outro-parceiro',
      created_by: 'outro-usuario',
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'draft-1' }) })

    expect(res.status).toBe(200)
    expect(capturedUpdatePayload).not.toBeNull()
    expect(capturedUpdatePayload).toMatchObject({
      name: 'Meu App',
      short_description: 'Descrição legítima',
    })
    expect(capturedUpdatePayload).not.toHaveProperty('status')
    expect(capturedUpdatePayload).not.toHaveProperty('application_id')
    expect(capturedUpdatePayload).not.toHaveProperty('created_by')
  })

  it('aceita todos os campos reais do editor (DraftFormData)', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'vendor-1' } } })
    wireUpdateCapture()

    const editorPayload = {
      name: 'App',
      category_id: 'cat-1',
      category: 'Automação',
      short_description: 'curta',
      full_description: 'longa',
      target_audience: 'PMEs',
      website_url: 'https://example.com',
      video_url: null,
      logo_url: null,
      media_gallery: [{ url: 'https://x/img.png' }],
      benefits: [{ title: 'rápido' }],
      features: [{ name: 'f1' }],
      integrations: [{ name: 'i1' }],
      history: [{ title: 'h1', description: 'd1' }],
      trust_signals: [{ title: 't1' }],
      faq: [{ question: 'q', answer: 'a' }],
    }

    const req = createMockRequest(editorPayload)
    const res = await PATCH(req, { params: Promise.resolve({ id: 'draft-1' }) })

    expect(res.status).toBe(200)
    for (const key of Object.keys(editorPayload)) {
      expect(capturedUpdatePayload).toHaveProperty(key)
    }
  })

  it('rejeita requisição sem sessão', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } })

    const req = createMockRequest({ name: 'x' })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'draft-1' }) })

    expect(res.status).toBe(401)
  })
})
