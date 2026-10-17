import 'server-only'

// Nunca importar este módulo de um componente 'use client' ou qualquer arquivo
// alcançável pelo bundle do navegador — guarda TURNSTILE_SECRET_KEY. O import
// 'server-only' acima faz o build falhar se isso acontecer (mesmo padrão de
// lib/supabase-admin.ts), em vez de confiar só neste comentário.

// Configuração do adaptador anti-bot (Cloudflare Turnstile), isolada de env.ts porque
// é opcional por natureza: o app deve continuar buildando e subindo sem essas chaves
// configuradas (ainda não há conta Cloudflare ligada a este projeto — ver docs/ANTI-BOT.md).
// O que NÃO é opcional é o comportamento em runtime: rotas protegidas devem falhar
// fechado (503 "temporarily unavailable"), nunca abrir silenciosamente, quando a
// configuração estiver incompleta. Ver lib/anti-bot/verify.ts.

// Chaves de teste oficiais da Cloudflare (documentadas em
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/) — nunca podem
// validar tráfego real. Usadas de propósito em dev/test; bloqueadas aqui se alguém as
// deixar em produção por engano.
const CLOUDFLARE_TEST_SECRET_KEYS = new Set([
  '1x0000000000000000000000000000000AA', // sempre aprova
  '2x0000000000000000000000000000000AA', // sempre rejeita
  '3x0000000000000000000000000000000AA', // sempre retorna "token already spent"
])

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const isProd = process.env.NODE_ENV === 'production'

const secretKey = process.env.TURNSTILE_SECRET_KEY || undefined
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined

// Hostnames que o siteverify pode legitimamente reportar para este projeto — definidos
// pelo servidor (nunca aceitos do cliente). Em dev, cai para localhost para permitir
// testar com as sitekeys de teste da Cloudflare.
const allowedHostnamesRaw = process.env.TURNSTILE_ALLOWED_HOSTNAMES || (isProd ? '' : 'localhost')
export const allowedHostnames = allowedHostnamesRaw
  .split(',')
  .map(h => h.trim())
  .filter(Boolean)

// Bloqueio explícito: chave de teste da Cloudflare não pode validar nada em produção.
if (isProd && secretKey && CLOUDFLARE_TEST_SECRET_KEYS.has(secretKey)) {
  throw new Error(
    '[anti-bot] TURNSTILE_SECRET_KEY está configurada com uma chave de TESTE da Cloudflare. ' +
    'Isso nunca pode ir para produção — configure a chave secreta real do widget.'
  )
}

export const antiBotConfig = {
  secretKey,
  siteKey,
  allowedHostnames,
  // Timeout da chamada ao siteverify — curto de propósito, não deve travar a request
  // nem manter transação de banco aberta esperando a Cloudflare responder.
  timeoutMs: parsePositiveInt(process.env.TURNSTILE_TIMEOUT_MS, 5_000),
  // Limiar/janela do desafio adaptativo de login (seção 3 do pedido): 3 falhas em 15min
  // por padrão, configurável por ambiente.
  loginChallengeThreshold: parsePositiveInt(process.env.ANTI_BOT_LOGIN_CHALLENGE_THRESHOLD, 3),
  loginChallengeWindowMs: parsePositiveInt(process.env.ANTI_BOT_LOGIN_CHALLENGE_WINDOW_MS, 15 * 60_000),
  isConfigured: Boolean(secretKey && siteKey),
} as const
