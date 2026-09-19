import { describe, it, expect, vi, afterEach } from 'vitest'
import { captureException, captureMessage } from '@/lib/monitoring'

afterEach(() => {
  vi.restoreAllMocks()
})

// ── captureException ──────────────────────────────────────────────────────────

describe('captureException', () => {
  it('não lança erro ao receber Error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => captureException(new Error('boom'))).not.toThrow()
    expect(spy).toHaveBeenCalledOnce()
  })

  it('não lança erro ao receber string', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => captureException('mensagem de erro')).not.toThrow()
  })

  it('não lança erro ao receber undefined', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => captureException(undefined)).not.toThrow()
  })

  it('aceita contexto adicional sem lançar', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    captureException(new Error('x'), { digest: 'abc123', area: 'admin' })
    expect(spy).toHaveBeenCalledOnce()
  })

  it('inclui a mensagem de erro no output', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('erro específico')
    captureException(err)
    const args = spy.mock.calls[0]
    const allArgs = args.map(a => String(a)).join(' ')
    expect(allArgs).toContain('erro específico')
  })
})

// ── captureMessage ────────────────────────────────────────────────────────────

describe('captureMessage', () => {
  it('nível info usa console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    captureMessage('tudo certo', 'info')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('nível warning usa console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    captureMessage('atenção', 'warning')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('nível error usa console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    captureMessage('falha grave', 'error')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('nível padrão (sem argumento) usa console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    captureMessage('mensagem padrão')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('inclui a mensagem no output', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    captureMessage('mensagem teste')
    const output = spy.mock.calls[0].join(' ')
    expect(output).toContain('mensagem teste')
  })
})
