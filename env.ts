import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY:  z.string().min(1),
    STRIPE_SECRET_KEY:          z.string().startsWith('sk_'),
    STRIPE_WEBHOOK_SECRET:      z.string().startsWith('whsec_').optional(),
    RESEND_API_KEY:             z.string().startsWith('re_').optional(),
    RESEND_FROM_EMAIL:          z.string().email().optional(),
    ZAPI_INSTANCE_ID:           z.string().optional(),
    ZAPI_TOKEN:                 z.string().optional(),
    LEADER_WHATSAPP_PHONES:     z.string().optional(),
    // Anti-bot (Cloudflare Turnstile) — opcional de propósito: ver docs/ANTI-BOT.md.
    // Validação de runtime (bloqueio de chave de teste em produção, 503 se ausente
    // em rota protegida) vive em lib/anti-bot/config.ts, não aqui.
    TURNSTILE_SECRET_KEY:                 z.string().min(1).optional(),
    TURNSTILE_ALLOWED_HOSTNAMES:          z.string().optional(),
    TURNSTILE_TIMEOUT_MS:                 z.string().optional(),
    ANTI_BOT_LOGIN_CHALLENGE_THRESHOLD:   z.string().optional(),
    ANTI_BOT_LOGIN_CHALLENGE_WINDOW_MS:   z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL:           z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY:      z.string().min(1),
    NEXT_PUBLIC_SITE_URL:               z.string().url(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
    NEXT_PUBLIC_SUPPORT_EMAIL:          z.string().email().optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:     z.string().min(1).optional(),
  },
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY:          process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY:                  process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET:              process.env.STRIPE_WEBHOOK_SECRET,
    RESEND_API_KEY:                     process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL:                  process.env.RESEND_FROM_EMAIL,
    ZAPI_INSTANCE_ID:                   process.env.ZAPI_INSTANCE_ID,
    ZAPI_TOKEN:                         process.env.ZAPI_TOKEN,
    LEADER_WHATSAPP_PHONES:             process.env.LEADER_WHATSAPP_PHONES,
    TURNSTILE_SECRET_KEY:                process.env.TURNSTILE_SECRET_KEY,
    TURNSTILE_ALLOWED_HOSTNAMES:         process.env.TURNSTILE_ALLOWED_HOSTNAMES,
    TURNSTILE_TIMEOUT_MS:                process.env.TURNSTILE_TIMEOUT_MS,
    ANTI_BOT_LOGIN_CHALLENGE_THRESHOLD:  process.env.ANTI_BOT_LOGIN_CHALLENGE_THRESHOLD,
    ANTI_BOT_LOGIN_CHALLENGE_WINDOW_MS:  process.env.ANTI_BOT_LOGIN_CHALLENGE_WINDOW_MS,
    NEXT_PUBLIC_SUPABASE_URL:           process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL:               process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPPORT_EMAIL:          process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:     process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },
  skipValidation: process.env.NODE_ENV === 'development' && process.env.SKIP_ENV_VALIDATION === 'true',
})
