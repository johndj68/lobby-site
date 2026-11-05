import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/services/app-publish', () => ({
  checkPublishEligibility: vi.fn(),
  isAllowedImageUrl: vi.fn(() => true),
  logAppAdminEvent: vi.fn(),
  slugify: vi.fn((name: string) => name.toLowerCase()),
}))

type QueryResult = { data: unknown; error: null }

function chain(result: QueryResult) {
  const obj: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'update', 'insert', 'order', 'limit']) {
    obj[method] = vi.fn(() => obj)
  }
  obj.single = vi.fn(async () => result)
  obj.maybeSingle = vi.fn(async () => result)
  return obj
}

let POST: (req: Request, ctx: { params: Promise<{ draftId: string }> }) => Promise<Response>
let fromMock: ReturnType<typeof vi.fn>
let checkPublishEligibilityMock: ReturnType<typeof vi.fn>

const DRAFT_ID = 'draft-attacker-1'
const VICTIM_APPLICATION_ID = 'app-victim-1'
const VICTIM_DRAFT_ID = 'draft-victim-1'

beforeAll(async () => {
  const { createServerSupabaseClient } = await import('@/lib/supabase-server')
  const { checkPublishEligibility } = await import('@/lib/services/app-publish')
  checkPublishEligibilityMock = vi.mocked(checkPublishEligibility)

  fromMock = vi.fn()
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
    from: fromMock,
  } as never)

  const routeModule = await import('@/app/api/admin/apps/[draftId]/publish/route')
  POST = routeModule.POST as never
})

afterEach(() => {
  fromMock.mockReset()
  checkPublishEligibilityMock.mockReset()
})

function createRequest(): Request {
  return {} as Request
}

describe('POST /api/admin/apps/[draftId]/publish — conflito de application_id', () => {
  it('recusa publicar quando o application_id do draft já pertence a outro rascunho', async () => {
    const queue: Record<string, ReturnType<typeof chain>[]> = {
      profiles: [chain({ data: { role: 'technician' }, error: null })],
      app_drafts: [
        // 1) carrega o draft do atacante, já com application_id setado
        // direto via PATCH pra apontar pro app da vítima
        chain({
          data: {
            id: DRAFT_ID,
            name: 'App do atacante',
            status: 'draft',
            created_by: 'attacker-1',
            application_id: VICTIM_APPLICATION_ID,
            short_description: null,
            full_description: null,
            logo_url: null,
            category: null,
            category_id: null,
            media_gallery: [],
          },
          error: null,
        }),
        // 2) checagem de conflito: existe outro draft com esse mesmo
        // application_id — é o draft real da vítima
        chain({ data: { id: VICTIM_DRAFT_ID }, error: null }),
      ],
      applications: [
        chain({ data: { is_published: false, suspended_at: null }, error: null }),
      ],
    }
    fromMock.mockImplementation((table: string) => {
      const next = queue[table]?.shift()
      if (!next) throw new Error(`unexpected supabase.from('${table}') call`)
      return next
    })

    const res = await POST(createRequest(), { params: Promise.resolve({ draftId: DRAFT_ID }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('vinculado a outro rascunho')

    // A publicação nunca deve ter avançado além da checagem de conflito.
    expect(checkPublishEligibilityMock).not.toHaveBeenCalled()
    expect(queue.applications).toHaveLength(0)
    expect(queue.app_drafts).toHaveLength(0)
  })

  it('permite seguir quando application_id é null (primeira publicação)', async () => {
    checkPublishEligibilityMock.mockResolvedValue({ ok: false, error: 'checklist incompleto' })

    const queue: Record<string, ReturnType<typeof chain>[]> = {
      profiles: [chain({ data: { role: 'technician' }, error: null })],
      app_drafts: [
        chain({
          data: {
            id: DRAFT_ID,
            name: 'App novo',
            status: 'draft',
            created_by: 'vendor-1',
            application_id: null,
            short_description: null,
            full_description: null,
            logo_url: null,
            category: null,
            category_id: null,
            media_gallery: [],
          },
          error: null,
        }),
      ],
    }
    fromMock.mockImplementation((table: string) => {
      const next = queue[table]?.shift()
      if (!next) throw new Error(`unexpected supabase.from('${table}') call`)
      return next
    })

    const res = await POST(createRequest(), { params: Promise.resolve({ draftId: DRAFT_ID }) })

    // Sem application_id prévio não há conflito possível — a rota segue
    // até a checagem de elegibilidade normal (que aqui recusamos de
    // propósito só pra provar que passamos pelo bloco de conflito).
    expect(checkPublishEligibilityMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(400)
  })
})
