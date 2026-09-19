import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

// ── Mock external deps before module load ─────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  sendEmail:             vi.fn().mockResolvedValue(undefined),
  sendWhatsApp:          vi.fn().mockResolvedValue(undefined),
  buildMessageEmailHtml: vi.fn().mockReturnValue('<html>update</html>'),
}))

// ── Lazy-import after env + mocks are ready ───────────────────────────────────

let POST: (req: Request) => Promise<Response>

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SITE_URL        = 'http://localhost:3000'
  process.env.NEXT_PUBLIC_SUPABASE_URL    = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  const mod = await import('@/app/api/notify/project/route')
  POST = mod.POST as unknown as (req: Request) => Promise<Response>
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeReq = (body: Record<string, unknown> = {}) =>
  new Request('http://localhost/api/notify/project', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

// app_metadata não importa mais pra autorização (ver fix abaixo) — o objeto
// user só precisa do id, que é o que a rota usa pra reconsultar profiles.
const makeUser = () => ({ id: 'tech-001', app_metadata: {} })

// Build server-side supabase mock with configurable auth.getUser() result.
const makeServerSupa = (user: unknown) => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
  },
})

// Build admin client mock that returns a project row by default.
// lead_technician_id: 'tech-001' by default — matches makeUser()'s id, so
// the "caller is the project's lead technician" branch passes without an
// extra is_leader lookup. Override to test the is_leader fallback / 403 path.
//
// `callerProfile` answers the FIRST `profiles` query the route makes (the
// fresh role/is_leader check, now always done — never trusts the JWT
// claim). `clientNotifyProfile` answers any LATER `profiles` query
// (notifyProjectUpdate fetching the target client's contact info).
const makeAdminClient = (
  projectData: unknown = {
    id:                 'proj-123',
    title:              'Site Institucional',
    client_id:          'client-001',
    client_progress:    null,
    status:             'em_progresso',
    lead_technician_id: 'tech-001',
  },
  callerProfile: unknown = { role: 'technician', is_leader: false },
  clientNotifyProfile: unknown = null,
) => {
  let profilesCallCount = 0
  return {
    from: vi.fn((table: string) => {
      if (table === 'client_projects') {
        const chain = {
          select: () => chain,
          eq:     () => chain,
          single: vi.fn().mockResolvedValue(
            projectData ? { data: projectData, error: null }
                        : { data: null, error: { message: 'not found' } }
          ),
        }
        return chain
      }
      // profiles table: 1ª chamada = checagem de role/is_leader do caller;
      // chamadas seguintes = notifyProjectUpdate buscando o perfil do cliente.
      profilesCallCount++
      const data = profilesCallCount === 1 ? callerProfile : clientNotifyProfile
      const chain = {
        select: () => chain,
        eq:     () => chain,
        single: vi.fn().mockResolvedValue({ data, error: null }),
      }
      return chain
    }),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/notify/project', () => {

  it('retorna 401 quando não há sessão autenticada', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(null) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const res  = await POST(makeReq({ project_id: 'proj-123' }))
    expect(res.status).toBe(401)
  })

  it('retorna 403 quando profiles.role não é "technician" (reconsulta fresca, não confia no JWT)', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(makeUser()) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(undefined, { role: 'client', is_leader: false }) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ project_id: 'proj-123' }))
    expect(res.status).toBe(403)
  })

  it('retorna 403 quando profiles não tem linha pro caller', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(makeUser()) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(undefined, null) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ project_id: 'proj-123' }))
    expect(res.status).toBe(403)
  })

  it('reconsulta profiles.role a cada chamada — não confia em app_metadata do JWT (DAST T37)', async () => {
    // Regressão do achado DAST: um técnico rebaixado continuava passando no
    // check antigo (que lia user.app_metadata.role do token) até o token
    // expirar/renovar. A rota agora reconsulta profiles a cada chamada.
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    // Token velho ainda carregaria role=technician no claim — mas a linha
    // ATUAL em profiles já foi rebaixada pra client.
    const staleUser = { id: 'tech-001', app_metadata: { role: 'technician' } }
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(staleUser) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(undefined, { role: 'client', is_leader: false }) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ project_id: 'proj-123' }))
    expect(res.status).toBe(403)
  })

  it('retorna 400 quando project_id ausente no body', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(makeUser()) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient() as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('retorna 404 quando projeto não existe', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(makeUser()) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(null) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ project_id: 'proj-999' }))
    expect(res.status).toBe(404)
  })

  it('retorna 403 quando técnico não é o líder do projeto nem é líder', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(makeUser()) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    // projeto liderado por outro técnico; caller (tech-001) não é líder
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(
      { id: 'proj-123', title: 'X', client_id: 'client-001', client_progress: null, status: 'em_progresso', lead_technician_id: 'other-tech' },
      { role: 'technician', is_leader: false },
    ) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ project_id: 'proj-123' }))
    expect(res.status).toBe(403)
  })

  it('retorna 200 quando técnico é líder mas não é o técnico responsável pelo projeto', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(makeUser()) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(
      { id: 'proj-123', title: 'X', client_id: 'client-001', client_progress: null, status: 'em_progresso', lead_technician_id: 'other-tech' },
      { role: 'technician', is_leader: true },
    ) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ project_id: 'proj-123' }))
    expect(res.status).toBe(200)
  })

  it('retorna 200 quando técnico autenticado e projeto existe', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(makeUser()) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient() as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const res  = await POST(makeReq({ project_id: 'proj-123' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('dispara notificação por e-mail quando cliente tem e-mail', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    const { sendEmail }                  = await import('@/lib/notifications')

    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(makeUser()) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(
      undefined,
      { role: 'technician', is_leader: false },
      { full_name: 'Maria', email: 'maria@test.com', phone: null, notification_prefs: {} },
    ) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    await POST(makeReq({ project_id: 'proj-123' }))
    // fire-and-forget — allow micro-tasks to flush
    await new Promise<void>(r => setTimeout(r, 0))
    expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce()
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe('maria@test.com')
  })

  it('não envia e-mail quando cliente tem notification_prefs.projectUpdates = false', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient }          = await import('@/lib/supabase-admin')
    const { sendEmail }                  = await import('@/lib/notifications')

    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerSupa(makeUser()) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(
      undefined,
      { role: 'technician', is_leader: false },
      { full_name: 'Ana', email: 'ana@test.com', phone: null, notification_prefs: { projectUpdates: false } },
    ) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    await POST(makeReq({ project_id: 'proj-123' }))
    await new Promise<void>(r => setTimeout(r, 0))
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
  })

})
