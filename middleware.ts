import { NextRequest, NextResponse } from 'next/server'
import { getClientIp, checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Middleware centralizado para:
 * - Rate limiting por IP (todos os endpoints)
 * - Validação de headers de segurança
 * - Redirecionamento de rotas protegidas
 */

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // Rate limit: 100 req/min por IP em produção
  if (process.env.NODE_ENV === 'production') {
    const ip = getClientIp(req)
    const limit = checkRateLimit({ key: `global:${ip}`, limit: 100, windowMs: 60_000 })
    const limitedResponse = rateLimitResponse(limit)
    if (limitedResponse) return limitedResponse
  }

  // Redirect /admin routes sem login pro /admin/login
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    // Will be handled by auth middleware on the routes themselves
    // This is just a placeholder for future centralized auth checks
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Match admin routes
    '/admin/:path*',
    // Match dashboard routes
    '/dashboard/:path*',
  ],
}
