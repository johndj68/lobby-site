import type { NextConfig } from 'next'
import './env'

const SUPABASE_HOST = 'miugjafzptsdqzzgkbea.supabase.co'
const IS_PROD = process.env.NODE_ENV === 'production'

// Content-Security-Policy
// script-src uses 'unsafe-inline' because Next.js injects inline scripts for hydration.
// To remove 'unsafe-inline', implement nonce-based CSP via proxy.ts instead.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' https://js.stripe.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://${SUPABASE_HOST}`,
  `font-src 'self' data:`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://api.stripe.com https://hooks.stripe.com`,
  `frame-src https://js.stripe.com https://hooks.stripe.com`,
  `frame-ancestors 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `upgrade-insecure-requests`,
].join('; ')

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',   value: 'on' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
  },
  // HSTS: only in production — avoid breaking localhost dev
  ...(IS_PROD
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
  { key: 'Content-Security-Policy', value: csp },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    qualities: [100, 75],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: SUPABASE_HOST,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
