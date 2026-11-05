import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

type QueryResult = { data: unknown; error: null }

function chain(result: QueryResult) {
  const obj: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'limit', 'insert']) {
    obj[method] = vi.fn(() => obj)
  }
  obj.single = vi.fn(async () => result)
  // Real supabase-js query builders are themselves thenable (`await`-able
  // without calling `.single()`) — the route relies on that for the
  // `.order().limit(1)` duplicate-invite lookup, which never calls
  // `.single()`.
  obj.then = (resolve: (value: QueryResult) => void) => Promise.resolve(result).then(resolve)
  return obj
}

let POST: (req: Request, ctx: { params: Promise<{ appId: string }> }) => Promise<Response>
let fromMock: ReturnType<typeof vi.fn>
// This test exists specifically to catch a regression of the bug fixed
// here: the route used to call `supabase.auth.admin.listUsers()` on the
// session-bound (anon-key) client, which always throws because that API
// requires the service-role key — every invitation attempt returned a
// bare 500. `adminListUsersSpy` proves that call path is gone for good.
let adminListUsersSpy: ReturnType<typeof vi.fn>

function createMockRequest(body: unknown): Request {
  return { json: async () => body } as Request
}

beforeAll(async () => {
  const { createServerSupabaseClient } = await import('@/lib/supabase-server')

  adminListUsersSpy = vi.fn().mockRejectedValue(
    new Error('User not allowed (requires service_role key)')
  )
  fromMock = vi.fn()

  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'vendor-1', email: 'dono@example.com' } },
      }),
      admin: { listUsers: adminListUsersSpy },
    },
    from: fromMock,
  } as never)

  const routeModule = await import('@/app/api/apps/team/[appId]/invite/route')
  POST = routeModule.POST as never
})

afterEach(() => {
  fromMock.mockReset()
})

describe('POST /api/apps/team/[appId]/invite', () => {
  it('creates an invitation without ever calling auth.admin.listUsers()', async () => {
    const queue: Record<string, ReturnType<typeof chain>[]> = {
      app_drafts: [chain({ data: { id: 'app-1', name: 'App Teste' }, error: null })],
      app_team_invitations: [
        // "already invited or member?" lookup -> none
        chain({ data: [], error: null }),
        // insert new invitation
        chain({
          data: {
            id: 'inv-1',
            invited_email: 'colega@example.com',
            status: 'pending',
            permissions: ['edit'],
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

    const req = createMockRequest({
      invited_email: 'colega@example.com',
      invited_name: 'Colega',
      permissions: ['edit'],
      scope: 'app',
    })

    const res = await POST(req, { params: Promise.resolve({ appId: 'app-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invitation.email).toBe('colega@example.com')
    expect(adminListUsersSpy).not.toHaveBeenCalled()
  })

  it('rejects a duplicate invite to someone already pending/accepted', async () => {
    const queue: Record<string, ReturnType<typeof chain>[]> = {
      app_drafts: [chain({ data: { id: 'app-1', name: 'App Teste' }, error: null })],
      app_team_invitations: [
        chain({ data: [{ id: 'inv-old', status: 'accepted' }], error: null }),
      ],
    }
    fromMock.mockImplementation((table: string) => {
      const next = queue[table]?.shift()
      if (!next) throw new Error(`unexpected supabase.from('${table}') call`)
      return next
    })

    const req = createMockRequest({
      invited_email: 'ja-membro@example.com',
      invited_name: 'Já Membro',
      permissions: ['edit'],
      scope: 'app',
    })

    const res = await POST(req, { params: Promise.resolve({ appId: 'app-1' }) })

    expect(res.status).toBe(400)
    expect(adminListUsersSpy).not.toHaveBeenCalled()
  })
})
