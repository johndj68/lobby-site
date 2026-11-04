import { antiBotConfig, allowedHostnames } from './config'
import type { AntiBotAction } from './types'

// Endpoint oficial, conforme
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface SiteverifyResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
}

export interface TurnstileClient {
  siteverify(params: { secret: string; response: string; remoteip?: string }): Promise<SiteverifyResponse>
}

// Implementação real — chamada HTTP direta ao siteverify, timeout curto e configurável
// (lib/anti-bot/config.ts), sem reter conexão aberta. Isolada por trás de TurnstileClient
// para permitir injeção de um fake nos testes (seção 8 do pedido: nunca um token de
// bypass aceito em produção, e sim DI no teste).
class HttpTurnstileClient implements TurnstileClient {
  async siteverify(params: { secret: string; response: string; remoteip?: string }): Promise<SiteverifyResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), antiBotConfig.timeoutMs)
    try {
      const body = new URLSearchParams()
      body.set('secret', params.secret)
      body.set('response', params.response)
      if (params.remoteip) body.set('remoteip', params.remoteip)

      const res = await fetch(SITEVERIFY_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal:  controller.signal,
      })
      if (!res.ok) throw new Error(`siteverify respondeu HTTP ${res.status}`)
      return (await res.json()) as SiteverifyResponse
    } finally {
      clearTimeout(timer)
    }
  }
}

const defaultClient: TurnstileClient = new HttpTurnstileClient()

export type AntiBotRejectReason =
  | 'missing_token'
  | 'invalid_or_expired'
  | 'duplicate'
  | 'hostname_mismatch'
  | 'action_mismatch'

export type AntiBotUnavailableReason =
  | 'timeout'
  | 'provider_error'
  | 'config_missing'
  | 'malformed_response'

export type AntiBotVerifyResult =
  | { outcome: 'ok' }
  | { outcome: 'rejected'; reason: AntiBotRejectReason }
  | { outcome: 'unavailable'; reason: AntiBotUnavailableReason }

/**
 * Valida um comprovante de desafio diretamente com a Cloudflare. Nunca confia em
 * hostname/ação enviados pelo cliente — hostname vem do allowlist do servidor
 * (lib/anti-bot/config.ts) e a ação esperada é o parâmetro `action` desta função,
 * decidido pela rota que chama, nunca pelo corpo da requisição.
 */
export async function verifyAntiBotToken({
  token,
  action,
  remoteIp,
  client = defaultClient,
}: {
  token: string | undefined | null
  action: AntiBotAction
  remoteIp?: string
  client?: TurnstileClient
}): Promise<AntiBotVerifyResult> {
  if (!antiBotConfig.secretKey) {
    return { outcome: 'unavailable', reason: 'config_missing' }
  }

  // Formato básico antes de gastar uma chamada de rede: limite documentado é 2048 chars.
  if (!token || typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { outcome: 'rejected', reason: 'missing_token' }
  }

  let raw: SiteverifyResponse
  try {
    raw = await client.siteverify({ secret: antiBotConfig.secretKey, response: token, remoteip: remoteIp })
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return { outcome: 'unavailable', reason: isAbort ? 'timeout' : 'provider_error' }
  }

  if (typeof raw?.success !== 'boolean') {
    return { outcome: 'unavailable', reason: 'malformed_response' }
  }

  if (!raw.success) {
    const codes = raw['error-codes'] ?? []
    // https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
    if (codes.includes('timeout-or-duplicate')) return { outcome: 'rejected', reason: 'duplicate' }
    if (codes.includes('missing-input-response')) return { outcome: 'rejected', reason: 'missing_token' }
    if (codes.includes('invalid-input-response')) return { outcome: 'rejected', reason: 'invalid_or_expired' }
    if (codes.includes('missing-input-secret') || codes.includes('invalid-input-secret')) {
      // Secret mal configurada — erro nosso, não da pessoa. Nunca deixa passar.
      return { outcome: 'unavailable', reason: 'config_missing' }
    }
    // bad-request, internal-error, ou qualquer código novo não mapeado: trata como
    // indisponibilidade do provedor em vez de inventar uma regra de rejeição não
    // documentada.
    return { outcome: 'unavailable', reason: 'provider_error' }
  }

  // Hostname e ação são verificados pelo servidor — nunca aceitos do cliente.
  if (!raw.hostname || !allowedHostnames.includes(raw.hostname)) {
    return { outcome: 'rejected', reason: 'hostname_mismatch' }
  }
  if (raw.action !== action) {
    return { outcome: 'rejected', reason: 'action_mismatch' }
  }

  return { outcome: 'ok' }
}
