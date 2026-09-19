# DDOS_RESPONSE.md — LOBBY

Operational runbook, scoped to what's actually true of this stack: Next.js on Vercel +
Supabase, **no Cloudflare/AWS WAF configured today**. If you add one later, the steps below
gain an extra "toggle it in the dashboard" option — noted where relevant.

## Before anything: what you actually have access to right now

- **Vercel dashboard** → your project → Observability tab: live request volume, status
  code breakdown, per-route latency. This is your primary signal today.
- **Supabase dashboard** → Auth → Logs, and Database → Logs: auth failures, slow queries,
  connection counts.
- **`auth_rate_limit_events` table** (once the migration in §5 of SECURITY.md is applied):
  query it directly for a spike in `login_fail`/`admin_login_fail`/`forgot_password_block`
  rows, grouped by `ip` or `email`.

## Ataque pequeno (elevated error rate, no real impact)

Symptoms: 429s/401s ticking up in Vercel logs, site still responsive.

1. Check Vercel's Observability tab for which route is being hit.
2. Query `auth_rate_limit_events` for the top offending IPs/emails in the last hour.
3. The app-level rate limits (`lib/rate-limit.ts`) are already absorbing this — no action
   usually required. Confirm the limits aren't also blocking real users (check for a
   legitimate account among the flagged emails before assuming it's malicious).

## Ataque moderado (site slow, elevated 5xx, DB connections climbing)

1. Supabase dashboard → Database → check active connection count against your plan's pool
   limit. If near the limit, this is likely the bottleneck, not the app.
2. Identify the hot endpoint from Vercel logs. If it's an unauthenticated route
   (`/api/auth/*`, `submitContact`), the in-memory rate limiter is doing what it can per
   warm instance, but a distributed attack across many Vercel regions can still get through
   more than the nominal limit — this is the known gap documented in SECURITY.md §2.1.
3. **Fastest real mitigation without new infra**: temporarily tighten the limits in
   `lib/rate-limit.ts` call sites (lower `limit`, e.g. 2/min instead of 5/min on login) and
   redeploy — this is a one-line change per route, fast to ship.
4. If you have a domain you can point through Cloudflare on short notice: enabling
   Cloudflare in front of Vercel (proxy mode) gives you an emergency "Under Attack Mode"
   toggle and IP-level blocking without touching this codebase. This is not pre-configured
   — it's a same-day setup if you don't already have the domain on Cloudflare.

## Ataque grande (site down or effectively unusable)

1. Vercel has platform-level DDoS mitigation for volumetric attacks — if the site is fully
   down from L3/L4 volume, this is largely Vercel's mitigation to invoke; check Vercel's
   status page and open a support ticket if their protection isn't holding (this is outside
   what any code change here can fix).
2. If it's L7 (application-layer flood on a specific route rather than raw volume): disable
   the targeted route entirely as a stopgap. For auth routes, you can flip
   `checkRateLimit`'s limit to an extremely low value (e.g. `limit: 1`) or short-circuit the
   route to return 503 immediately, buying time to diagnose.
3. Rotate `SUPABASE_SERVICE_ROLE_KEY` if there's any suspicion the attack is paired with a
   credential leak (see "Comprometimento de credenciais" below) — a flood is sometimes cover
   for something else.

## Indisponibilidade do banco (Supabase down or connection-exhausted)

1. Supabase dashboard → Database → Connection Pooling — confirm the app is using the
   pooler (`pooler-url` in `supabase/.temp/`), not direct connections, for serverless
   compatibility.
2. If connections are exhausted by legitimate load rather than attack: this is a scaling
   conversation with Supabase (upgrade plan / dedicated pooler), not a code fix.
3. If Supabase itself is down: nothing in this app can work around that — Auth and DB are
   both Supabase-hosted. Check Supabase's status page.

## Vazamento do IP de origin

Not applicable in the traditional sense — this is a serverless Vercel deployment with no
fixed origin IP to leak or protect. If you later put a VPS or dedicated origin behind
Cloudflare, this section needs rewriting to cover origin allowlisting (Cloudflare IP ranges
only, via your host's firewall/security groups) — not relevant to the current architecture.

## Comprometimento de credenciais (leaked service-role key, Stripe key, or user account)

1. **Supabase service role key**: Supabase dashboard → Settings → API → regenerate the
   service role key immediately. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel's environment
   variables and redeploy. This key bypasses RLS — treat any suspected leak as urgent.
2. **Stripe secret key**: Stripe dashboard → Developers → API keys → roll the key. Update
   `STRIPE_SECRET_KEY` in Vercel and redeploy. Also rotate `STRIPE_WEBHOOK_SECRET` if the
   webhook endpoint itself is suspected compromised.
3. **A specific user account** (client or technician): Supabase dashboard → Authentication →
   find the user → "Send password recovery" or force sign-out of all sessions. For a
   technician account, also check `is_leader` — if a leader account is compromised, treat it
   as elevated-privilege and consider rotating the service role key too, since leader
   Server Actions use it.
4. After any secret rotation: check `auth_rate_limit_events` and Supabase Auth logs for the
   period the credential may have been exposed, looking for unusual login patterns tied to
   the affected account/IP.

## After any incident

- Log what happened, when, and what was changed, in this file's git history (commit
  messages) or wherever your team tracks incidents — there's no dedicated incident-log
  table in this app today.
- Re-check whether the rate limits that helped (or the ones that were too permissive)
  should change permanently, not just during the incident.
