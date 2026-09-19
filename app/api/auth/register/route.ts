import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'

interface RegisterInput {
  fullName:     string
  email:        string
  password:     string
  companyName:  string
  phone:        string
  document:     string
  interestArea: string
}

function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  let sum = 0, remainder
  for (let i = 1; i <= 9; i++) sum += parseInt(digits.substring(i - 1, i)) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(digits.substring(9, 10))) return false
  sum = 0
  for (let i = 1; i <= 10; i++) sum += parseInt(digits.substring(i - 1, i)) * (12 - i)
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  return remainder === parseInt(digits.substring(10, 11))
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 11
}

// Cadastro de cliente (/cadastro). Movido para server-side pelo mesmo motivo
// do login: sem isso, nada neste app consegue limitar a taxa de criação de contas.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as RegisterInput | null
  if (!body?.email || !body?.password || !body?.fullName) {
    return NextResponse.json({ error: 'Preencha todos os campos obrigatórios.' }, { status: 400 })
  }

  if (!isValidPhone(body.phone)) {
    return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
  }

  if (!isValidCPF(body.document)) {
    return NextResponse.json({ error: 'CPF/CNPJ inválido.' }, { status: 400 })
  }

  const ip = getClientIp(req)

  // 3 cadastros / 10 min e 10 / dia por IP — blunt contra criação em massa
  const burstLimit = checkRateLimit({ key: `register:ip:${ip}`, limit: 3, windowMs: 600_000 })
  const burstLimited = rateLimitResponse(burstLimit)
  if (burstLimited) return burstLimited

  const dayLimit = checkRateLimit({ key: `register:ip:day:${ip}`, limit: 10, windowMs: 86_400_000 })
  const dayLimited = rateLimitResponse(dayLimit)
  if (dayLimited) return dayLimited

  const supabase = await createServerSupabaseClient()
  const { data, error: signUpError } = await supabase.auth.signUp({
    email:    body.email,
    password: body.password,
    options:  { data: { full_name: body.fullName } },
  })

  if (signUpError) {
    return NextResponse.json({ error: signUpError.message }, { status: 400 })
  }

  if (data.user) {
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id:            data.user.id,
      role:          'client',
      full_name:     body.fullName,
      email:         body.email,
      company_name:  body.companyName,
      phone:         body.phone,
      document:      body.document.replace(/\D/g, ''),
      interest_area: body.interestArea,
    })
    // O código client-side original também descartava esse erro silenciosamente;
    // aqui ao menos fica logado server-side para observabilidade.
    if (upsertError) console.error('register: falha ao salvar profile', upsertError)
  }

  return NextResponse.json({ ok: true })
}
