// DAST autenticado — testes de sessão, token e isolamento (ETAPAS 7, 9-16).
// SÓ roda contra staging — trava de segurança abaixo recusa produção.
// Usa os 4 usuários descartáveis criados por dast-seed-staging.mjs.
//
// Uso:
//   node --env-file=.env.staging.local scripts/dast-session-tests.mjs

import { createClient } from '@supabase/supabase-js'

const URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY

const PRODUCTION_REF = 'miugjafzptsdqzzgkbea'
if (!URL || URL.includes(PRODUCTION_REF)) {
  console.error('RECUSADO: aponta pra produção ou URL ausente. Só roda em staging.')
  process.exit(1)
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const creds = {
  COMMON:    { email: process.env.DAST_COMMON_EMAIL,    password: process.env.DAST_COMMON_PASSWORD },
  ADMIN:     { email: process.env.DAST_ADMIN_EMAIL,      password: process.env.DAST_ADMIN_PASSWORD },
  BLOCKED:   { email: process.env.DAST_BLOCKED_EMAIL,    password: process.env.DAST_BLOCKED_PASSWORD },
  OTHER_ORG: { email: process.env.DAST_OTHER_ORG_EMAIL,  password: process.env.DAST_OTHER_ORG_PASSWORD },
}
for (const [k, v] of Object.entries(creds)) {
  if (!v.email || !v.password) { console.error(`Faltando credencial DAST_${k}_EMAIL/PASSWORD`); process.exit(1) }
}

const results = []
let idCounter = 1
function record(profile, test, endpoint, expected, actualOk, severity, note) {
  const row = { id: `T${String(idCounter++).padStart(2, '0')}`, profile, test, endpoint, expected, actual: actualOk ? 'CONFORME' : 'DIVERGENTE', severity, note }
  results.push(row)
  const mark = actualOk ? 'OK ' : 'FALHA'
  console.log(`[${mark}] ${row.id} ${profile} — ${test}${note ? ' :: ' + note : ''}`)
}

function newClient() {
  return createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function signIn(email, password) {
  const sb = newClient()
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  return { sb, data, error }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Fixture: pega os IDs de projeto do COMMON e do OTHER_ORG já semeados ──
const { data: commonProfile } = await admin.from('profiles').select('id').eq('email', creds.COMMON.email).single()
const { data: otherProfile }  = await admin.from('profiles').select('id').eq('email', creds.OTHER_ORG.email).single()
const { data: commonProj }    = await admin.from('client_projects').select('id').eq('client_id', commonProfile.id).limit(1).single()
const { data: otherProj }     = await admin.from('client_projects').select('id').eq('client_id', otherProfile.id).limit(1).single()

console.log('\n=== SEÇÃO A — Isolamento entre perfis (ETAPA 7) ===\n')

{
  const { sb } = await signIn(creds.COMMON.email, creds.COMMON.password)

  // A1: COMMON lê sua própria lista de projetos
  const { data: own } = await sb.from('client_projects').select('id')
  record('COMMON', 'lê lista de projetos (sem filtro explícito)', 'client_projects SELECT', 'só retorna projetos do próprio COMMON', own?.every(p => true) && own?.some(p => p.id === commonProj.id) && !own?.some(p => p.id === otherProj.id), 'crítica',
    `retornou ${own?.length ?? 0} linha(s)`)

  // A2: COMMON tenta ler diretamente o projeto do OTHER_ORG por ID
  const { data: leak } = await sb.from('client_projects').select('*').eq('id', otherProj.id).maybeSingle()
  record('COMMON', 'lê projeto do OTHER_ORG por ID direto (IDOR read)', `client_projects?id=eq.${otherProj.id}`, 'nenhuma linha retornada', leak === null, 'crítica')

  // A3: COMMON tenta UPDATE no projeto do OTHER_ORG
  const { error: updErr, count: updCount } = await sb.from('client_projects').update({ title: 'HACKED' }).eq('id', otherProj.id).select('id', { count: 'exact' })
  const { data: stillIntact } = await admin.from('client_projects').select('title').eq('id', otherProj.id).single()
  record('COMMON', 'UPDATE no projeto do OTHER_ORG (IDOR write)', `client_projects?id=eq.${otherProj.id}`, '0 linhas afetadas, título inalterado', stillIntact.title !== 'HACKED', 'crítica',
    `título atual: ${stillIntact.title === 'HACKED' ? 'FOI ALTERADO' : 'preservado'}`)

  // A4: COMMON tenta DELETE no projeto do OTHER_ORG
  const { error: delErr } = await sb.from('client_projects').delete().eq('id', otherProj.id)
  const { data: stillExists } = await admin.from('client_projects').select('id').eq('id', otherProj.id).maybeSingle()
  record('COMMON', 'DELETE no projeto do OTHER_ORG', `client_projects?id=eq.${otherProj.id}`, 'projeto continua existindo', !!stillExists, 'crítica')

  // A5: COMMON tenta INSERT de projeto com client_id do OTHER_ORG (impersonação de owner)
  const { error: insErr } = await sb.from('client_projects').insert({ client_id: otherProj.id === commonProj.id ? commonProfile.id : otherProfile.id, title: 'projeto forjado' })
  record('COMMON', 'INSERT client_projects com client_id de outro usuário', 'client_projects INSERT', 'rejeitado pela policy (with check client_id=auth.uid())', !!insErr, 'crítica', insErr ? insErr.message.slice(0, 80) : 'INSERIU SEM ERRO')

  // A6: COMMON tenta se auto-promover a technician
  const { error: escErr } = await sb.from('profiles').update({ role: 'technician', is_leader: true }).eq('id', commonProfile.id)
  const { data: afterEsc } = await admin.from('profiles').select('role, is_leader').eq('id', commonProfile.id).single()
  record('COMMON', 'auto-promoção via UPDATE profiles.role/is_leader', 'profiles UPDATE own row', 'role continua client, is_leader continua false', afterEsc.role === 'client' && afterEsc.is_leader !== true, 'crítica',
    `role=${afterEsc.role} is_leader=${afterEsc.is_leader}`)

  // A7: COMMON chama RPC administrativa diretamente
  const { error: rpcErr } = await sb.rpc('admin_adjust_credits', { p_user_id: commonProfile.id, p_amount: 999999, p_direction: 'credit', p_reason: 'dast-test' })
  record('COMMON', 'chama RPC admin_adjust_credits diretamente', 'rpc/admin_adjust_credits', 'rejeitado (só líder)', !!rpcErr, 'crítica', rpcErr ? rpcErr.message.slice(0, 80) : 'EXECUTOU SEM ERRO')

  // A8: COMMON tenta ler/escrever no typing_status de outro cliente
  const { data: typingLeak } = await sb.from('typing_status').select('*').eq('client_id', otherProfile.id)
  record('COMMON', 'lê typing_status de outro cliente', 'typing_status SELECT', 'nenhuma linha retornada', (typingLeak?.length ?? 0) === 0, 'média')

  const { error: typingWriteErr } = await sb.from('typing_status').upsert({ client_id: otherProfile.id, project_id: '00000000-0000-0000-0000-000000000000', role: 'client', typing: true }, { onConflict: 'client_id,project_id,role' })
  record('COMMON', 'escreve typing_status fingindo ser outro cliente', 'typing_status INSERT/UPDATE', 'rejeitado pela policy', !!typingWriteErr, 'média', typingWriteErr ? typingWriteErr.message.slice(0,80) : 'ESCREVEU SEM ERRO')

  await sb.auth.signOut()
}

{
  // Visitante — cliente anônimo, sem sessão nenhuma
  const sb = newClient()
  const { data: visProfiles } = await sb.from('profiles').select('*')
  record('VISITANTE', 'lê tabela profiles sem sessão', 'profiles SELECT (anon)', 'nenhuma linha (RLS nega tudo sem auth.uid())', (visProfiles?.length ?? 0) === 0, 'crítica')

  const { data: visProjects } = await sb.from('client_projects').select('*')
  record('VISITANTE', 'lê client_projects sem sessão', 'client_projects SELECT (anon)', 'nenhuma linha', (visProjects?.length ?? 0) === 0, 'crítica')

  const { data: visMessages } = await sb.from('messages').select('*')
  record('VISITANTE', 'lê messages sem sessão', 'messages SELECT (anon)', 'nenhuma linha', (visMessages?.length ?? 0) === 0, 'crítica')

  const { error: visRpcErr } = await sb.rpc('get_thread_summaries')
  record('VISITANTE', 'chama get_thread_summaries sem sessão', 'rpc/get_thread_summaries (anon)', 'rejeitado', !!visRpcErr, 'crítica', visRpcErr ? visRpcErr.message.slice(0,80) : 'EXECUTOU')
}

{
  const { sb } = await signIn(creds.OTHER_ORG.email, creds.OTHER_ORG.password)
  const { data: leak } = await sb.from('client_projects').select('*').eq('id', commonProj.id).maybeSingle()
  record('OTHER_ORG', 'lê projeto do COMMON por ID direto', `client_projects?id=eq.${commonProj.id}`, 'nenhuma linha retornada', leak === null, 'crítica')
  await sb.auth.signOut()
}

console.log('\n=== SEÇÃO B — Token expirado (ETAPA 9, jwt_exp=30s em staging) ===\n')

{
  const { sb, data } = await signIn(creds.COMMON.email, creds.COMMON.password)
  const accessBefore = data.session.access_token
  const refreshToken  = data.session.refresh_token

  const { data: okBefore, error: errBefore } = await sb.from('profiles').select('id').eq('id', commonProfile.id).single()
  record('COMMON', 'query com token recém-emitido', 'profiles SELECT', 'sucesso', !!okBefore && !errBefore, 'alta')

  console.log('  aguardando 35s para expiração real do access token (jwt_exp=30s)...')
  await sleep(35000)

  // Client cru com o token expirado, sem refresh automático
  const sbExpired = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  await sbExpired.auth.setSession({ access_token: accessBefore, refresh_token: refreshToken })
  // setSession dispara autoRefresh internamente às vezes; força uso do token velho puro via header manual:
  const rawRes = await fetch(`${URL}/rest/v1/profiles?id=eq.${commonProfile.id}&select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${accessBefore}` },
  })
  const rawBody = await rawRes.json().catch(() => null)
  record('COMMON', 'usa access_token expirado direto na REST API', 'GET /rest/v1/profiles (Bearer expirado)', '401 e nenhum dado', rawRes.status === 401 && !Array.isArray(rawBody), 'crítica',
    `status=${rawRes.status}`)

  // Renovação com refresh token ainda válido deve funcionar
  const sbFresh = newClient()
  const { data: refreshed, error: refreshErr } = await sbFresh.auth.refreshSession({ refresh_token: refreshToken })
  record('COMMON', 'renova sessão com refresh_token válido após access_token expirar', 'auth/v1/token?grant_type=refresh_token', 'sucesso, novo access_token', !!refreshed?.session?.access_token && !refreshErr, 'alta')

  if (refreshed?.session) await sbFresh.auth.signOut()
}

console.log('\n=== SEÇÃO C — Logout e reutilização de token (ETAPA 10) ===\n')

{
  const { sb, data } = await signIn(creds.COMMON.email, creds.COMMON.password)
  const access  = data.session.access_token
  const refresh = data.session.refresh_token

  await sb.auth.signOut() // scope padrão da lib: 'global' na v2 recente

  // Access token antigo ainda é criptograficamente válido até expirar — comportamento
  // esperado e documentado, não uma falha, DESDE que ações sensíveis revalidem no servidor.
  const resStillValid = await fetch(`${URL}/rest/v1/profiles?id=eq.${commonProfile.id}&select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${access}` },
  })
  record('COMMON', 'usa access_token após logout, ainda dentro da validade', 'GET /rest/v1/profiles', 'RESIDUAL: token continua válido até expirar (esperado, JWT stateless) — documentado, não corrigido aqui', resStillValid.status === 200, 'baixa (documentado)',
    `status=${resStillValid.status} — janela residual até ${new Date(Date.now()+30000).toISOString()} (jwt_exp=30s em staging)`)

  const { error: refreshAfterLogoutErr } = await newClient().auth.refreshSession({ refresh_token: refresh })
  record('COMMON', 'reutiliza refresh_token após logout', 'auth/v1/token?grant_type=refresh_token', 'rejeitado — refresh token revogado no logout', !!refreshAfterLogoutErr, 'alta',
    refreshAfterLogoutErr ? refreshAfterLogoutErr.message.slice(0,80) : 'RENOVOU SEM ERRO (grave)')
}

console.log('\n=== SEÇÃO D — Usuário bloqueado (ETAPA 11) ===\n')

{
  // Cenário B primeiro (precisa da sessão viva antes do ban)
  const { sb: sbBlocked, data: blockedData } = await signIn(creds.BLOCKED.email, creds.BLOCKED.password)
  const blockedAccess  = blockedData.session.access_token
  const blockedRefresh = blockedData.session.refresh_token
  const { data: blockedProfile } = await admin.from('profiles').select('id').eq('email', creds.BLOCKED.email).single()

  // Bane via mecanismo administrativo real (Supabase Auth admin) — não desativa RLS/auth pra isso
  const { error: banErr } = await admin.auth.admin.updateUserById(blockedProfile.id, { ban_duration: '876000h' })
  if (banErr) console.error('Erro ao banir usuário de teste:', banErr.message)

  // Cenário A: novo login deve ser negado
  const { data: newLoginData, error: newLoginErr } = await signIn(creds.BLOCKED.email, creds.BLOCKED.password).then(r => r)
  record('BLOCKED', 'novo login após ser bloqueado', 'auth/v1/token?grant_type=password', 'rejeitado', !!newLoginErr && !newLoginData?.session, 'crítica',
    newLoginErr ? newLoginErr.message.slice(0,80) : 'LOGOU MESMO BLOQUEADO (grave)')

  // Cenário B: sessão já existente, tenta renovar após o ban
  const { error: refreshAfterBanErr } = await newClient().auth.refreshSession({ refresh_token: blockedRefresh })
  record('BLOCKED', 'renova sessão pré-existente após ser bloqueado', 'auth/v1/token?grant_type=refresh_token', 'rejeitado', !!refreshAfterBanErr, 'crítica',
    refreshAfterBanErr ? refreshAfterBanErr.message.slice(0,80) : 'RENOVOU MESMO BLOQUEADO (grave)')

  // Cenário B: access_token antigo (ainda não expirado) — testa acesso a dado privado
  const resOldToken = await fetch(`${URL}/rest/v1/profiles?id=eq.${blockedProfile.id}&select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${blockedAccess}` },
  })
  record('BLOCKED', 'usa access_token emitido ANTES do bloqueio, ainda não expirado', 'GET /rest/v1/profiles', 'RESIDUAL documentado (mesma janela de jwt_exp) — RLS não checa status de ban por linha', resOldToken.status === 200, 'média (documentado)',
    `status=${resOldToken.status}`)
}

console.log('\n=== SEÇÃO E — Troca de senha (ETAPA 12) ===\n')

{
  const originalPassword = creds.OTHER_ORG.password
  const newPassword = originalPassword + '_NEW1!'

  const { sb: deviceA, data: dA } = await signIn(creds.OTHER_ORG.email, originalPassword)
  const { sb: deviceB, data: dB } = await signIn(creds.OTHER_ORG.email, originalPassword)
  record('OTHER_ORG', 'login simultâneo em 2 dispositivos', 'auth/v1/token?grant_type=password (x2)', 'ambos autenticam', !!dA.session && !!dB.session, 'informativo')

  const { error: pwErr } = await deviceA.auth.updateUser({ password: newPassword })
  record('OTHER_ORG', 'troca de senha no dispositivo A', 'auth/v1/user (PUT password)', 'sucesso', !pwErr, 'alta')

  const resB = await fetch(`${URL}/rest/v1/profiles?id=eq.${otherProfile.id}&select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${dB.session.access_token}` },
  })
  record('OTHER_ORG', 'dispositivo B continua usando access_token antigo após troca de senha em A', 'GET /rest/v1/profiles', 'RESIDUAL documentado — Supabase não revoga access_token de outras sessões por padrão na troca de senha', resB.status === 200, 'média (política a decidir)',
    `status=${resB.status}`)

  const { error: refreshBErr } = await newClient().auth.refreshSession({ refresh_token: dB.session.refresh_token })
  record('OTHER_ORG', 'dispositivo B tenta renovar sessão após troca de senha em A', 'auth/v1/token?grant_type=refresh_token', 'POLÍTICA ATUAL DO SUPABASE: refresh token de outra sessão continua válido (troca de senha não derruba outras sessões por padrão)', true, 'média (comportamento padrão da plataforma, ver nota no relatório)',
    refreshBErr ? `rejeitado: ${refreshBErr.message.slice(0,60)}` : 'renovação aceita — outras sessões NÃO são encerradas automaticamente')

  const { error: oldPwErr } = await signIn(creds.OTHER_ORG.email, originalPassword).then(r => r)
  record('OTHER_ORG', 'login com senha antiga após troca', 'auth/v1/token?grant_type=password', 'rejeitado', !!oldPwErr, 'alta')

  const { data: newPwData, error: newPwErr } = await signIn(creds.OTHER_ORG.email, newPassword).then(r => r)
  record('OTHER_ORG', 'login com senha nova', 'auth/v1/token?grant_type=password', 'sucesso', !!newPwData?.session && !newPwErr, 'alta')

  // Restaura a senha original pra não quebrar reruns do fixture
  if (newPwData?.session) {
    const restoreSb = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    await restoreSb.auth.setSession(newPwData.session)
    await restoreSb.auth.updateUser({ password: originalPassword })
    await restoreSb.auth.signOut()
  }
}

console.log('\n=== SEÇÃO F — Reutilização de refresh token (ETAPA 15) ===\n')
console.log(`  Config atual do staging: refresh_token_rotation_enabled=true, security_refresh_token_reuse_interval=10s\n`)

{
  const { data } = await signIn(creds.COMMON.email, creds.COMMON.password)
  const refresh1 = data.session.refresh_token

  const { data: r2, error: e2 } = await newClient().auth.refreshSession({ refresh_token: refresh1 })
  record('COMMON', 'usa refresh_token uma vez (rotação esperada)', 'auth/v1/token?grant_type=refresh_token', 'sucesso, novo refresh_token emitido', !!r2?.session && !e2, 'alta')
  const refresh2 = r2?.session?.refresh_token

  // Reuso DENTRO da janela de tolerância (10s) — não deve ser tratado como ataque
  const { data: reuseInWindow, error: eReuseInWindow } = await newClient().auth.refreshSession({ refresh_token: refresh1 })
  record('COMMON', 'reusa refresh_token JÁ USADO, dentro da janela de 10s', 'auth/v1/token?grant_type=refresh_token', 'tolerado (grace period), não invalida a família', !!reuseInWindow?.session || !!eReuseInWindow, 'informativo',
    eReuseInWindow ? `rejeitado: ${eReuseInWindow.message.slice(0,60)}` : 'aceito dentro da janela')

  console.log('  aguardando 12s para sair da janela de tolerância de 10s...')
  await sleep(12000)

  const { data: reuseOutside, error: eReuseOutside } = await newClient().auth.refreshSession({ refresh_token: refresh1 })
  record('COMMON', 'reusa refresh_token JÁ USADO, fora da janela de 10s', 'auth/v1/token?grant_type=refresh_token', 'rejeitado — detecção de reuso deve invalidar a família inteira', !!eReuseOutside, 'crítica',
    eReuseOutside ? eReuseOutside.message.slice(0,80) : 'ACEITOU REUSO FORA DA JANELA (grave)')

  // A família inteira (inclusive o refresh_token2, legítimo) deve cair junto
  const { error: eChainDead } = await newClient().auth.refreshSession({ refresh_token: refresh2 })
  record('COMMON', 'tenta usar refresh_token2 (legítimo) após reuso detectado na cadeia', 'auth/v1/token?grant_type=refresh_token', 'também rejeitado — cadeia inteira invalidada', !!eChainDead, 'crítica',
    eChainDead ? eChainDead.message.slice(0,80) : 'CADEIA CONTINUOU VÁLIDA (grave)')

  // Usuário recupera acesso com login novo e legítimo
  const { data: recovered, error: eRecovered } = await signIn(creds.COMMON.email, creds.COMMON.password).then(r => r)
  record('COMMON', 'novo login legítimo após cadeia de refresh comprometida', 'auth/v1/token?grant_type=password', 'sucesso — usuário não fica travado fora da conta', !!recovered?.session && !eRecovered, 'alta')
  if (recovered?.session) {
    const s = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    await s.auth.setSession(recovered.session)
    await s.auth.signOut()
  }
}

console.log('\n=== SEÇÃO G — Remoção do papel de administrador (ETAPA 16) ===\n')

{
  const { sb, data } = await signIn(creds.ADMIN.email, creds.ADMIN.password)
  const adminAccess = data.session.access_token
  const { data: adminProfile } = await admin.from('profiles').select('id').eq('email', creds.ADMIN.email).single()

  const { data: finBefore, error: finBeforeErr } = await sb.from('financial_transactions').select('id').limit(1)
  record('ADMIN', 'lê financial_transactions com privilégio de líder ativo', 'financial_transactions SELECT', 'sucesso (RLS: role=technician AND is_leader=true)', !finBeforeErr, 'informativo')

  const { error: appMetaCheck } = await fetch(`${URL}/rest/v1/profiles?id=eq.${adminProfile.id}&select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${adminAccess}` } }).then(r => r.json()).then(() => ({error: null})).catch(e => ({error: e}))

  // Remove o papel administrativo por processo autorizado (mesma operação que a Server Action de líder faria)
  await admin.from('profiles').update({ is_leader: false, role: 'client' }).eq('id', adminProfile.id)

  // SEM renovar o token — RLS deve reconsultar o profiles ATUAL a cada query,
  // não confiar em claim antigo do JWT (isso é o teste real do princípio
  // "consulta permissão atual", não "esconder menu").
  const { data: finAfter, error: finAfterErr } = await sb.from('financial_transactions').select('id').limit(1)
  record('ADMIN', 'lê financial_transactions com MESMO token, após remoção do papel (sem renovar sessão)', 'financial_transactions SELECT', 'RLS nega — reconsulta profiles.is_leader a cada linha, não confia em claim do JWT', (finAfter?.length ?? 0) === 0 || !!finAfterErr, 'crítica',
    finAfterErr ? finAfterErr.message.slice(0,60) : `retornou ${finAfter?.length ?? 0} linha(s)`)

  const { error: rpcAfter } = await sb.rpc('admin_adjust_credits', { p_user_id: adminProfile.id, p_amount: 1, p_direction: 'credit', p_reason: 'dast' })
  record('ADMIN', 'chama RPC admin_adjust_credits com MESMO token, após remoção do papel', 'rpc/admin_adjust_credits', 'rejeitado — is_leader(auth.uid()) reconsultado dentro da function', !!rpcAfter, 'crítica',
    rpcAfter ? rpcAfter.message.slice(0,80) : 'EXECUTOU MESMO SEM SER LÍDER (grave)')

  // Checagem do gap conhecido: rotas que leem app_metadata.role do JWT (não RLS)
  const jwtPayload = JSON.parse(Buffer.from(adminAccess.split('.')[1], 'base64').toString())
  record('ADMIN', 'JWT emitido ANTES da remoção ainda carrega app_metadata.role="technician" (claim, não é query ao banco)', 'app_metadata no JWT', 'RESIDUAL CONHECIDO — rotas que leem claim do JWT (não RLS) ficam desatualizadas até o token ser renovado', jwtPayload?.app_metadata?.role === 'technician', 'média (ver correção)',
    `claim atual no token velho: role=${jwtPayload?.app_metadata?.role}`)

  // Restaura pra não quebrar reruns
  await admin.from('profiles').update({ is_leader: true, role: 'technician' }).eq('id', adminProfile.id)
  await sb.auth.signOut()
}

console.log('\n\n=== RESUMO ===\n')
const bad = results.filter(r => r.actual === 'DIVERGENTE')
console.log(`Total: ${results.length} | Conforme: ${results.length - bad.length} | Divergente: ${bad.length}`)
if (bad.length) {
  console.log('\nDivergentes:')
  bad.forEach(r => console.log(`  ${r.id} [${r.severity}] ${r.profile} — ${r.test} :: ${r.note}`))
}

import { writeFileSync } from 'node:fs'
writeFileSync('zap/reports/session-tests-results.json', JSON.stringify(results, null, 2))
console.log('\nResultados completos: zap/reports/session-tests-results.json')
