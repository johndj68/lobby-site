import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/services/app-publish', () => ({
  checkPublishEligibility: vi.fn(),
  isAllowedImageUrl: vi.fn(() => true),
  logAppAdminEvent: vi.fn(),
  slugify: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
}))

type QueryResult = { data: unknown; error: null }

function chain(result: QueryResult) {
  const obj: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'update', 'insert', 'order', 'limit']) {
    obj[method] = vi.fn(() => obj)
  }
  obj.single = vi.fn(async () => result)
  obj.maybeSingle = vi.fn(async () => result)
  return obj
}

let POST: (req: Request, ctx: { params: Promise<{ draftId: string }> }) => Promise<Response>
let fromMock: ReturnType<typeof vi.fn>
let rpcMock: ReturnType<typeof vi.fn>
let checkPublishEligibilityMock: ReturnType<typeof vi.fn>
let logAppAdminEventMock: ReturnType<typeof vi.fn>

const DRAFT_ID = 'draft-1'

function createRequest(): Request {
  return {} as Request
}

function baseDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    name: 'Meu App',
    status: 'under_review',
    created_by: 'vendor-1',
    application_id: null,
    short_description: 'curta',
    full_description: 'longa',
    logo_url: null,
    category: 'Automação',
    category_id: 'cat-1',
    media_gallery: [],
    ...overrides,
  }
}

function wireQueue(queue: Record<string, ReturnType<typeof chain>[]>) {
  fromMock.mockImplementation((table: string) => {
    const next = queue[table]?.shift()
    if (!next) throw new Error(`unexpected supabase.from('${table}') call`)
    return next
  })
}

beforeAll(async () => {
  const { createServerSupabaseClient } = await import('@/lib/supabase-server')
  const { checkPublishEligibility, logAppAdminEvent } = await import('@/lib/services/app-publish')
  checkPublishEligibilityMock = vi.mocked(checkPublishEligibility)
  logAppAdminEventMock = vi.mocked(logAppAdminEvent)

  fromMock = vi.fn()
  rpcMock = vi.fn()
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
    from: fromMock,
    rpc: rpcMock,
  } as never)

  const routeModule = await import('@/app/api/admin/apps/[draftId]/publish/route')
  POST = routeModule.POST as never
})

afterEach(() => {
  fromMock.mockReset()
  rpcMock.mockReset()
  checkPublishEligibilityMock.mockReset()
  logAppAdminEventMock.mockReset()
})

describe('POST /api/admin/apps/[draftId]/publish — escrita atômica via RPC', () => {
  it('primeira publicação: resolve slug, chama a RPC com application_id null e usa o id retornado', async () => {
    checkPublishEligibilityMock.mockResolvedValue({
      ok: true,
      latestSubmission: { id: 'sub-1' },
      plans: [{ price: 99, currency: 'BRL', billing_period: 'monthly' }],
    })
    rpcMock.mockResolvedValue({ data: { application_id: 'app-novo-1' }, error: null })

    wireQueue({
      profiles: [
        chain({ data: { role: 'technician' }, error: null }),
        chain({ data: { full_name: 'Dono do App', company_name: null }, error: null }),
      ],
      app_drafts: [chain({ data: baseDraft(), error: null })],
      applications: [chain({ data: null, error: null })], // uniqueSlug: slug livre de primeira
      app_submissions: [chain({ data: { id: 'sub-1' }, error: null })],
    })

    const res = await POST(createRequest(), { params: Promise.resolve({ draftId: DRAFT_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applicationId).toBe('app-novo-1')

    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [fnName, params] = rpcMock.mock.calls[0]
    expect(fnName).toBe('publish_app_draft')
    expect(params).toMatchObject({
      p_draft_id: DRAFT_ID,
      p_expected_status: 'under_review',
      p_application_id: null,
      p_name: 'Meu App',
    })
    expect(params.p_slug).toBeTruthy()
    expect(logAppAdminEventMock).toHaveBeenCalledTimes(1)
  })

  it('republicação (application_id já existe): não gera slug novo e repassa o application_id existente', async () => {
    checkPublishEligibilityMock.mockResolvedValue({
      ok: true,
      latestSubmission: { id: 'sub-2' },
      plans: [],
    })
    rpcMock.mockResolvedValue({ data: { application_id: 'app-existente-1' }, error: null })

    wireQueue({
      profiles: [
        chain({ data: { role: 'technician' }, error: null }),
        chain({ data: { full_name: 'Dono do App', company_name: null }, error: null }),
      ],
      app_drafts: [
        chain({ data: baseDraft({ application_id: 'app-existente-1' }), error: null }),
        // checagem de conflito: nenhum outro draft reivindica esse application_id
        chain({ data: null, error: null }),
      ],
      applications: [chain({ data: { is_published: false, suspended_at: null }, error: null })],
      app_submissions: [chain({ data: { id: 'sub-2' }, error: null })],
    })

    const res = await POST(createRequest(), { params: Promise.resolve({ draftId: DRAFT_ID }) })

    expect(res.status).toBe(200)
    const [, params] = rpcMock.mock.calls[0]
    expect(params.p_application_id).toBe('app-existente-1')
    expect(params.p_slug).toBeNull()
    // uniqueSlug não deveria ter sido chamado — só sobrou a 1 chamada de
    // 'applications' já consumida na checagem de suspenso/publicado acima.
  })

  it('RPC estoura (conflito de application_id detectado dentro da transação): devolve 409 e não segue pra app_submissions/logAppAdminEvent', async () => {
    checkPublishEligibilityMock.mockResolvedValue({
      ok: true,
      latestSubmission: { id: 'sub-3' },
      plans: [],
    })
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Este aplicativo já está vinculado a outro rascunho.' },
    })

    wireQueue({
      profiles: [
        chain({ data: { role: 'technician' }, error: null }),
        chain({ data: { full_name: 'Dono do App', company_name: null }, error: null }),
      ],
      app_drafts: [
        chain({ data: baseDraft({ application_id: 'app-disputado-1' }), error: null }),
        chain({ data: null, error: null }), // checagem rápida não achou conflito (corrida acontece só na RPC)
      ],
      applications: [chain({ data: { is_published: false, suspended_at: null }, error: null })],
    })

    const res = await POST(createRequest(), { params: Promise.resolve({ draftId: DRAFT_ID }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('vinculado a outro rascunho')
    expect(logAppAdminEventMock).not.toHaveBeenCalled()
  })

  it('RPC estoura por corrida de status otimista: devolve 409 com mensagem de reload', async () => {
    checkPublishEligibilityMock.mockResolvedValue({
      ok: true,
      latestSubmission: { id: 'sub-4' },
      plans: [],
    })
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Não foi possível publicar agora — o status pode ter mudado em outra sessão. Recarregue e tente novamente.' },
    })

    wireQueue({
      profiles: [
        chain({ data: { role: 'technician' }, error: null }),
        chain({ data: { full_name: 'Dono do App', company_name: null }, error: null }),
      ],
      app_drafts: [chain({ data: baseDraft(), error: null })],
      applications: [chain({ data: null, error: null })],
    })

    const res = await POST(createRequest(), { params: Promise.resolve({ draftId: DRAFT_ID }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('Recarregue')
    expect(logAppAdminEventMock).not.toHaveBeenCalled()
  })
})
