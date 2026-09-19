import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildMessageEmailHtml, buildCreditReceiptEmailHtml, sendEmail, sendWhatsApp } from '@/lib/notifications'

// ── buildMessageEmailHtml ─────────────────────────────────────────────────────

describe('buildMessageEmailHtml', () => {
  const base = {
    recipientName:  'João',
    senderLabel:    'Equipe LOBBY',
    messagePreview: 'Olá, temos uma atualização.',
    ctaUrl:         'https://lobby.com/dashboard',
    ctaLabel:       'Ver no dashboard',
  }

  it('retorna string HTML válida', () => {
    const html = buildMessageEmailHtml(base)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })

  it('inclui recipientName no corpo', () => {
    const html = buildMessageEmailHtml(base)
    expect(html).toContain('João')
  })

  it('inclui senderLabel no cabeçalho', () => {
    const html = buildMessageEmailHtml(base)
    expect(html).toContain('Equipe LOBBY')
  })

  it('inclui messagePreview no corpo', () => {
    const html = buildMessageEmailHtml(base)
    expect(html).toContain('Olá, temos uma atualização.')
  })

  it('inclui ctaUrl e ctaLabel no botão', () => {
    const html = buildMessageEmailHtml(base)
    expect(html).toContain('https://lobby.com/dashboard')
    expect(html).toContain('Ver no dashboard')
  })

  it('trunca preview com mais de 280 caracteres', () => {
    const long = 'A'.repeat(300)
    const html = buildMessageEmailHtml({ ...base, messagePreview: long })
    expect(html).toContain('A'.repeat(280) + '…')
    expect(html).not.toContain('A'.repeat(281))
  })

  it('não trunca preview com exatamente 280 caracteres', () => {
    const exact = 'B'.repeat(280)
    const html = buildMessageEmailHtml({ ...base, messagePreview: exact })
    expect(html).toContain(exact)
    expect(html).not.toContain('…')
  })

  it('escapa HTML em recipientName (XSS)', () => {
    const html = buildMessageEmailHtml({ ...base, recipientName: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapa HTML em senderLabel (XSS)', () => {
    const html = buildMessageEmailHtml({ ...base, senderLabel: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('escapa HTML em messagePreview (XSS)', () => {
    const html = buildMessageEmailHtml({ ...base, messagePreview: '<b>bold</b>' })
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('escapa HTML em ctaLabel (XSS)', () => {
    const html = buildMessageEmailHtml({ ...base, ctaLabel: '<b>clique</b>' })
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('bloqueia javascript: em ctaUrl', () => {
    const html = buildMessageEmailHtml({ ...base, ctaUrl: 'javascript:alert(1)' })
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="#"')
  })

  it('permite URL https:// em ctaUrl', () => {
    const html = buildMessageEmailHtml({ ...base, ctaUrl: 'https://lobby.com/path' })
    expect(html).toContain('href="https://lobby.com/path"')
  })

  it('permite path relativo em ctaUrl', () => {
    const html = buildMessageEmailHtml({ ...base, ctaUrl: '/dashboard/projetos/123' })
    expect(html).toContain('href="/dashboard/projetos/123"')
  })
})

// ── buildCreditReceiptEmailHtml ───────────────────────────────────────────────

describe('buildCreditReceiptEmailHtml', () => {
  const base = {
    recipientName:   'Maria',
    credits:         100,
    amountFormatted: 'R$ 99,90',
    balance:         250,
    dateFormatted:   '20 de julho de 2026',
    packageName:     'Pacote Starter',
    ctaUrl:          'https://lobby.com/dashboard/creditos',
  }

  it('retorna string HTML válida', () => {
    const html = buildCreditReceiptEmailHtml(base)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })

  it('inclui recipientName no corpo', () => {
    const html = buildCreditReceiptEmailHtml(base)
    expect(html).toContain('Maria')
  })

  it('inclui quantidade de créditos com prefixo +', () => {
    const html = buildCreditReceiptEmailHtml(base)
    expect(html).toContain('+100')
  })

  it('inclui amountFormatted no card', () => {
    const html = buildCreditReceiptEmailHtml(base)
    expect(html).toContain('R$ 99,90')
  })

  it('inclui saldo total', () => {
    const html = buildCreditReceiptEmailHtml(base)
    expect(html).toContain('250 créditos')
  })

  it('inclui dateFormatted no card', () => {
    const html = buildCreditReceiptEmailHtml(base)
    expect(html).toContain('20 de julho de 2026')
  })

  it('inclui packageName no card', () => {
    const html = buildCreditReceiptEmailHtml(base)
    expect(html).toContain('Pacote Starter')
  })

  it('CTA href usa ctaUrl', () => {
    const html = buildCreditReceiptEmailHtml(base)
    expect(html).toContain('href="https://lobby.com/dashboard/creditos"')
  })

  it('escapa HTML em recipientName (XSS)', () => {
    const html = buildCreditReceiptEmailHtml({ ...base, recipientName: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapa HTML em packageName (XSS)', () => {
    const html = buildCreditReceiptEmailHtml({ ...base, packageName: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('bloqueia javascript: em ctaUrl', () => {
    const html = buildCreditReceiptEmailHtml({ ...base, ctaUrl: 'javascript:alert(1)' })
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="#"')
  })

  it('permite URL https:// em ctaUrl', () => {
    const html = buildCreditReceiptEmailHtml({ ...base, ctaUrl: 'https://lobby.com/creditos' })
    expect(html).toContain('href="https://lobby.com/creditos"')
  })

  it('permite path relativo em ctaUrl', () => {
    const html = buildCreditReceiptEmailHtml({ ...base, ctaUrl: '/dashboard/creditos' })
    expect(html).toContain('href="/dashboard/creditos"')
  })
})

// ── sendWhatsApp ──────────────────────────────────────────────────────────────

describe('sendWhatsApp', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...originalEnv }
  })

  it('retorna sem chamar fetch quando ZAPI_INSTANCE_ID ausente', async () => {
    delete process.env.ZAPI_INSTANCE_ID
    delete process.env.ZAPI_TOKEN
    await sendWhatsApp(['5511999999999'], 'Olá')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retorna sem chamar fetch quando lista de phones vazia', async () => {
    process.env.ZAPI_INSTANCE_ID = 'inst'
    process.env.ZAPI_TOKEN = 'tok'
    await sendWhatsApp([], 'Olá')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('filtra phones com menos de 10 dígitos', async () => {
    process.env.ZAPI_INSTANCE_ID = 'inst'
    process.env.ZAPI_TOKEN = 'tok'
    await sendWhatsApp(['123', '456789'], 'Olá')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('chama fetch para phone válido', async () => {
    process.env.ZAPI_INSTANCE_ID = 'inst'
    process.env.ZAPI_TOKEN = 'tok'
    await sendWhatsApp(['5511999999999'], 'Olá')
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('inst'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('strip caracteres não-numéricos antes de validar', async () => {
    process.env.ZAPI_INSTANCE_ID = 'inst'
    process.env.ZAPI_TOKEN = 'tok'
    // (55) 11 9999-9999 → 5511999 com formatação → deve passar
    await sendWhatsApp(['(55) 11 99999-9999'], 'Olá')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('chama fetch para cada phone válido separadamente', async () => {
    process.env.ZAPI_INSTANCE_ID = 'inst'
    process.env.ZAPI_TOKEN = 'tok'
    await sendWhatsApp(['5511999999999', '5521988888888'], 'Olá')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

// ── sendEmail ─────────────────────────────────────────────────────────────────

describe('sendEmail', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it('retorna sem erro quando RESEND_API_KEY ausente', async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM_EMAIL
    await expect(sendEmail('a@b.com', 'Sub', '<p>oi</p>')).resolves.toBeUndefined()
  })

  it('aceita array de destinatários sem erro quando não configurado', async () => {
    delete process.env.RESEND_API_KEY
    await expect(
      sendEmail(['a@b.com', 'c@d.com'], 'Sub', '<p>oi</p>'),
    ).resolves.toBeUndefined()
  })
})
