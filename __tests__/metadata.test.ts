import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

// ── Mocks para imports dos page files ─────────────────────────────────────────

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('notFound') }),
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`) }),
}))

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/supabase-admin',  () => ({ createAdminClient: vi.fn()        }))

vi.mock('@/lib/services/profile', () => ({
  requireClientSession:      vi.fn(),
  requireTechnicianSession:  vi.fn(),
  requireLeaderSession:      vi.fn(),
}))

// Componentes React usados nas páginas — não precisam funcionar nos testes de metadata
vi.mock('@/components/layout/AdminShell',                               () => ({ default: () => null }))
vi.mock('@/app/dashboard/projetos/[id]/ProjectDetailClient',            () => ({ default: () => null }))
vi.mock('@/app/admin/clientes/[id]/ClienteDetalheClient',               () => ({ default: () => null }))

// ── Helpers ───────────────────────────────────────────────────────────────────

afterEach(() => vi.clearAllMocks())

// Build a thenable Supabase chain
function makeChain(data: unknown, error: unknown = null) {
  const resolve = { data, error }
  const ch: Record<string, unknown> = {}
  for (const m of ['from','select','eq','single','maybeSingle']) {
    ch[m] = () => ch
  }
  ch.single     = vi.fn().mockResolvedValue(resolve)
  ch.maybeSingle = vi.fn().mockResolvedValue(resolve)
  ch.then        = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
    Promise.resolve(resolve).then(f, r)
  return ch
}

function makeAdmin(data: unknown) {
  const chain = makeChain(data)
  return { from: vi.fn(() => chain) }
}

// Fake authenticated server client: .auth.getUser() resolves to `user`,
// and .from(table) resolves each call in `dataByTable` (keyed by table name)
// in the order .from() is invoked for that table — lets a test stub e.g.
// the `profiles` role lookup and a later `client_projects` lookup separately.
function makeServerClient(user: { id: string } | null, dataByTable: Record<string, unknown[]>) {
  const calls: Record<string, number> = {}
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      const idx = calls[table] ?? 0
      calls[table] = idx + 1
      const rows = dataByTable[table] ?? []
      return makeChain(rows[idx] ?? null)
    }),
  }
}

// ── Layout metadata — páginas públicas ───────────────────────────────────────

describe('sobre/layout', () => {
  it('tem title contendo "LOBBY"', async () => {
    const { metadata } = await import('@/app/sobre/layout')
    expect(String(metadata.title)).toContain('LOBBY')
  })

  it('tem openGraph definido', async () => {
    const { metadata } = await import('@/app/sobre/layout')
    expect(metadata.openGraph).toBeDefined()
  })

  it('não bloqueia indexação (sem robots noindex)', async () => {
    const { metadata } = await import('@/app/sobre/layout')
    expect(metadata.robots).toBeUndefined()
  })
})

describe('solucoes/layout', () => {
  it('tem title e openGraph', async () => {
    const { metadata } = await import('@/app/solucoes/layout')
    expect(String(metadata.title)).toContain('LOBBY')
    expect(metadata.openGraph).toBeDefined()
  })
})

describe('projetos/layout', () => {
  it('tem title e openGraph', async () => {
    const { metadata } = await import('@/app/projetos/layout')
    expect(String(metadata.title)).toContain('LOBBY')
    expect(metadata.openGraph).toBeDefined()
  })
})

describe('recursos/layout', () => {
  it('tem title e openGraph', async () => {
    const { metadata } = await import('@/app/recursos/layout')
    expect(String(metadata.title)).toContain('LOBBY')
    expect(metadata.openGraph).toBeDefined()
  })
})

// ── Layout metadata — áreas autenticadas (noindex) ────────────────────────────

describe('dashboard/layout', () => {
  it('tem title "Dashboard | LOBBY"', async () => {
    const { metadata } = await import('@/app/dashboard/layout')
    expect(String(metadata.title)).toBe('Dashboard | LOBBY')
  })

  it('tem robots noindex', async () => {
    const { metadata } = await import('@/app/dashboard/layout')
    const robots = metadata.robots as { index: boolean; follow: boolean } | undefined
    expect(robots?.index).toBe(false)
    expect(robots?.follow).toBe(false)
  })
})

describe('admin/layout', () => {
  it('tem title "Admin | LOBBY"', async () => {
    const { metadata } = await import('@/app/admin/layout')
    expect(String(metadata.title)).toBe('Admin | LOBBY')
  })

  it('tem robots noindex', async () => {
    const { metadata } = await import('@/app/admin/layout')
    const robots = metadata.robots as { index: boolean; follow: boolean } | undefined
    expect(robots?.index).toBe(false)
    expect(robots?.follow).toBe(false)
  })
})

// ── generateMetadata — dashboard/projetos/[id] ───────────────────────────────

describe('dashboard/projetos/[id] generateMetadata', () => {
  let generateMetadata: (args: { params: Promise<{ id: string }> }) => Promise<{ title?: string; robots?: unknown }>

  beforeAll(async () => {
    const mod = await import('@/app/dashboard/projetos/[id]/page')
    generateMetadata = mod.generateMetadata as typeof generateMetadata
  })

  it('retorna title com nome do projeto quando o dono está logado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeServerClient({ id: 'owner-1' }, { client_projects: [{ title: 'Site Institucional' }] }) as any // eslint-disable-line
    )

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'proj-1' }) })
    expect(meta.title).toBe('Site Institucional | LOBBY')
  })

  it('retorna title fallback quando projeto não encontrado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeServerClient({ id: 'owner-1' }, { client_projects: [null] }) as any // eslint-disable-line
    )

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'proj-999' }) })
    expect(meta.title).toBe('Projeto | LOBBY')
  })

  it('retorna title fallback (sem vazar) quando não há usuário autenticado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeServerClient(null, { client_projects: [{ title: 'Não Deveria Vazar' }] }) as any // eslint-disable-line
    )

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'proj-1' }) })
    expect(meta.title).toBe('Projeto | LOBBY')
  })

  it('sempre retorna robots noindex', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeServerClient({ id: 'owner-1' }, { client_projects: [{ title: 'Qualquer' }] }) as any // eslint-disable-line
    )

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'x' }) })
    const robots = meta.robots as { index: boolean; follow: boolean }
    expect(robots.index).toBe(false)
    expect(robots.follow).toBe(false)
  })
})

// ── generateMetadata — admin/clientes/[id] ───────────────────────────────────

describe('admin/clientes/[id] generateMetadata', () => {
  let generateMetadata: (args: { params: Promise<{ id: string }> }) => Promise<{ title?: string; robots?: unknown }>

  beforeAll(async () => {
    const mod = await import('@/app/admin/clientes/[id]/page')
    generateMetadata = mod.generateMetadata as typeof generateMetadata
  })

  // generateMetadata agora exige sessão de líder autenticado antes de consultar
  // o admin client — replica esse gate em cada teste via makeServerClient.
  const asLeader = () => makeServerClient({ id: 'leader-1' }, { profiles: [{ role: 'technician', is_leader: true }] })

  it('usa full_name quando disponível (líder autenticado)', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(asLeader() as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ full_name: 'Maria Souza', email: 'maria@test.com' }) as any // eslint-disable-line
    )

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'cli-1' }) })
    expect(meta.title).toBe('Maria Souza | LOBBY Admin')
  })

  it('usa email como fallback quando full_name é null', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(asLeader() as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ full_name: null, email: 'joao@empresa.com' }) as any // eslint-disable-line
    )

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'cli-2' }) })
    expect(meta.title).toBe('joao@empresa.com | LOBBY Admin')
  })

  it('usa "Cliente" quando ambos são null', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(asLeader() as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ full_name: null, email: null }) as any // eslint-disable-line
    )

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'cli-3' }) })
    expect(meta.title).toBe('Cliente | LOBBY Admin')
  })

  it('usa "Cliente" quando perfil não encontrado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(asLeader() as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin(null) as any) // eslint-disable-line

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'cli-999' }) })
    expect(meta.title).toBe('Cliente | LOBBY Admin')
  })

  it('não vaza nome/e-mail do cliente quando não há usuário autenticado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeServerClient(null, {}) as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ full_name: 'Não Deveria Vazar', email: 'vaza@test.com' }) as any // eslint-disable-line
    )

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'cli-1' }) })
    expect(meta.title).toBe('Cliente | LOBBY Admin')
  })

  it('não vaza nome/e-mail do cliente quando o usuário logado não é líder', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeServerClient({ id: 'tech-1' }, { profiles: [{ role: 'technician', is_leader: false }] }) as any // eslint-disable-line
    )
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ full_name: 'Não Deveria Vazar', email: 'vaza@test.com' }) as any // eslint-disable-line
    )

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'cli-1' }) })
    expect(meta.title).toBe('Cliente | LOBBY Admin')
  })

  it('sempre retorna robots noindex', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { createAdminClient } = await import('@/lib/supabase-admin')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(asLeader() as any) // eslint-disable-line
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({ full_name: 'X' }) as any) // eslint-disable-line

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'x' }) })
    const robots = meta.robots as { index: boolean; follow: boolean }
    expect(robots.index).toBe(false)
    expect(robots.follow).toBe(false)
  })
})
