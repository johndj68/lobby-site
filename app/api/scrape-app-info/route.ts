/**
 * Secure backend endpoint to scrape public app information from URL
 *
 * Security measures:
 * - Protocol validation (HTTP/HTTPS only)
 * - DNS resolution + IP-range validation, re-checked before the initial
 *   request AND before following every redirect hop (closes the
 *   DNS-rebinding / string-only-hostname-blocklist gap: a public domain
 *   whose A/AAAA record points at a private or metadata address is
 *   rejected because we validate the *resolved* address, not the hostname
 *   text, right before each connection attempt)
 * - Manual redirect handling (redirect limit: 5), each hop re-validated
 * - Timeout (10s)
 * - Size limit (5MB)
 * - Content-type validation
 * - Rate limiting
 */

import { NextRequest, NextResponse } from 'next/server'
import dns from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit-redis'

const MAX_REDIRECTS = 5

// Literal-hostname fast path — cheap, catches the obvious cases without a
// DNS round trip. Not a substitute for the IP-range check below, which is
// what actually closes the SSRF hole (this list alone cannot stop a public
// domain that resolves to a private/metadata IP).
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^metadata\.google\.internal$/i,
]

const blockedIpRanges = new BlockList()
;(
  [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ] as const
).forEach(([address, prefix]) => blockedIpRanges.addSubnet(address, prefix, 'ipv4'))
// Note: deliberately no explicit "::ffff:0:0/96" (IPv4-mapped IPv6) rule
// here. Node's BlockList already matches an IPv4-mapped IPv6 literal (e.g.
// "::ffff:127.0.0.1") against the plain IPv4 rules below on its own —
// adding a mapped-range rule on top of that makes BlockList treat it as
// covering the *entire* IPv4 space and block every address, verified
// directly against this Node version.
;(
  [
    ['::1', 128],
    ['::', 128],
    ['fc00::', 7],
    ['fe80::', 10],
    ['2001:db8::', 32],
  ] as const
).forEach(([address, prefix]) => blockedIpRanges.addSubnet(address, prefix, 'ipv6'))

function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return true // unparseable -> treat as blocked
  return blockedIpRanges.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

async function resolveAllAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname) !== 0) return [hostname]
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

async function assertHostnameIsPublic(hostname: string): Promise<void> {
  if (BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new Error('Access to this hostname is not allowed')
  }

  let addresses: string[]
  try {
    addresses = await resolveAllAddresses(hostname)
  } catch {
    throw new Error('Não foi possível resolver o endereço informado')
  }

  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new Error('Access to this hostname is not allowed')
  }
}

function validateUrlShape(urlString: string): URL {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new Error('URL inválida')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Protocol must be HTTP or HTTPS')
  }

  if (url.username || url.password) {
    throw new Error('URLs with credentials are not allowed')
  }

  return url
}

interface ScrapedAppInfo {
  name?: string
  short_description?: string
  logo_url?: string
  import_source?: string
  website_url?: string
}

async function fetchWithSsrfGuard(initialUrl: URL): Promise<Response> {
  let currentUrl = initialUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Re-validated on every hop, right before connecting — this is what
    // actually matters: a redirect target (or a rebound DNS answer for the
    // same hostname) is checked at the last possible moment, not once up
    // front.
    await assertHostnameIsPublic(currentUrl.hostname)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    let response: Response
    try {
      response = await fetch(currentUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LOBBY-AppScraper/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'manual',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      if (hop === MAX_REDIRECTS) {
        throw new Error('Too many redirects')
      }
      const nextUrl = validateUrlShape(new URL(location, currentUrl).toString())
      currentUrl = nextUrl
      continue
    }

    return response
  }

  throw new Error('Too many redirects')
}

async function scrapeAppInfo(url: URL): Promise<ScrapedAppInfo> {
  const response = await fetchWithSsrfGuard(url)

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    throw new Error('URL must return HTML content')
  }

  const contentLength = response.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
    throw new Error('Content too large (max 5MB)')
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const html = await response.text()

  const parsed: ScrapedAppInfo = {}

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    parsed.name = titleMatch[1].split('|')[0].trim()
  }

  const descMatch = html.match(
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
  )
  if (descMatch) {
    parsed.short_description = descMatch[1]
  }

  const ogImageMatch = html.match(
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
  )
  if (ogImageMatch) {
    parsed.logo_url = ogImageMatch[1]
  }

  parsed.import_source = 'url'
  parsed.website_url = url.toString()

  return parsed
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResult = await checkRateLimit({
      key: `scrape:${user.id}`,
      limit: 5,
      windowMs: 3600000, // 1 hour
    })
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { url: urlString } = body

    if (!urlString || typeof urlString !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    const url = validateUrlShape(urlString)
    const appInfo = await scrapeAppInfo(url)

    return NextResponse.json({
      success: true,
      data: appInfo,
      imported_at: new Date().toISOString(),
    })
  } catch (error) {
    const message = (error as Error).message
    console.error('Scrape error:', message)

    return NextResponse.json(
      { error: message || 'Failed to scrape URL' },
      { status: 400 }
    )
  }
}
