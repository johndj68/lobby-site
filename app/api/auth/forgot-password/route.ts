import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// Recuperação de senha (/recuperar-senha). Diferente de login/registro: quando o
// limite é excedido, NÃO retornamos 429 — respondemos { ok: true } normalmente e
// simplesmente não disparamos o e-mail. Isso preserva a propriedade do Supabase de
// nunca revelar se um e-mail existe na base (um 429 aqui vazaria esse sinal e
// pioraria a UX sem ganho de segurança real).
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))
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
