// Apaga um técnico (auth + profile). Roda só localmente, usa service role key.
// Contorna bugs do dashboard do Supabase (ex: "Unauthorized" ao excluir em
// Authentication > Users por sessão expirada ou permissão insuficiente na org).
//
// Uso:
//   node --env-file=.env.local scripts/delete-technician.mjs --email tecnico@lobby.com

import { createClient } from '@supabase/supabase-js'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    out[key] = argv[i + 1]
  }
  return out
}

const { email } = parseArgs(process.argv.slice(2))

if (!email) {
  console.error('Erro: --email obrigatório.')
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

const { data: profile } = await supabase
  .from('profiles')
  .select('id, role, full_name')
  .eq('email', email)
  .maybeSingle()

if (!profile) {
  console.error(`Erro: nenhum profile encontrado com e-mail ${email}.`)
  process.exit(1)
}
if (profile.role !== 'technician') {
  console.error(`Erro: profile encontrado, mas role é "${profile.role}" (não é técnico). Abortando por segurança.`)
  process.exit(1)
}

// Libera solicitações atribuídas a esse técnico antes de apagar, senão a FK
// contacts.assignee_id -> profiles.id bloqueia o delete.
const { error: unassignError } = await supabase
  .from('contacts')
  .update({ assignee_id: null })
  .eq('assignee_id', profile.id)
if (unassignError) {
  console.error('Erro ao desatribuir solicitações do técnico:', unassignError.message)
  process.exit(1)
}

const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(profile.id)
if (deleteAuthError) {
  console.error('Erro ao apagar usuário (auth):', deleteAuthError.message)
  process.exit(1)
}

// profiles.id referencia auth.users(id) on delete cascade — a linha de
// profile já deve ter sido removida junto. Confirma e limpa se sobrou algo.
await supabase.from('profiles').delete().eq('id', profile.id)

console.log(`OK: técnico ${profile.full_name ?? email} (${email}) apagado.`)
