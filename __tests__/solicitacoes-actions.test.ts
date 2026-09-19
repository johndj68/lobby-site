import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/resend', () => ({
  getResendClient: vi.fn(() => ({
    resend: { emails: { send: vi.fn().mockResolvedValue({ data: null, error: null }) } },
    from: 'noreply@test.com',
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ── Lazy import ───────────────────────────────────────────────────────────────

type ActionResult = { success: true } | { success: false; error: string }

let sendContactResponse: (input: ResponseInput) => Promise<ActionResult>
let startAnalysis:        (input: StartInput)    => Promise<ActionResult>
let saveContactDraft:     (input: ResponseInput) => Promise<ActionResult>
let deleteContact:        (id: string)           => Promise<ActionResult>

interface ResponseInput { contactId: string; subject: string; message: string; draftId?: string }
interface StartInput    { contactId: string; note: string; priority: string }

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL      = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon'
  process.env.NEXT_PUBLIC_SITE_URL          = 'http://localhost:3000'
  const mod = await import('@/app/admin/solicitacoes/actions')
  sendContactResponse = mod.sendContactResponse as unknown as typeof sendContactResponse
  startAnalysis       = mod.startAnalysis       as unknown as typeof startAnalysis
  saveContactDraft    = mod.saveContactDraft    as unknown as typeof saveContactDraft
  deleteContact       = mod.deleteContact       as unknown as typeof deleteContact
})

afterEach(() => vi.clearAllMocks())

// ── Chain helper ──────────────────────────────────────────────────────────────

function makeChain(data: unknown, error: unknown = null) {
  const resolve = { data, error }
  const ch: Record<string, unknown> = {}
  for (const m of ['select','eq','neq','update','delete','insert','upsert','order','limit','filter','is','in','or']) {
    ch[m] = vi.fn(() => ch)
  }
  ch.single = vi.fn().mockResolvedValue(resolve)
  ch.then    = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
    Promise.resolve(resolve).then(f, r)
  ch.catch = () => Promise.resolve(resolve)
  return ch
}

// Build a mock supabase that dispatches to per-table chains
function makeSupabase({
  profile   = { role: 'technician', is_leader: true }  as unknown,
  contact   = { email: 'cli@test.com', name: 'Maria', status: 'arquivado' } as unknown,
  writeError = null as unknown,
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'tech-1' } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles')         return makeChain(profile)
      if (table === 'contacts')         return makeChain(contact, writeError)
      return makeChain(null) // contact_responses, contact_activity — write-only
    }),
  }
}

// ── sendContactResponse ───────────────────────────────────────────────────────

describe('sendContactResponse', () => {
  const baseInput: ResponseInput = {
    contactId: 'cont-1',
    subject:   'Re: Projeto',
    message:   'Olá Maria, segue o retorno.',
  }

  it('retorna erro quando usuário não está autenticado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supa = makeSupabase()
    supa.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null })
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supa as any) // eslint-disable-line

    const result = await sendContactResponse(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/autenticado/i)
  })

  it('retorna erro quando usuário não é técnico', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ profile: { role: 'client' } }) as any // eslint-disable-line
    )

    const result = await sendContactResponse(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/técnico/i)
  })

  it('retorna erro quando subject está vazio', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as any) // eslint-disable-line

    const result = await sendContactResponse({ ...baseInput, subject: '   ' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/assunto e mensagem/i)
  })

  it('retorna erro quando message está vazia', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as any) // eslint-disable-line

    const result = await sendContactResponse({ ...baseInput, message: '' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/assunto e mensagem/i)
  })

  it('retorna erro quando contato não é encontrado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ contact: null }) as any // eslint-disable-line
    )

    const result = await sendContactResponse(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/não encontrada/i)
  })

  it('retorna erro quando Resend falha no envio', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const { getResendClient }            = await import('@/lib/resend')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as any) // eslint-disable-line
    vi.mocked(getResendClient).mockReturnValueOnce({
      resend: { emails: { send: vi.fn().mockResolvedValue({ data: null, error: { message: 'rate limited' } }) } },
      from: 'noreply@test.com',
    } as any) // eslint-disable-line

    const result = await sendContactResponse(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Erro ao enviar e-mail/i)
  })

  it('retorna { success: true } no caminho feliz', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as any) // eslint-disable-line

    const result = await sendContactResponse(baseInput)

    expect(result.success).toBe(true)
  })

  it('usa update em vez de insert quando draftId é fornecido', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supa = makeSupabase()
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supa as any) // eslint-disable-line

    await sendContactResponse({ ...baseInput, draftId: 'draft-1' })

    // contact_responses table should receive an update call
    const calls = (supa.from as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0])
    expect(calls).toContain('contact_responses')
  })
})

// ── startAnalysis ─────────────────────────────────────────────────────────────

describe('startAnalysis', () => {
  const baseInput: StartInput = {
    contactId: 'cont-2',
    note:      'Aguardando documentação.',
    priority:  'alta',
  }

  it('retorna erro quando não autenticado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const supa = makeSupabase()
    supa.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null })
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supa as any) // eslint-disable-line

    const result = await startAnalysis(baseInput)

    expect(result.success).toBe(false)
  })

  it('retorna { success: true } para técnico autenticado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as any) // eslint-disable-line

    const result = await startAnalysis(baseInput)

    expect(result.success).toBe(true)
  })

  it('retorna erro quando update no banco falha', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ writeError: { message: 'db error' } }) as any // eslint-disable-line
    )

    const result = await startAnalysis(baseInput)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Erro ao iniciar análise/i)
  })
})

// ── saveContactDraft ──────────────────────────────────────────────────────────

describe('saveContactDraft', () => {
  it('retorna erro quando subject e message estão vazios', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as any) // eslint-disable-line

    const result = await saveContactDraft({ contactId: 'c1', subject: '', message: '' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Nada para salvar/i)
  })

  it('retorna { success: true } com apenas subject preenchido', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as any) // eslint-disable-line

    const result = await saveContactDraft({ contactId: 'c1', subject: 'Re:', message: '' })

    expect(result.success).toBe(true)
  })
})

// ── deleteContact ─────────────────────────────────────────────────────────────

describe('deleteContact', () => {
  it('retorna erro quando usuário não é líder', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ profile: { role: 'technician', is_leader: false } }) as any // eslint-disable-line
    )

    const result = await deleteContact('cont-1')

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/técnicos líderes/i)
  })

  it('retorna erro quando contato não tem status "arquivado"', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ contact: { status: 'pendente' } }) as any // eslint-disable-line
    )

    const result = await deleteContact('cont-1')

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/arquivad/i)
  })

  it('retorna { success: true } quando líder exclui contato arquivado', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as any) // eslint-disable-line

    const result = await deleteContact('cont-1')

    expect(result.success).toBe(true)
  })
})
