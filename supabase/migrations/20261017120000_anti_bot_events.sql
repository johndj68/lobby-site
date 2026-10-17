-- Observability for the anti-bot (Cloudflare Turnstile) layer that sits in front of
-- register/login/forgot-password/resend-confirmation. Mirrors the access pattern of
-- auth_rate_limit_events (20260823160000): write-only via service_role (server-side
-- route handlers, lib/anti-bot/log.ts), RLS default-deny blocks anon/authenticated.
--
-- Deliberately stricter on PII than auth_rate_limit_events: stores a truncated SHA-256
-- of the normalized e-mail (email_hash), never the raw address, since this table exists
-- purely for abuse/availability signal, not account lookup. Never stores the Turnstile
-- token/response, challenge secrets, or form field contents.
--
-- Not applied automatically — same convention as every other migration in this repo
-- (see SECURITY.md §5). Apply with `npx supabase db push` when ready.
create table if not exists public.anti_bot_events (
  id             bigint generated always as identity primary key,
  operation      text not null check (operation in (
    'register', 'login', 'forgot_password', 'resend_confirmation'
  )),
  event_type     text not null check (event_type in (
    'challenge_required', 'verify_passed', 'verify_failed', 'provider_unavailable'
  )),
  failure_reason text,
  email_hash     text,
  ip             text not null,
  latency_ms     integer,
  created_at     timestamptz not null default now()
);

create index if not exists anti_bot_events_created_at_idx
  on public.anti_bot_events (created_at desc);
create index if not exists anti_bot_events_operation_idx
  on public.anti_bot_events (operation, event_type);

alter table public.anti_bot_events enable row level security;
-- Nenhuma policy criada de propósito: RLS default-deny já bloqueia anon/authenticated.
-- Apenas o client admin (service_role, lib/supabase-admin.ts) lê/escreve esta tabela.

-- Retention: no automated purge configured in this repo (same gap as
-- auth_rate_limit_events — no pg_cron job exists here today). If this table's volume
-- ever becomes a concern, add a scheduled `delete from anti_bot_events where created_at
-- < now() - interval '90 days'` — not added speculatively here.
