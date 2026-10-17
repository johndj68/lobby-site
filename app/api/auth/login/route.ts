import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getProfileRole } from '@/lib/services/role'
import {
  checkRateLimit, rateLimitResponse, getClientIp,
  checkLockout, recordAuthFailure, clearAuthFailures,
} from '@/lib/rate-limit-redis'
import { loginChallengeRequired, recordLoginFailureSignal, clearLoginChallengeSignal } from '@/lib/anti-bot/policy'
import { verifyAntiBotToken } from '@/lib/anti-bot/verify'
import { antiBotRejectionResponse } from '@/lib/anti-bot/respond'
import { logAntiBotEvent } from '@/lib/anti-bot/log'

// Login do cliente (/login). Movido para server-side (era chamada direta ao
// Supabase Auth no browser) para permitir rate limit real por IP e por conta —
// uma chamada client-side não pode ser limitada aqui, pois um atacante bate
// direto na API do Supabase e ignora qualquer código deste app.
export async function POST(req: NextRequest) {
  const { email, password, turnstileToken } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  const ip = getClientIp(req)
  const normalizedEmail = String(email).trim().toLowerCase()
  const acctKey = `login:acct:${normalizedEmail}`

  // Skip rate limit in dev/localhost
  const isLocalhost = ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip?.startsWith('::ffff:127.')
  if (!isLocalhost) {
    const ipLimit = await checkRateLimit({ key: `login:ip:${ip}`, limit: 5, windowMs: 60_000 })
    const ipLimited = rateLimitResponse(ipLimit)
    if (ipLimited) return ipLimited
  }

  if (!isLocalhost) {
    const acctLimit = await checkRateLimit({ key: acctKey, limit: 20, windowMs: 3_600_000 })
    const acctLimited = rateLimitResponse(acctLimit)
    if (acctLimited) return acctLimited
  }

  if (!isLocalhost) {
    const lockout = await checkLockout(acctKey)
    if (lockout.locked) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
        { status: 429, headers: { 'Retry-After': String(lockout.retryAfterSec) } },
      )
    }
  }

  // Desafio adaptativo (seção 3): a maioria dos logins passa direto; só exige
  // comprovante depois de ANTI_BOT_LOGIN_CHALLENGE_THRESHOLD falhas na janela — por IP
  // OU por conta normalizada, igual para conta existente ou não (ainda não sabemos se
  // existe nesse ponto). Decidido pelo servidor, nunca pelo navegador, e checado ANTES
  // de tentar a credencial para não vazar se a conta existe.
  if (!isLocalhost) {
    const challengeRequired = await loginChallengeRequired(ip, normalizedEmail)
    if (challengeRequired) {
      const verifyResult = await verifyAntiBotToken({ token: turnstileToken, action: 'login', remoteIp: ip })
      if (verifyResult.outcome !== 'ok') {
        logAntiBotEvent({
          operation:     'login',
          eventType:     verifyResult.outcome === 'unavailable' ? 'provider_unavailable' : 'verify_failed',
          ip,
          email:         normalizedEmail,
          failureReason: verifyResult.reason,
        })
        return antiBotRejectionResponse(verifyResult)
      }
      logAntiBotEvent({ operation: 'login', eventType: 'verify_passed', ip, email: normalizedEmail })
    }
  }

  const supabase = await createServerSupabaseClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

  if (signInError) {
    if (!isLocalhost) {
      await recordAuthFailure(acctKey)
      await recordLoginFailureSignal(ip, normalizedEmail)
    }
    logAuthEvent('login_fail', email, ip, req)

    // E-mail ainda não confirmado: só chega aqui com senha correta (Supabase valida
    // credenciais antes de checar confirmação), então não é um oráculo de
    // enumeração — quem recebe isso já provou conhecer a senha certa. Código
    // estruturado deixa a UI oferecer reenvio de confirmação (ver
    // /api/auth/resend-confirmation), sem criar uma tela nova.
    if (signInError.message.includes('Email not confirmed')) {
      return NextResponse.json(
        { code: 'EMAIL_NOT_CONFIRMED', error: 'Confirme seu e-mail antes de entrar.' },
        { status: 403 },
      )
    }

    // Nunca repassa o texto cru do erro (pode ser um erro de rede/infra interno) —
    // só o caso de credenciais inválidas tem uma string estável e segura de expor.
    const safeMessage = signInError.message.includes('Invalid login credentials')
      ? 'Invalid login credentials'
      : 'Erro ao entrar. Tente novamente.'
    return NextResponse.json({ error: safeMessage }, { status: 401 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const role = await getProfileRole(supabase, user.id)
    if (role === 'technician') {
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: 'Acesso técnico: entre pelo painel em /admin/login' },
        { status: 403 },
      )
    }
  }

  await clearAuthFailures(acctKey)
  if (!isLocalhost) await clearLoginChallengeSignal(ip, normalizedEmail)
  return NextResponse.json({ ok: true })
}

// Registra o evento de forma non-blocking — nunca deve atrasar/derrubar a resposta de login.
function logAuthEvent(eventType: string, email: string, ip: string, req: NextRequest) {
  try {
    const admin = createAdminClient()
    admin.from('auth_rate_limit_events').insert({
      event_type: eventType,
      email:      String(email).trim().toLowerCase(),
      ip,
      user_agent: req.headers.get('user-agent'),
    }).then(({ error }) => { if (error) console.error('[auth event log]', error) })
  } catch (err) {
    console.error('[auth event log]', err)
  }
}
