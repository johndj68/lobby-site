# SECURITY.md — LOBBY

Status as of 2026-08-23. This document describes what is **actually implemented** in this
codebase and what is **infrastructure-level, external to this repo** (Cloudflare/AWS
account settings, Supabase dashboard settings). It intentionally does not claim protections
that don't exist here — no system is "100% protected."

## 1. Architecture

```
Browser
  │
  ▼
Vercel Edge Network            ← platform-level DDoS/L3-L4 mitigation (Vercel's responsibility,
  │                               not configured in this repo)
  ▼
Next.js 16 (App Router)
  │  proxy.ts — auth-role routing (client vs technician areas)
  ▼
Route Handlers / Server Actions ← rate limiting + auth checks live here (this repo)
  │
  ▼
Supabase (Postgres + Auth + Storage) ← RLS policies, platform-level auth rate limits
  │
  ▼
Stripe / Resend / Z-API (external services, called server-side only)
```

There is no self-hosted reverse proxy, container orchestration, or on-prem server in this
stack — it's serverless (Vercel) + managed Postgres/Auth (Supabase). Sections below are
grouped by what's implemented here vs. what requires action outside this repo.

## 2. Implemented in this codebase (Phase 1)

### 2.1 Auth brute-force / credential-stuffing protection

Login, admin login, register, and forgot-password used to call `supabase.auth.*` directly
from the browser — no app code sat in front of that, so no rate limit was possible (an
attacker can always call Supabase's REST API directly, bypassing any client-side code).
These now go through server-side Route Handlers:

- `app/api/auth/login/route.ts`
- `app/api/auth/admin-login/route.ts`
- `app/api/auth/register/route.ts`
- `app/api/auth/forgot-password/route.ts`

| Flow | IP limit | Account limit | Escalating lockout |
|---|---|---|---|
| Login | 5/min | 20/hour | Yes — 5 fails →1min, 10→15min, 20→60min (per account) |
| Admin login | 5/min | 20/hour | Yes, same steps |
| Register | 3/10min, 10/day | — (Supabase's duplicate-email error is the guard) | No |
| Forgot password | 3/10min | 3/hour | No — fails **open** (see below) |

Forgot-password deliberately never returns a 429: when throttled, it silently skips sending
the reset email but still returns `{ok:true}` — identical to a normal accepted request. This
preserves Supabase's anti-enumeration property (never reveal whether an email exists) and
avoids a worse UX/security signal than a silent no-op.

Failed logins and forgot-password blocks are logged to `auth_rate_limit_events`
(migration `20260823160000_auth_rate_limit_events.sql`, **not yet applied** — see §5).
RLS is default-deny; only the service-role client can read/write it. No passwords or
tokens are ever logged.

`UpdatePasswordForm.tsx` (the post-reset-link flow) is unchanged in this phase — it's gated
by a single-use emailed token, a different threat model than a guessable password, and the
only way to generate more tokens is `forgot-password`, which is now rate-limited.

**Known gap**: the rate limiter (`lib/rate-limit.ts`) is in-memory, scoped to one warm
Vercel serverless instance. It is not a hard guarantee across cold starts or multiple
regions — it's a defense-in-depth layer under Supabase's own platform-level auth rate
limits, not a replacement for them. See §6 for the Upstash Redis upgrade path if traffic
ever justifies it.

### 2.2 Server Action rate limiting

- `createTechnician` (`app/admin/equipe/actions.ts`) — 10 accounts/hour per leader.
- `sendContactResponse` (`app/admin/solicitacoes/actions.ts`) — 30 emails/hour per
  technician (this action sends arbitrary-content email to arbitrary recipients on every
  call; previously unlimited).

### 2.3 Upload hardening

- `lib/project-visuals-upload.ts` — the `kind` parameter (which selects size/type
  validation) was optional; two call sites (`CurrentPhaseEditor.tsx`) omitted it, silently
  skipping all validation. `kind` is now required, and both call sites pass it explicitly.
- `app/admin/arquivos/ArquivosClient.tsx` — the materials-upload input only checked file
  size; the `accept=".pdf,..."` attribute is a browser UI hint only, not enforced. Added a
  server-side-equivalent extension allowlist check matching the same list.
- **Residual gap, not closed in Phase 1**: both upload paths call the Supabase Storage API
  directly from the browser (no Route Handler in front), so there's no app-level rate limit
  on upload *volume* — only on individual file size/type. Both are behind
  technician-or-authenticated-client auth and Storage RLS, which substantially limits who
  can hit them, but a compromised session could still script repeated uploads. Flagged
  here rather than silently fixed, since closing it fully means moving uploads through a
  Route Handler (bigger change, same shape as the auth-flow rework in §2.1) — worth a
  Phase 2 if upload abuse becomes a real concern.

### 2.4 Headers / config

- `next.config.ts` already had a solid CSP, HSTS (prod-only), X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Added `poweredByHeader: false`.
- CSP's `script-src` still needs `'unsafe-inline' 'unsafe-eval'` for Next.js hydration —
  removing that requires a nonce-based CSP wired through `proxy.ts`, a separate, riskier
  effort not undertaken here (documented as a known trade-off, not silently left broken).

### 2.5 Secrets

- No hardcoded secrets found in source, `.env.example`, or test fixtures (confirmed by
  direct grep — only fake test values like `whsec_test`).
- `.env*` is correctly gitignored.
- `NEXT_PUBLIC_ADMIN_INVITE_CODE` (`env.ts`) is declared as a **public** (`NEXT_PUBLIC_*`)
  env var but named/intended as a secret gate for technician registration (per its comment
  in `.env.example` history) — and is **not referenced anywhere in the code**. It's dead
  config today, not an active vulnerability, but worth a decision: either wire it up
  server-side (never as `NEXT_PUBLIC_*`) or remove it. Left untouched pending that decision.

## 3. Explicitly NOT covered by this repo (external/account-level)

These require action in a hosting/CDN/WAF provider's dashboard or API — not code changes
here. Listed so nothing is silently assumed to be handled:

- **DDoS L3/L4 (SYN flood, UDP flood, volumetric)** — Vercel's edge network absorbs this at
  the platform level today. No Cloudflare/AWS Shield is configured. If added later
  (Cloudflare in front of Vercel is a common combo), see DDOS_RESPONSE.md for what changes.
- **WAF rules (SQLi/XSS/path traversal signatures, scanner blocking)** — none active beyond
  what Supabase's Postgres client/RLS and this app's own input handling provide. A managed
  WAF (Cloudflare, Vercel Firewall) would sit in front of this and needs its own setup.
- **Bot scoring / CAPTCHA (Turnstile, hCaptcha)** — not implemented. Supabase Auth supports
  wiring in CAPTCHA protection for signup/login from its dashboard (Authentication →
  Settings) without any code change here — recommended as a cheap next step.
- **MFA for admin accounts** — not implemented. Supabase Auth supports TOTP MFA
  (`auth.mfa.*`); adding it is a real feature (enrollment UI, verification step), not done
  in this pass.
- **IP allowlisting for `/admin/*`** — not implemented; requires static IPs from your team,
  which nobody has specified.
- **Origin lock / hiding the origin IP** — not applicable to a serverless Vercel deployment;
  there's no fixed origin IP to hide the way there would be with a VPS behind Cloudflare.
- **Kubernetes, Nginx, Prometheus/Grafana/Loki/ELK** — none of this infrastructure exists in
  this project. Nothing was fabricated here to pretend otherwise.

## 4. Endpoint audit

| Endpoint | Auth | Rate limit | Payload limit | Risk |
|---|---|---|---|---|
| `GET /api/health` | None (by design) | None | N/A | Low — no data exposed |
| `POST /api/auth/login` | N/A (this *is* auth) | 5/min IP, 20/hr acct, escalating lockout | JSON body, no explicit cap (Next default) | Medium → mitigated |
| `POST /api/auth/admin-login` | N/A (this *is* auth) | Same as login | Same | Medium → mitigated |
| `POST /api/auth/register` | N/A (public signup) | 3/10min + 10/day per IP | Same | Medium → mitigated |
| `POST /api/auth/forgot-password` | N/A (public, anti-enumeration by design) | 3/10min IP, 3/hr acct, fails open | Same | Low |
| `POST /api/notify/message` | `getUser()` + sender-match check | 20/min/user (pre-existing) | Small JSON | Low |
| `POST /api/notify/project` | `getUser()` + JWT role claim | 10/min/user (pre-existing) | Small JSON | Low |
| `POST /api/stripe/checkout` | `getUser()` | 5/min/user (pre-existing) | Small JSON | Low |
| `POST /api/stripe/webhook` | Stripe signature verification (not user auth) | None (signature is the gate) | Stripe-controlled | Low |
| Server Action `submitContact` | None (public contact form) | 3/10min per email (pre-existing, DB-based) | Form fields | Low |
| Server Action `createTechnician` | Leader-only | **New**: 10/hr per leader | Form fields | Medium → mitigated |
| Server Action `deleteTechnician` | Leader-only | None | N/A | Low (destructive but leader-gated, low frequency) |
| Server Action `sendContactResponse` | Technician-only | **New**: 30/hr per technician | Email body | Medium → mitigated |
| Server Action `startAnalysis` / `saveContactDraft` | Technician-only | None | Form fields | Low |
| Server Action `deleteContact` | Leader-only | None | N/A | Low (leader-gated, archived-only) |
| Server Action `respondToApproval` / `respondToVisualApproval` | Client-owns-project check | None | Form fields | Low |
| Upload: `uploadProjectVisual` | Authenticated (client Supabase call) | None (see §2.3) | Size + type enforced (now non-bypassable) | Low-Medium |
| Upload: `ArquivosClient` materials | Technician-only | None (see §2.3) | Size + type enforced (type check added) | Low-Medium |

"Mitigated" means the specific gap this audit found was closed; it does not mean the
endpoint is immune to abuse from a determined, well-resourced attacker.

## 5. Applying the pending migration

`supabase/migrations/20260823160000_auth_rate_limit_events.sql` was written but **not
applied** — pushing schema to the live project is treated as an action requiring your
explicit go-ahead. To apply it:

```bash
npx supabase db push
```
(project is already linked — `supabase/.temp/project-ref` shows `miugjafzptsdqzzgkbea`).

## 6. If traffic ever justifies it: Upstash Redis upgrade

`lib/rate-limit.ts`'s public shape (`checkRateLimit({key, limit, windowMs})`) was kept
stable specifically so this swap requires zero call-site changes later: if
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are ever set, the internal
implementation can delegate to `@upstash/ratelimit`'s sliding-window limiter instead of the
in-memory `Map`, giving durable cross-instance/cross-region limiting. Not done now — this is
a small-traffic site, and Supabase's own platform-level rate limits are a real backstop
underneath the in-memory limiter regardless of which Vercel instance serves a request.

## 7. Incident response — see DDOS_RESPONSE.md

For step-by-step "what do I actually do" during an incident (traffic spike, credential
stuffing wave, suspected origin compromise), see `DDOS_RESPONSE.md`.

## 8. Phase 2 — 2026-08-26 audit

Full-repo security pass (secrets scan, RLS/grant audit across all migrations, service-role
usage, auth checks on every Server Action/Route Handler, XSS/injection surface, `select('*')`
exposure, storage policies). Two critical findings, both the same bug class as §5's
`get_or_create_wallet`/`add_credits` fix (`20260717152249`): `revoke execute ... from
authenticated, anon` does **not** remove the implicit `EXECUTE` grant every new Postgres
function gets for role `PUBLIC` — must revoke from `PUBLIC` explicitly.

- **`confirm_credit_purchase_webhook`** (`20260720120000`) — comment claimed service-role-only,
  but only revoked from `authenticated`/`anon`, never `PUBLIC`. Any authenticated user could
  call it directly via `.rpc()` to mark any pending credit purchase as paid, mint credits to
  themselves, and write a fake `financial_transactions` row — bypassing Stripe entirely. Fixed
  in `20260826120000_fix_rpc_public_grant_gaps.sql` (explicit `revoke ... from public`).
- **`get_thread_summaries`** (`20260720150000`) — never had any revoke, only an additive
  `grant ... to authenticated`. SECURITY DEFINER, bypasses RLS on `messages`/`profiles`/
  `client_projects`, called directly from a `'use client'` component
  (`app/admin/mensagens/MensagensClient.tsx`) — not behind a route handler. Any authenticated
  user (a client, not just a technician) could dump every client's name/email/company and
  every conversation's last-message preview. Fixed in the same migration: added an internal
  `is_technician(auth.uid())` check inside the function body (defense in depth, doesn't rely
  solely on the grant) and revoked from `PUBLIC`.

Also fixed (lower severity):
- `generateMetadata` in `app/dashboard/projetos/[id]/page.tsx` and
  `app/admin/clientes/[id]/page.tsx` queried Supabase via the admin client with no auth/
  ownership check — the page body's session guard doesn't cover `generateMetadata`, so a
  project title / client name+email leaked via the `<title>` tag to unauthenticated or
  wrong-owner requests. Both now check the caller's session (and, for the admin one,
  leader role) before querying, falling back to a generic title otherwise.
- `app/recursos/page.tsx` (public, unauthenticated page) did `select('*')` on
  `resource_metadata`, which has a public `using(true)` SELECT policy — returned internal
  columns (`protected_file_path`, `payment_product_id`, `created_by`, `updated_by`) over the
  wire to anonymous visitors. Narrowed to the explicit columns the page actually uses.
- `supabase/.temp/` (Supabase CLI local metadata — project ref, pooler host) was not
  gitignored; added to `.gitignore`.

Like `20260823160000`, the new migration (`20260826120000_fix_rpc_public_grant_gaps.sql`) is
**written but not applied** — apply with `npx supabase db push` after review.

Follow-up pass, same day: also closed the 2 low-severity items originally left open.
- `app/api/notify/project/route.ts` didn't scope who could trigger a project notification —
  any technician could fire one for any project, not just their own. Now requires the caller
  to be the project's `lead_technician_id` or `is_leader=true` (same rule already enforced by
  `messages` RLS elsewhere).
- `NEXT_PUBLIC_ADMIN_INVITE_CODE` was dead config (declared, never read anywhere). Removed
  from `env.ts` — no behavior change since nothing referenced it.
- `__tests__/finance.test.ts`'s `período (30d)` test used hardcoded `2026-07-*` fixture dates
  assuming "now" was July 2026 — became a time bomb the moment the real clock passed into
  August. Rewritten to build fixture dates relative to `new Date()` (`daysAgo(n)` helper) so
  the test doesn't silently start failing again next month.

No hardcoded secrets, XSS, or SQL-injection surface found in this pass (see audit detail in
session history). Full per-table RLS review found no other outstanding `using(true)`/
`with check(true)` on private data and no other IDOR beyond the two RPC-grant gaps above.

## 9. Phase 3 — 2026-08-26, OWASP Top 10:2025 sweep

Broader pass covering categories Phases 1-2 didn't touch: SSRF, CSRF, open redirect, mass
assignment, webhook replay, Realtime authorization, cache/cross-user leakage, cookie config,
upload path traversal, dependency supply chain. SSRF, open redirect, mass assignment, upload
path traversal, and cache-leakage were all checked and found clean (no fix needed — see
audit detail in session history for the full inventory). Fixed:

- **`lib/supabase-admin.ts`** — added `import 'server-only'` (new `server-only` dependency).
  No `'use client'` file imported it (confirmed), but nothing previously stopped a future one
  from doing so and leaking `SUPABASE_SERVICE_ROLE_KEY` into the client bundle — this makes
  that a build failure instead of a hoped-for code-review catch.
- **Cookie config** — `lib/supabase-server.ts`, `lib/supabase.ts`, `proxy.ts` all called
  `@supabase/ssr` with no `cookieOptions`, so `secure` silently came from the library default
  (`false` in every environment — not conditional on production). Now explicit:
  `{ sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }` in all three. This is
  also the app's only CSRF defense (no CSRF token exists anywhere) — making it explicit turns
  an accidental default into a deliberate, documented control.
- **`app/contato/actions.ts` (`submitContact`)** — the existing rate limit was keyed purely on
  the attacker-supplied `email` field (DB count of `contacts` rows), trivially bypassed by
  rotating the email on each submission. Added an IP-based `checkRateLimit` (5/10min) as a
  backstop that doesn't depend on any client-controlled field — this endpoint is public,
  unauthenticated, and sends email + WhatsApp (Resend/Z-API quota, leader inboxes).
- **`app/api/stripe/webhook/route.ts`** — `confirm_credit_purchase_webhook`'s idempotency
  (row lock + status check) already prevented double-crediting on Stripe event redelivery, but
  nothing prevented the receipt email from being re-sent on every redelivery. Now reads the
  purchase's status *before* calling the RPC and skips the email if it was already `'paid'`.
- **Realtime Presence authorization (typing indicator channels) — attempted, blocked, reverted.**
  `typing:<client_id>:<project_id|general>` channels have zero authorization: Realtime only
  auto-enforces RLS for `postgres_changes`, not Presence/Broadcast — any authenticated user
  (client or technician) who knew/guessed another conversation's `client_id`+`project_id` could
  join its Presence channel. Wrote `supabase/migrations/20260826130000_typing_channel_authorization.sql`
  (RLS policy on `realtime.messages`, same access rule as `messages` table RLS) and set both
  `MensagensClient.tsx` channels to `{config:{private:true}}` to enforce it.
  **`db push` on 2026-08-26 rejected this migration**: `ERROR: must be owner of table messages
  (SQLSTATE 42501)` on `alter table realtime.messages enable row level security` — the
  connecting role for this project isn't an owner of `realtime.messages` (internal
  Supabase-managed schema), so neither `ALTER TABLE` nor `CREATE POLICY` on it succeed via
  `db push`. Transaction rolled back cleanly — nothing partially applied. Since shipping
  `private:true` without the matching policy would deny the channel to everyone (fails closed,
  but breaks the feature), **the client-side `private:true` change was reverted** — both
  channels are back to their original (unauthorized but working) state. The migration file is
  left in `supabase/migrations/` as a known-blocked pending item, not applied.
  **What this actually needs**: either (a) Supabase support grants the project's `postgres`
  role membership in `supabase_realtime_admin` (or whichever role owns `realtime.messages` on
  this project), or (b) running the same `CREATE POLICY` statements from the Supabase
  Dashboard's SQL Editor, which on some projects executes under a role with different/broader
  grants than the CLI's migration connection — worth trying before opening a support ticket.
  Once either path works, re-apply the same policy + flip both channels back to `private:true`
  in the same deploy, and smoke-test the typing indicator (as a client and as a technician, on
  a project thread and the general thread) before considering it done. Residual risk in the
  meantime: the UUID-guessing exposure described above remains open.
- **`package.json`** — `shadcn` (a CLI tool, `npx shadcn add ...`, never imported by app code)
  was listed under `dependencies` instead of `devDependencies`, which pulled ~8 transitive
  vulnerabilities from its MCP-SDK/codemod toolchain into every `npm audit --omit=dev`
  production scan as false-positive noise. Moved to `devDependencies`. Also bumped
  `next` 16.2.6→16.3.3 and `eslint-config-next` to match (same major version, not a breaking
  bump) — fixes 8 high-severity advisories in `next`/`sharp`/`postcss` that had non-forced
  fixes available. Ran plain `npm audit fix` (no `--force`) afterward, which cleared the
  remaining `nanoid` (build-time-only, transitive of Tailwind's PostCSS plugin) finding.
  `npm audit --omit=dev` now reports **0 vulnerabilities** (was 13).

Checked and found clean, no fix needed: SSRF (no outbound fetch target is ever built from user
input — Z-API/Stripe/Resend calls all go to fixed hosts), open redirect (every redirect target
in the codebase is a hardcoded literal, no `?redirect=`-style param is ever read), mass
assignment (every `.update()`/`.insert()` call site uses an explicit field-by-field object,
none spread a request body), upload path traversal (both upload paths sanitize filenames to
`[a-zA-Z0-9._-]` before hitting Storage — no `/`, `\`, or null byte can survive), cache/cross-
user leakage (no page declares static caching; every dashboard/admin page is force-dynamic via
its own `cookies()` call, no explicit `dynamic = 'force-dynamic'` backstop exists but none is
currently needed).

## 10. Phase 4 — 2026-08-27, live-database re-verification

Previous phases audited by reading migration *source files* and trusting their evident intent.
This pass queried the **live production database directly** (`pg_policies`, `pg_proc` +
`has_function_privilege`, `information_schema.role_table_grants`, `storage.buckets`) via the
Supabase Management API — ground truth instead of "the SQL probably did what the comment says
it did." This caught 3 real gaps none of the previous read-the-file passes found:

- **`messages_insert` RLS: cross-client project injection (real bug, not theoretical).**
  `supabase/migrations/20260715061134_chat_per_project.sql:51` had
  `where cp.id = project_id and cp.client_id = client_id` inside an `EXISTS` against
  `client_projects cp` — since `client_projects` also has a `client_id` column, Postgres
  resolves the unqualified `client_id` on the right-hand side to the *innermost* scope
  (`cp.client_id`), not the outer `messages.client_id` the comment clearly intended. The stored,
  resolved policy was `cp.client_id = cp.client_id` — a tautology, always true for any real
  project. **Verified live with zero real data touched** (pure literal-value `WITH ... VALUES`
  query, see session log): old pattern returned `true` for a deliberately mismatched
  owner/project pair; the corrected pattern (`cp.client_id = messages.client_id`) returned
  `false` for the mismatch and `true` for the real owner. Practical impact: an authenticated
  client could insert a message row (`client_id` = themselves, required by a separate clause)
  tagged with **another client's `project_id`**, injecting it into that project's thread as
  seen by its lead technician — not a confidentiality leak (the attacker gains no read access
  to the other client's data), but a real integrity/spoofing hole. Fixed in
  `supabase/migrations/20260827100000_fix_messages_insert_ownership_check.sql`. **Applied and
  confirmed live** — `pg_policies` now shows the corrected qualified comparison.
- **`get_thread_summaries` and `spend_credits`: `revoke ... from public` alone still wasn't
  enough, confirmed live.** This is the *third* occurrence of the exact bug class this project
  has now hit (`get_or_create_wallet`/`add_credits` → `20260717152249`;
  `confirm_credit_purchase_webhook` → `20260826120000`): Supabase's schema-level default
  privileges grant `EXECUTE` directly to `anon`/`authenticated` at function-creation time,
  *separately* from the implicit `PUBLIC` grant — revoking from `PUBLIC` doesn't touch that
  separate explicit grant. Querying `has_function_privilege('anon', ...)` directly showed
  `get_thread_summaries` was still `anon`-executable (blocked in practice only by its internal
  `is_technician(auth.uid())` check, so no live data leak — but grant hygiene was still wrong)
  and `spend_credits` was still executable by **both** `anon` and `authenticated` (SECURITY.md's
  own §5 claimed this had been closed by defense-in-depth in `20260717152249` — that migration
  only ran `revoke ... from public`, never the `anon, authenticated` revoke it needed). Fixed in
  `supabase/migrations/20260827110000_grant_hardening.sql`, confirmed nested internal calls
  (`redeem_credits_for_ebook`/`redeem_credits_for_project` → `spend_credits`) still work since
  all three share the same owning role. **Applied and confirmed live** via
  `has_function_privilege` — both now `anon_exec: false`; `spend_credits` also
  `authenticated_exec: false`.
- **`TRUNCATE` grant on every `public` table, `anon` and `authenticated`.** Standard Supabase
  default provisioning (not a misconfiguration introduced by this app), but `TRUNCATE` is
  never used by PostgREST/`supabase-js` and — unlike `SELECT`/`INSERT`/`UPDATE`/`DELETE` — is
  **not gated by RLS at all** in Postgres. Revoked from all public tables as pure least-privilege
  hardening in the same migration. **Applied and confirmed live** — 0 tables now grant it to
  either role.

Also re-verified live and found correct (no action needed): RLS is enabled on all 19 `public`
tables including `typing_status`; all `typing_status` policies match intent exactly as written;
all four Storage buckets and their `storage.objects` policies match the Phase-1 analysis with no
drift; `add_credits`/`get_or_create_wallet`/`confirm_credit_purchase_webhook` remain fully
locked (`anon`/`authenticated`/`public` all false); every `SECURITY DEFINER` credit function that
relies on an internal `is_leader()`/ownership check (`confirm_credit_purchase`,
`cancel_credit_purchase`, `admin_adjust_credits`, `redeem_credits_for_ebook`,
`redeem_credits_for_project`) was read directly from `pg_proc.prosrc` (live source, not the
migration file) and each check is present and correct as documented. A regex scan of every
`public` schema policy's stored `qual`/`with_check` for the `alias.col = alias.col`
self-tautology pattern found exactly one match — the `messages_insert` bug above, now fixed;
no other instance of this bug class exists in the current policy set.

Local build/lint/typecheck/test suite re-run after this phase with no app-code changes (SQL-only
migrations): unchanged from Phase 3 — 0 lint errors (2 known `<img>` warnings), 0 typecheck
errors, 260/260 tests, 0/0 build errors/warnings.

## 11. Phase 5 — 2026-08-27, authenticated DAST + full session-lifecycle test

This project had no staging environment — a single Supabase project served as both. Provisioned
a disposable staging Supabase project (`egmakuobfecmldhdpkgt`, org "LOBBY", free plan) with the
production schema reconstructed from live introspection (`pg_get_functiondef`/`pg_policies`/
`information_schema` — not migration replay, which turned out to have unrelated ordering bugs of
its own, see below), 4 disposable auth accounts, and 2 fixture projects. Ran ZAP 2.16.1
(standalone, no Docker available in this environment) for a passive baseline, and a custom Node
test harness (`scripts/dast-session-tests.mjs`) directly against staging's real Supabase Auth +
PostgREST for the session/authorization matrix — 37 tests across isolation (IDOR), token expiry,
logout/reuse, blocked user, password change, concurrent sessions, cookie tampering, refresh token
reuse, and admin role removal. Full results: `zap/reports/session-tests-results.json`.

**34/37 conform.** All app-level and RLS-level authorization checks held: no cross-client IDOR
(read/write/delete), no self-promotion to technician, no direct RPC privilege escalation, visitor
gets zero data everywhere, blocked users can't get new sessions or refresh existing ones, password
change correctly invalidates the changed session's old credentials, refresh-token rotation works
for the legitimate case, and — the specific check ETAPA 16 asked for — RLS re-queries
`profiles.is_leader` on **every** request rather than trusting a cached JWT claim, so a
demoted admin loses access immediately at the database layer even while still holding their old
token. Cookie tampering (missing/malformed/truncated/duplicate/oversized) all failed safely: 307
redirect to login or 431 (header too large), never a 500 or a stack trace.

**3 real findings**, all confirmed with isolated raw-HTTP tests (not just the harness) to rule out
test-script artifacts:

- **PostgREST does not enforce access-token expiry on this project.** GoTrue's own
  `/auth/v1/user` correctly rejects an expired token (`403 bad_jwt: token is expired`), but the
  *same* expired token against `/rest/v1/*` (what every `.from()` call and RLS check goes through)
  returned `200` with real data, well past the token's `exp`. This is Supabase-managed
  infrastructure (PostgREST's own JWT verification), not something fixable via app code or a
  migration. **Practical impact is bounded, not critical**: every Server Action and Route Handler
  in this app already calls `getUser()` (which hits GoTrue, confirmed correctly enforcing
  expiry) before doing anything sensitive — the app's own request paths were never exposed. The
  gap only matters for someone calling the public Supabase REST API *directly* with a leaked
  access token (already possible in any Supabase project by design via the public anon key — this
  finding removes the *time-box* on that, not the RLS boundary itself, which held in every test).
- **Refresh-token reuse detection did not revoke the token family.** `security_refresh_token_reuse_interval`
  is configured to 10s (reuse within that window is correctly tolerated — legitimate
  retry/clock-skew handling). Reusing an already-rotated refresh token *outside* that window
  should, per Supabase's documented rotation model, revoke the entire token chain (including the
  legitimately-rotated replacement). Verified with raw `fetch` calls directly against
  `/auth/v1/token?grant_type=refresh_token` (bypassing supabase-js entirely) that this did not
  happen: the stale token was accepted late, and the legitimate rotated token kept working
  afterward too. Same category as the finding above — GoTrue-internal behavior, not
  app/migration-fixable.
- **`app/api/notify/project/route.ts` trusted `user.app_metadata.role` from the JWT claim**
  instead of re-querying `profiles.role` — a demoted technician's already-issued token would keep
  passing this specific check until the token naturally expired/refreshed (unlike every RLS
  policy in this project, which the ETAPA-16 test above confirmed re-checks the live DB row on
  every call). Low severity on its own — the endpoint only triggers a notification email/WhatsApp
  for a project, no data read/write — but it's the one finding in this phase that **was** fixable
  in app code, so it was: the route now queries `profiles.role`/`is_leader` fresh on every call,
  same pattern as the rest of the codebase. Regression tests added in
  `__tests__/notify-project.test.ts` (11/11 passing), including one that reproduces the exact
  stale-JWT-claim scenario DAST found.

**Manual/operational follow-up** (not code-fixable, flagged rather than silently left broken):
open a Supabase support inquiry about the first two findings — the actual behavior deviates from
Supabase's own documented model (JWT expiry enforcement at the Data API, refresh-token reuse
detection revoking the family) and may be specific to this project's PostgREST/GoTrue
version/config rather than expected behavior. Until resolved, treat any leaked access or refresh
token as dangerous for materially longer than its nominal `exp` would suggest — the guidance in
DDOS_RESPONSE.md's "Comprometimento de credenciais" section already says to rotate on any
suspected leak, which remains the correct response regardless of this gap.

**Residual/documented-by-design (not bugs)**: an access token issued before logout, a password
change, or a ban remains cryptographically valid (and — per the finding above — currently usable
against the Data API) until it naturally expires; Supabase does not revoke other devices' sessions
on password change by default. Both are standard JWT/Supabase behavior, not unique to this
project, and were explicitly called out as "document, don't silently accept" items rather than
bugs to fix.

Staging cleanup: left running (free tier, no cost) in case further verification is wanted —
`scripts/dast-seed-staging.mjs` recreates/resets the 4 test accounts idempotently.
`.env.staging.local` (gitignored) holds its credentials; `DAST_BASE_URL` etc. in `.env.example`
document the variable names with no values. `zap/dast-plan.yaml` is the reusable ZAP Automation
Framework plan (browser-based auth, 2 contexts, explicit exclusions for destructive/real-send
endpoints) for whenever a full authenticated ZAP crawl + active scan is wanted — this phase used
it as the exclusion/scope reference and ran the passive baseline + the direct session-test harness
in its place, since the latter gives exact protocol-level control (token capture, timed
expiry/reuse windows) that's awkward to express in ZAP itself.

Full pipeline re-run after the `notify/project` fix: 0 lint errors (2 known warnings), 0
typecheck errors, 260+/260+ tests passing (11/11 in the updated file), 0/0 build.
