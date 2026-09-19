import { NextResponse } from 'next/server'

interface Window {
  count:     number
  resetAt:   number
}

// In-memory store — works per serverless instance.
// For multi-region scale-out, replace with Upstash Redis.
const store = new Map<string, Window>()

// Prune expired entries every ~5 min to avoid unbounded growth
let lastPrune = Date.now()
function maybePrune() {
  const now = Date.now()
  if (now - lastPrune < 5 * 60_000) return
  lastPrune = now
  for (const [key, win] of store) {
    if (win.resetAt < now) store.delete(key)
  }
}

export interface RateLimitOptions {
  /** Unique key identifying the caller (user ID or IP) */
  key:      string
  /** Max requests allowed within the window */
  limit:    number
  /** Window duration in milliseconds */
  windowMs: number
}

export interface RateLimitResult {
  allowed:    boolean
  remaining:  number
  resetAt:    number
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  maybePrune()
  const now = Date.now()
  const win = store.get(key)

  if (!win || win.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  win.count++
  const remaining = Math.max(0, limit - win.count)
  return { allowed: win.count <= limit, remaining, resetAt: win.resetAt }
}

/** Returns a 429 NextResponse with Retry-After header, or null if allowed. */
export function rateLimitResponse(result: RateLimitResult): NextResponse | null {
  if (result.allowed) return null
  const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000)
  return NextResponse.json(
    { error: 'Too many requests. Try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After':       String(retryAfterSec),
        'X-RateLimit-Limit': String(0),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    },
  )
}

/** Helper: get real IP from Next.js request headers */
export function getClientIp(req: { headers: { get(key: string): string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

// ── Escalating lockout (auth brute-force) ──────────────────────────────────
// Separate in-memory store from the fixed-window `store` above — tracks
// consecutive failures per key (e.g. per-account email) and escalates the
// lockout duration the more it happens. Independent of checkRateLimit, so it
// cannot affect any of that function's existing call sites.

interface FailureWindow {
  count:       number
  lockedUntil: number
  lastFailAt:  number
}

const failureStore = new Map<string, FailureWindow>()

// Keys are derived from attacker-controlled input (the email in a login attempt), so
// without pruning an attacker could grow this map unboundedly by trying many distinct
// fake emails — evict entries that have been quiet for a day, well past the longest lockout.
let lastFailurePrune = Date.now()
function maybePruneFailures() {
  const now = Date.now()
  if (now - lastFailurePrune < 5 * 60_000) return
  lastFailurePrune = now
  for (const [key, win] of failureStore) {
    if (now - win.lastFailAt > 24 * 60 * 60_000) failureStore.delete(key)
  }
}

// { consecutive failures at/above this count → lock for this long }
// evaluated from highest to lowest threshold.
const LOCKOUT_STEPS = [
  { threshold: 20, lockMs: 60 * 60_000 }, // 20+ fails → 60 min
  { threshold: 10, lockMs: 15 * 60_000 }, // 10+ fails → 15 min
  { threshold: 5,  lockMs: 60_000 },      //  5+ fails → 1 min
]

export interface LockoutResult {
  locked:        boolean
  retryAfterSec: number
}

/** Checks whether `key` is currently locked out. Does not itself count a failure. */
export function checkLockout(key: string): LockoutResult {
  const win = failureStore.get(key)
  if (!win || win.lockedUntil < Date.now()) return { locked: false, retryAfterSec: 0 }
  return { locked: true, retryAfterSec: Math.ceil((win.lockedUntil - Date.now()) / 1000) }
}

/** Records one failed attempt for `key`, escalating the lockout if thresholds are crossed. */
export function recordAuthFailure(key: string): void {
  maybePruneFailures()
  const now = Date.now()
  const win = failureStore.get(key) ?? { count: 0, lockedUntil: 0, lastFailAt: now }
  win.count++
  win.lastFailAt = now
  const step = LOCKOUT_STEPS.find(s => win.count >= s.threshold)
  if (step) win.lockedUntil = now + step.lockMs
  failureStore.set(key, win)
}

/** Clears failure history for `key` — call on successful auth. */
export function clearAuthFailures(key: string): void {
  failureStore.delete(key)
}
