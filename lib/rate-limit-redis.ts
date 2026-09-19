import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export async function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now()
  const resetAt = now + windowMs

  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, Math.ceil(windowMs / 1000))
  }

  const remaining = Math.max(0, limit - count)
  return { allowed: count <= limit, remaining, resetAt }
}

export function rateLimitResponse(result: RateLimitResult): NextResponse | null {
  if (result.allowed) return null
  const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000)
  return NextResponse.json(
    { error: 'Too many requests. Try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(0),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    },
  )
}

export function getClientIp(req: { headers: { get(key: string): string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

// Auth lockout escalation
interface FailureWindow {
  count: number
  lockedUntil: number
}

const LOCKOUT_STEPS = [
  { threshold: 20, lockMs: 60 * 60_000 },
  { threshold: 10, lockMs: 15 * 60_000 },
  { threshold: 5, lockMs: 60_000 },
]

export interface LockoutResult {
  locked: boolean
  retryAfterSec: number
}

export async function checkLockout(key: string): Promise<LockoutResult> {
  const data = await redis.get<FailureWindow>(key)
  if (!data || data.lockedUntil < Date.now()) {
    return { locked: false, retryAfterSec: 0 }
  }
  return { locked: true, retryAfterSec: Math.ceil((data.lockedUntil - Date.now()) / 1000) }
}

export async function recordAuthFailure(key: string): Promise<void> {
  const now = Date.now()
  const data = await redis.get<FailureWindow>(key)
  const win = data || { count: 0, lockedUntil: 0 }
  win.count++

  const step = LOCKOUT_STEPS.find(s => win.count >= s.threshold)
  if (step) win.lockedUntil = now + step.lockMs

  await redis.setex(key, 24 * 60 * 60, JSON.stringify(win))
}

export async function clearAuthFailures(key: string): Promise<void> {
  await redis.del(key)
}
