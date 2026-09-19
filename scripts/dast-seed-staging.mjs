// Cria as 4 contas descartáveis + dados fixture necessários pro DAST
// autenticado (ver plano em SECURITY.md §11). Roda SÓ contra staging —
// confere a URL antes de fazer qualquer coisa, recusa se parecer produção.
//
// Uso:
//   node --env-file=.env.staging.local scripts/dast-seed-staging.mjs

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Erro: rode com --env-file=.env.staging.local')
  process.exit(1)
}

// Trava de segurança: nunca deixa isso rodar contra o projeto de produção
// conhecido, mesmo que o .env errado seja passado por engano.
const PRODUCTION_REF = 'miugjafzptsdqzzgkbea'
if (supabaseUrl.includes(PRODUCTION_REF)) {
  console.error(`RECUSADO: NEXT_PUBLIC_SUPABASE_URL aponta pro projeto de PRODUÇÃO (${PRODUCTION_REF}). Este script só roda em staging.`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DOMAIN = 'dast-staging.lobby.invalid' // domínio inválido de propósito — nunca entrega e-mail de verdade

const USERS = [
  { key: 'COMMON',    email: `dast-common@${DOMAIN}`,    password: genPassword(), role: 'client',     name: 'DAST Common A' },
  { key: 'ADMIN',      email: `dast-admin@${DOMAIN}`,      password: genPassword(), role: 'technician', name: 'DAST Admin A', isLeader: true },
  { key: 'BLOCKED',    email: `dast-blocked@${DOMAIN}`,    password: genPassword(), role: 'client',     name: 'DAST Blocked' },
  { key: 'OTHER_ORG',  email: `dast-other-org@${DOMAIN}`,  password: genPassword(), role: 'client',     name: 'DAST Other Org B' },
]

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  let out = ''
  for (let i = 0; i < 24; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

const results = {}

for (const u of USERS) {
  const { data: existing } = await supabase.from('profiles').select('id').eq('email', u.email).maybeSingle()
  let userId
  if (existing) {
    userId = existing.id
    // Sempre reseta a senha (idempotente) — garante que sempre temos uma
    // credencial válida capturada ao final, mesmo em reruns após falha
    // parcial (a senha gerada em memória nunca sobrevive a um crash antes
    // de gravar em .env.staging.local).
    const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, { password: u.password })
    if (pwErr) { console.error(`Erro resetando senha de ${u.key}:`, pwErr.message); process.exit(1) }
    console.log(`= ${u.key}: já existia, senha resetada (${u.email})`)
  } else {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    })
    if (error) { console.error(`Erro criando ${u.key}:`, error.message); process.exit(1) }
    userId = created.user.id
    const { error: profErr } = await supabase.from('profiles').upsert({
      id: userId, email: u.email, full_name: u.name, role: u.role,
      ...(u.isLeader ? { is_leader: true } : {}),
      ...(u.role === 'client' ? { company_name: 'DAST Fixture Co', phone: '11900000000', document: '00000000000' } : {}),
    })
    if (profErr) { console.error(`Erro criando profile ${u.key}:`, profErr.message); process.exit(1) }
    console.log(`+ ${u.key}: criado (${u.email})`)
  }
  results[u.key] = { id: userId, email: u.email, password: u.password }
}

// Um client_project por client de teste, pra testar isolamento cross-client (IDOR)
for (const key of ['COMMON', 'OTHER_ORG']) {
  const clientId = results[key].id
  const { data: existingProj } = await supabase.from('client_projects').select('id').eq('client_id', clientId).limit(1).maybeSingle()
  if (existingProj) {
    results[key].projectId = existingProj.id
    console.log(`= projeto de ${key} já existe (${existingProj.id})`)
    continue
  }
  // Só client_id + title: o trigger prevent_client_projects_workflow_tampering
  // bloqueia status/progress/priority não-default em INSERT feito por quem
  // não é técnico (auth.uid() é null numa chamada via service_role/admin).
  const { data: proj, error } = await supabase.from('client_projects').insert({
    client_id: clientId, title: `Projeto fixture ${key}`,
  }).select('id').single()
  if (error) { console.error(`Erro criando projeto pra ${key}:`, error.message); process.exit(1) }
  results[key].projectId = proj.id
  console.log(`+ projeto de ${key} criado (${proj.id})`)
}

// Grava credenciais só localmente (gitignorado), nunca no stdout do CI/log
const lines = []
for (const u of USERS) {
  const r = results[u.key]
  lines.push(`DAST_${u.key}_EMAIL=${r.email}`)
  lines.push(`DAST_${u.key}_PASSWORD=${r.password}`)
}
const fs = await import('node:fs')
let envFile = fs.readFileSync('.env.staging.local', 'utf8')
envFile = envFile.replace(/\n# --- gerado por dast-seed-staging\.mjs ---[\s\S]*$/, '')
fs.writeFileSync('.env.staging.local', envFile.trimEnd() + '\n\n# --- gerado por dast-seed-staging.mjs ---\n' + lines.join('\n') + '\n')
console.log(`\n${lines.length / 2} credenciais gravadas em .env.staging.local (gitignorado, sempre atualizado nesta rodada).`)

console.log('\nIDs de projeto fixture (não sensível):')
console.log('  COMMON project_id:   ', results.COMMON.projectId)
console.log('  OTHER_ORG project_id:', results.OTHER_ORG.projectId)
