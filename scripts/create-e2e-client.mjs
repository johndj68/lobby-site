// Bootstrap de uma conta de cliente (role='client') dedicada a testes e2e —
// mesmo padrão de create-leader.mjs, mas pra comprador comum, não técnico.
// Roda só localmente, fora do navegador — usa a service role key, que nunca
// deve ser exposta em código client-side.
//
// Uso:
//   node --env-file=.env.local scripts/create-e2e-client.mjs --email e2e-checkout@lobby-site.test --password "senha-forte-aqui" --name "E2E Checkout Tester"
//
// Se já existir uma conta de auth com esse e-mail, só confirma o e-mail e
// garante que o profile existe com role='client' (idempotente).

import { createClient } from '@supabase/supabase-js'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    out[key] = argv[i + 1]
  }
  return out
}

const { email, password, name } = parseArgs(process.argv.slice(2))

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Erro: --email obrigatório e deve ser um e-mail válido.')
  process.exit(1)
}
if (!password || password.length < 8) {
  console.error('Erro: --password obrigatório (mínimo 8 caracteres).')
  process.exit(1)
}
if (!name) {
  console.error('Erro: --name obrigatório.')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Erro: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env.local.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: existingProfile } = await supabase
  .from('profiles')
  .select('id, role')
  .eq('email', email)
  .maybeSingle()

if (existingProfile) {
  console.log(`OK: ${email} já existe (role=${existingProfile.role}). Nada a fazer.`)
  process.exit(0)
}

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: name },
})
if (createError) {
  console.error('Erro ao criar usuário:', createError.message)
  process.exit(1)
}

const { error: profileError } = await supabase.from('profiles').upsert({
  id:            created.user.id,
  email,
  full_name:     name,
  role:          'client',
  company_name:  'E2E Test Co',
  phone:         '11999999999',
  document:      '11144477735', // CPF de teste matematicamente válido
  interest_area: 'automacao',
})
if (profileError) {
  console.error('Usuário criado, mas falhou ao salvar profile:', profileError.message)
  process.exit(1)
}

console.log(`OK: cliente e2e ${email} criado.`)
