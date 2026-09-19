// Cria conta de cliente para testes e2e.
// Uso:
//   node --env-file=.env.local scripts/create-test-client.mjs \
//     --email teste@lobby.tech --password "Teste@1234" --name "Cliente Teste"

import { createClient } from '@supabase/supabase-js'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    out[argv[i]?.replace(/^--/, '')] = argv[i + 1]
  }
  return out
}

const { email, password, name } = parseArgs(process.argv.slice(2))

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Erro: --email obrigatório e deve ser e-mail válido.')
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

// Check existing
const { data: existing } = await supabase
  .from('profiles').select('id, role, email').eq('email', email).maybeSingle()

if (existing) {
  console.log(`OK: conta ${email} já existe (role: ${existing.role}). Nenhuma alteração.`)
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
  id:           created.user.id,
  role:         'client',
  full_name:    name,
  email,
  company_name: 'Empresa Teste',
  phone:        '11999999999',
  document:     '00000000000',
})

if (profileError) {
  console.error('Usuário criado, mas falhou ao salvar profile:', profileError.message)
  process.exit(1)
}

console.log(`OK: cliente de teste criado — ${email}`)
console.log(`    Senha: ${password}`)
console.log(`    Para os testes: E2E_EMAIL="${email}" E2E_PASSWORD="${password}"`)
