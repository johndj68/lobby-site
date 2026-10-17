import { peekCounter, incrementCounter, resetCounter } from '@/lib/rate-limit-redis'
import { antiBotConfig } from './config'

// Desafio adaptativo de login (seção 3 do pedido): a maioria das tentativas segue sem
// desafio; após `loginChallengeThreshold` falhas em `loginChallengeWindowMs`, por IP OU
// por conta normalizada (mesmo tratamento para conta existente ou não — o app nunca
// sabe se a conta existe antes de chamar signInWithPassword), o próximo login exige
// comprovante válido antes mesmo de tentar a credencial.
//
// Contadores no Redis (Upstash, já usado por lib/rate-limit-redis.ts para o rate limit
// de login) — compartilhados entre instâncias, cada chave expira por si via TTL, então
// não há crescimento ilimitado por e-mails arbitrários tentados por um atacante.
//
// Importante: resolver o desafio NÃO zera estes contadores — eles só são limpos em
// autenticação bem-sucedida de fato (clearLoginChallengeSignal), separado do lockout
// por falhas consecutivas (lib/rate-limit-redis.ts checkLockout/recordAuthFailure, que
// continua intacto e independente). Um comprovante válido não dá tentativas ilimitadas
// de senha — é apenas o que libera a *tentativa* de ir até o signInWithPassword.

function ipKey(ip: string): string {
  return `antibot:login:ip:${ip}`
}

function acctKey(normalizedEmail: string): string {
  return `antibot:login:acct:${normalizedEmail}`
}

export async function loginChallengeRequired(ip: string, normalizedEmail: string): Promise<boolean> {
  const [ipCount, acctCount] = await Promise.all([
    peekCounter(ipKey(ip)),
    peekCounter(acctKey(normalizedEmail)),
  ])
  return ipCount >= antiBotConfig.loginChallengeThreshold || acctCount >= antiBotConfig.loginChallengeThreshold
}

export async function recordLoginFailureSignal(ip: string, normalizedEmail: string): Promise<void> {
  await Promise.all([
    incrementCounter(ipKey(ip), antiBotConfig.loginChallengeWindowMs),
    incrementCounter(acctKey(normalizedEmail), antiBotConfig.loginChallengeWindowMs),
  ])
}

export async function clearLoginChallengeSignal(ip: string, normalizedEmail: string): Promise<void> {
  await Promise.all([
    resetCounter(ipKey(ip)),
    resetCounter(acctKey(normalizedEmail)),
  ])
}
