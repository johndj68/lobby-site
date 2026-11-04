import { NextResponse } from 'next/server'
import type { AntiBotVerifyResult } from './verify'

// Mensagens em inglês conforme seção 9 do pedido — só o texto relativo ao desafio
// anti-bot, o resto do produto permanece em português (não há i18n no projeto hoje).
export const ANTI_BOT_MESSAGES = {
  challengeRequired:  'Please complete the security check.',
  challengeExpired:   'Your verification has expired. Please try again.',
  verifyFailed:       "We couldn't verify your request. Please try again.",
  unavailable:        'Security verification is temporarily unavailable. Please try again shortly.',
} as const

/** Converte um resultado de verificação não-ok na resposta HTTP estruturada que o
 *  frontend usa para decidir qual estado mostrar (ver components/anti-bot). */
export function antiBotRejectionResponse(
  result: Extract<AntiBotVerifyResult, { outcome: 'rejected' | 'unavailable' }>,
): NextResponse {
  if (result.outcome === 'unavailable') {
    return NextResponse.json(
      { code: 'BOT_CHALLENGE_UNAVAILABLE', error: ANTI_BOT_MESSAGES.unavailable },
      { status: 503 },
    )
  }

  const message = result.reason === 'duplicate' || result.reason === 'invalid_or_expired'
    ? ANTI_BOT_MESSAGES.challengeExpired
    : ANTI_BOT_MESSAGES.challengeRequired

  return NextResponse.json(
    { code: 'BOT_CHALLENGE_REQUIRED', error: message },
    { status: 400 },
  )
}
