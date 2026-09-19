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
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL:           z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY:      z.string().min(1),
    NEXT_PUBLIC_SITE_URL:               z.string().url(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
    NEXT_PUBLIC_SUPPORT_EMAIL:          z.string().email().optional(),
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
    NEXT_PUBLIC_SUPABASE_URL:           process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL:               process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPPORT_EMAIL:          process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  },
  skipValidation: process.env.NODE_ENV === 'development' && process.env.SKIP_ENV_VALIDATION === 'true',
})
