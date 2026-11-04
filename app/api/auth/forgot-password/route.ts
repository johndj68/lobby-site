import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { verifyAntiBotToken } from '@/lib/anti-bot/verify'
import { antiBotRejectionResponse } from '@/lib/anti-bot/respond'
import { logAntiBotEvent } from '@/lib/anti-bot/log'

// Recuperação de senha (/recuperar-senha). Diferente de login/registro: quando o
// limite é excedido, NÃO retornamos 429 — respondemos { ok: true } normalmente e
// simplesmente não disparamos o e-mail. Isso preserva a propriedade do Supabase de
// nunca revelar se um e-mail existe na base (um 429 aqui vazaria esse sinal e
// pioraria a UX sem ganho de segurança real).
export async function POST(req: NextRequest) {
  const { email, turnstileToken } = await req.json().catch(() => ({}))
  if (!email) {
    return NextResponse.json({ error: 'Digite seu e-mail.' }, { status: 400 })
  }

  const ip = getClientIp(req)
  const normalizedEmail = String(email).trim().toLowerCase()

  const ipLimit   = checkRateLimit({ key: `forgot:ip:${ip}`, limit: 3, windowMs: 600_000 })
  const acctLimit = checkRateLimit({ key: `forgot:acct:${normalizedEmail}`, limit: 3, windowMs: 3_600_000 })

  if (!ipLimit.allowed || !acctLimit.allowed) {
    logAuthEvent('forgot_password_block', normalizedEmail, ip, req)
    return NextResponse.json({ ok: true })
  }

  // Recuperação sempre exige comprovante válido antes de disparar o e-mail (seção 3).
  // Isso é independente de a conta existir — ainda não olhamos para isso — então
  // recusar aqui com um erro explícito não vaza existência de conta, diferente do
  // fail-open acima (que é só para o rate limit, propriedade já documentada).
  const remoteIp = ip === 'unknown' ? undefined : ip
  const verifyResult = await verifyAntiBotToken({ token: turnstileToken, action: 'forgot_password', remoteIp })
  if (verifyResult.outcome !== 'ok') {
    logAntiBotEvent({
      operation:      'forgot_password',
      eventType:      verifyResult.outcome === 'unavailable' ? 'provider_unavailable' : 'verify_failed',
      ip,
      email:          normalizedEmail,
      failureReason:  verifyResult.reason,
    })
    return antiBotRejectionResponse(verifyResult)
  }
  logAntiBotEvent({ operation: 'forgot_password', eventType: 'verify_passed', ip, email: normalizedEmail })

  const supabase = await createServerSupabaseClient()
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${req.nextUrl.origin}/atualizar-senha`,
  })
  if (resetError) console.error('forgot-password: resetPasswordForEmail falhou', resetError)

  return NextResponse.json({ ok: true })
}

function logAuthEvent(eventType: string, email: string, ip: string, req: NextRequest) {
  try {
    const admin = createAdminClient()
    admin.from('auth_rate_limit_events').insert({
      event_type: eventType,
      email,
      ip,
      user_agent: req.headers.get('user-agent'),
    }).then(({ error }) => { if (error) console.error('[auth event log]', error) })
  } catch (err) {
    console.error('[auth event log]', err)
  }
}
