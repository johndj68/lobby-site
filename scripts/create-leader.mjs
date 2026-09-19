// Bootstrap/promote a técnico líder. Roda só localmente, fora do navegador —
// usa a service role key, que nunca deve ser exposta em código client-side.
//
// Uso:
//   node --env-file=.env.local scripts/create-leader.mjs --email lider@lobby.com --password "senha-forte-aqui" --name "Nome do Líder"
//
// Se já existir um profile de técnico com esse e-mail, só promove (is_leader = true).
// Se não existir, cria a conta de auth + profile já como líder.

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Erro: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env.local.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: existing } = await supabase
  .from('profiles')
  .select('id, role')
  .eq('email', email)
  .maybeSingle()

if (existing) {
  if (existing.role !== 'technician') {
    console.error(`Erro: e-mail já cadastrado com role "${existing.role}" (não é técnico).`)
    process.exit(1)
  }
  const { error } = await supabase
    .from('profiles')
    .update({ is_leader: true })
    .eq('id', existing.id)
  if (error) {
    console.error('Erro ao promover técnico existente:', error.message)
    process.exit(1)
  }
  console.log(`OK: ${email} promovido a técnico líder.`)
  process.exit(0)
}

if (!password || password.length < 8) {
  console.error('Erro: --password obrigatório (mínimo 8 caracteres) para criar conta nova.')
  process.exit(1)
}
if (!name) {
  console.error('Erro: --name obrigatório para criar conta nova.')
  process.exit(1)
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
  id:        created.user.id,
  email,
  full_name: name,
  role:      'technician',
  is_leader: true,
})
if (profileError) {
  console.error('Usuário criado, mas falhou ao salvar profile:', profileError.message)
  process.exit(1)
}

console.log(`OK: técnico líder ${email} criado.`)
