import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import type { AntiBotAction } from './types'

function hashEmail(email: string): string {
  // Só para correlação em observabilidade — nunca reversível, nunca o e-mail cru.
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32)
}

export type AntiBotEventType =
  | 'challenge_required'
  | 'verify_passed'
  | 'verify_failed'
  | 'provider_unavailable'

/**
 * Loga evento mínimo de observabilidade do anti-bot (tabela anti_bot_events,
 * migration 20261017120000). Non-blocking e best-effort, mesmo padrão de
 * logAuthEvent já usado em app/api/auth/*. Nunca loga o token/comprovante do
 * desafio nem o e-mail em texto puro.
 */
export function logAntiBotEvent(params: {
  operation:      AntiBotAction
  eventType:      AntiBotEventType
  ip:             string
  email?:         string
  failureReason?: string
  latencyMs?:     number
}): void {
  try {
    const admin = createAdminClient()
    admin.from('anti_bot_events').insert({
      operation:      params.operation,
      event_type:     params.eventType,
      ip:             params.ip,
      email_hash:     params.email ? hashEmail(params.email) : null,
      failure_reason: params.failureReason ?? null,
      latency_ms:     params.latencyMs ?? null,
    }).then(({ error }) => { if (error) console.error('[anti-bot event log]', error) })
  } catch (err) {
    console.error('[anti-bot event log]', err)
  }
}
