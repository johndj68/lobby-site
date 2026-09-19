import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getProfileRole } from '@/lib/services/role'
import {
  checkRateLimit, rateLimitResponse, getClientIp,
  checkLockout, recordAuthFailure, clearAuthFailures,
} from '@/lib/rate-limit'

// Login do técnico (/admin/login) — mesmo tratamento de app/api/auth/login,
// namespaced separadamente para não compartilhar contadores com o login de cliente.
export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  const ip = getClientIp(req)
  const acctKey = `admin-login:acct:${String(email).trim().toLowerCase()}`

  const ipLimit = checkRateLimit({ key: `admin-login:ip:${ip}`, limit: 5, windowMs: 60_000 })
  const ipLimited = rateLimitResponse(ipLimit)
  if (ipLimited) return ipLimited

  const acctLimit = checkRateLimit({ key: acctKey, limit: 20, windowMs: 3_600_000 })
  const acctLimited = rateLimitResponse(acctLimit)
  if (acctLimited) return acctLimited

  const lockout = checkLockout(acctKey)
  if (lockout.locked) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
      { status: 429, headers: { 'Retry-After': String(lockout.retryAfterSec) } },
    )
  }

  const supabase = await createServerSupabaseClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

  if (signInError) {
    recordAuthFailure(acctKey)
    logAuthEvent('admin_login_fail', email, ip, req)
    // Nunca repassa o texto cru do erro (pode ser um erro de rede/infra interno) —
    // só o caso de credenciais inválidas tem uma string estável e segura de expor.
    const safeMessage = signInError.message.includes('Invalid login credentials')
      ? 'Invalid login credentials'
      : 'Erro ao entrar. Tente novamente.'
    return NextResponse.json({ error: safeMessage }, { status: 401 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 401 })
  }

  const role = await getProfileRole(supabase, user.id)
  if (role !== 'technician') {
    await supabase.auth.signOut()
    return NextResponse.json(
      { error: 'Acesso restrito. Esta área é exclusiva para técnicos LOBBY.' },
      { status: 403 },
    )
  }

  clearAuthFailures(acctKey)
  return NextResponse.json({ ok: true })
}

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
