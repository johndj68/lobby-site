import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { verifyAntiBotToken } from '@/lib/anti-bot/verify'
import { antiBotRejectionResponse } from '@/lib/anti-bot/respond'
import { logAntiBotEvent } from '@/lib/anti-bot/log'

// Reenvio de confirmação de e-mail (acionado a partir do login, quando
// signInError é "Email not confirmed" — ver app/api/auth/login/route.ts).
// Mesmo modelo anti-enumeração do forgot-password: sempre responde { ok: true },
// mesma mensagem, não importa se o e-mail existe, já está confirmado, ou foi
// bloqueado por rate limit — só o resultado do comprovante anti-bot muda a resposta,
// e isso não vaza nada sobre a conta porque é checado antes de qualquer consulta
// relacionada a ela.
export async function POST(req: NextRequest) {
  const { email, turnstileToken } = await req.json().catch(() => ({}))
  if (!email) {
    return NextResponse.json({ error: 'Digite seu e-mail.' }, { status: 400 })
  }

  const ip = getClientIp(req)
  const normalizedEmail = String(email).trim().toLowerCase()

  const ipLimit   = checkRateLimit({ key: `resend-confirm:ip:${ip}`, limit: 3, windowMs: 600_000 })
  const acctLimit = checkRateLimit({ key: `resend-confirm:acct:${normalizedEmail}`, limit: 3, windowMs: 3_600_000 })

  if (!ipLimit.allowed || !acctLimit.allowed) {
    logAuthEvent('resend_confirmation_block', normalizedEmail, ip, req)
    return NextResponse.json({ ok: true })
  }

  const remoteIp = ip === 'unknown' ? undefined : ip
  const verifyResult = await verifyAntiBotToken({ token: turnstileToken, action: 'resend_confirmation', remoteIp })
  if (verifyResult.outcome !== 'ok') {
    logAntiBotEvent({
      operation:      'resend_confirmation',
      eventType:      verifyResult.outcome === 'unavailable' ? 'provider_unavailable' : 'verify_failed',
      ip,
      email:          normalizedEmail,
      failureReason:  verifyResult.reason,
    })
    return antiBotRejectionResponse(verifyResult)
  }
  logAntiBotEvent({ operation: 'resend_confirmation', eventType: 'verify_passed', ip, email: normalizedEmail })

  const supabase = await createServerSupabaseClient()
  // Sem options.emailRedirectTo de propósito — segue o mesmo padrão do signUp em
  // app/api/auth/register/route.ts, que também não define um redirect explícito
  // (usa o Site URL/Redirect URLs já configurados no dashboard do Supabase).
  const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: normalizedEmail })
  if (resendError) console.error('resend-confirmation: auth.resend falhou', resendError)

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
